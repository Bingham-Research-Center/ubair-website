import { Server } from 'socket.io';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';

class TriviaGameService {
    constructor(httpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Game state management
        this.rooms = new Map();
        this.questionCache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour
        this.sessionTokens = new Map();

        // Rate limiting for OpenTDB API (5 second minimum between requests)
        this.lastApiCall = 0;

        this.setupSocketHandlers();
    }

    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async getSessionToken() {
        try {
            const response = await fetch('https://opentdb.com/api_token.php?command=request');
            const data = await response.json();
            return data.token;
        } catch (error) {
            console.error('Failed to get session token:', error);
            return null;
        }
    }

    async fetchQuestions(amount = 10, difficulty = 'medium', category = null) {
        // STEM categories - we'll fetch from multiple categories and combine
        const stemCategories = [
            17, // Science & Nature
            18, // Science: Computers
            19, // Science: Mathematics
            30  // Science: Gadgets
        ];

        // Inappropriate keywords to filter out (school-safe content)
        const inappropriateKeywords = [
            'drug', 'drugs', 'marijuana', 'cannabis', 'cocaine', 'heroin', 'meth',
            'alcohol', 'beer', 'wine', 'vodka', 'whiskey', 'drunk',
            'sex', 'sexual', 'porn', 'xxx',
            'kill', 'murder', 'suicide', 'death penalty',
            'nazi', 'hitler', 'genocide',
            'weapon', 'gun', 'rifle', 'bomb'
        ];

        // Create cache key
        const cacheKey = `${amount}-${difficulty}-mixed-stem`;
        const cached = this.questionCache.get(cacheKey);

        if (cached) {
            return cached;
        }

        let allQuestions = [];
        const questionsPerCategory = Math.ceil(amount / stemCategories.length);

        // Rate limiting - ensure 5 seconds between API calls
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCall;
        if (timeSinceLastCall < 5000) {
            await new Promise(resolve => setTimeout(resolve, 5000 - timeSinceLastCall));
        }

        try {
            // Fetch questions from each STEM category
            for (const cat of stemCategories) {
                try {
                    let url = `https://opentdb.com/api.php?amount=${questionsPerCategory}&difficulty=${difficulty}&type=multiple&category=${cat}`;

                    // Get session token if we don't have one
                    if (!this.sessionTokens.has('current')) {
                        const token = await this.getSessionToken();
                        if (token) {
                            this.sessionTokens.set('current', token);
                            url += `&token=${token}`;
                        }
                    } else {
                        url += `&token=${this.sessionTokens.get('current')}`;
                    }

                    this.lastApiCall = Date.now();
                    const response = await fetch(url);
                    const data = await response.json();

                    if (data.response_code === 0 && data.results) {
                        // Filter out inappropriate questions
                        const filteredQuestions = data.results.filter(q => {
                            const combinedText = `${q.question} ${q.correct_answer} ${q.incorrect_answers.join(' ')}`.toLowerCase();
                            return !inappropriateKeywords.some(keyword => combinedText.includes(keyword));
                        });

                        allQuestions.push(...filteredQuestions);
                    } else if (data.response_code === 4) {
                        // Token expired, get new one
                        const newToken = await this.getSessionToken();
                        if (newToken) {
                            this.sessionTokens.set('current', newToken);
                        }
                    }

                    // Small delay between category requests
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error(`Failed to fetch from category ${cat}:`, error);
                    // Continue to next category
                }
            }

            // Shuffle and limit to requested amount
            allQuestions = allQuestions
                .sort(() => Math.random() - 0.5)
                .slice(0, amount);

            // Process questions to decode HTML entities and shuffle answers
            const processedQuestions = allQuestions.map(q => this.processQuestion(q));

            // Only cache if we got enough questions
            if (processedQuestions.length >= amount * 0.8) {
                this.questionCache.set(cacheKey, processedQuestions);
            }

            if (processedQuestions.length === 0) {
                throw new Error('No appropriate questions found');
            }

            return processedQuestions;
        } catch (error) {
            console.error('Failed to fetch questions:', error);
            throw error;
        }
    }

    processQuestion(question) {
        // Decode HTML entities
        const decodeHtml = (str) => {
            return str
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ');
        };

        const allAnswers = [
            question.correct_answer,
            ...question.incorrect_answers
        ].map(decodeHtml);

        // Shuffle answers
        const shuffledAnswers = allAnswers.sort(() => Math.random() - 0.5);

        return {
            category: decodeHtml(question.category),
            difficulty: question.difficulty,
            question: decodeHtml(question.question),
            correctAnswer: decodeHtml(question.correct_answer),
            answers: shuffledAnswers,
            correctIndex: shuffledAnswers.indexOf(decodeHtml(question.correct_answer))
        };
    }

    createRoom(hostSocketId) {
        const roomCode = this.generateRoomCode();
        const room = {
            code: roomCode,
            hostSocketId,
            players: new Map(),
            gameState: 'waiting', // waiting, active, finished
            questions: [],
            currentQuestionIndex: -1,
            currentQuestion: null,
            scores: new Map(),
            settings: {
                questionCount: 10,
                difficulty: 'medium',
                category: null, // Mixed STEM categories
                timePerQuestion: 15 // seconds
            },
            questionStartTime: null,
            playerAnswers: new Map()
        };

        this.rooms.set(roomCode, room);
        return room;
    }

    joinRoom(roomCode, playerSocketId, playerName) {
        const room = this.rooms.get(roomCode);
        if (!room) {
            throw new Error('Room not found');
        }

        if (room.gameState !== 'waiting') {
            throw new Error('Game already in progress');
        }

        if (room.players.size >= 8) { // Max 8 players
            throw new Error('Room is full');
        }

        // Check if name is already taken
        for (const [, player] of room.players) {
            if (player.name.toLowerCase() === playerName.toLowerCase()) {
                throw new Error('Name already taken');
            }
        }

        const player = {
            socketId: playerSocketId,
            name: playerName,
            score: 0,
            isReady: false
        };

        room.players.set(playerSocketId, player);
        room.scores.set(playerSocketId, 0);

        return room;
    }

    async startGame(roomCode, settings, forceRefresh = false) {
        const room = this.rooms.get(roomCode);
        if (!room) {
            throw new Error('Room not found');
        }

        if (room.players.size < 1) {
            throw new Error('Need at least 1 player to start');
        }

        // Update room settings if provided
        if (settings) {
            room.settings = { ...room.settings, ...settings };
        }

        try {
            // Clear cache if force refresh requested (ensures fresh questions every game)
            if (forceRefresh) {
                const cacheKey = `${room.settings.questionCount}-${room.settings.difficulty}-mixed-stem`;
                this.questionCache.del(cacheKey);
            }

            // Fetch questions
            room.questions = await this.fetchQuestions(
                room.settings.questionCount,
                room.settings.difficulty,
                room.settings.category
            );

            room.gameState = 'active';
            room.currentQuestionIndex = -1;

            // Start first question
            this.nextQuestion(roomCode);

            return room;
        } catch (error) {
            throw new Error(`Failed to start game: ${error.message}`);
        }
    }

    endGame(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) {
            throw new Error('Room not found');
        }

        // Set game state to finished
        room.gameState = 'finished';

        // Send final scores to all clients
        this.io.to(roomCode).emit('gameEnded', {
            finalScores: this.getFinalScores(room)
        });

        return true;
    }

    nextQuestion(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        room.currentQuestionIndex++;

        if (room.currentQuestionIndex >= room.questions.length) {
            // Game finished
            room.gameState = 'finished';
            this.io.to(roomCode).emit('gameFinished', {
                finalScores: this.getFinalScores(room)
            });
            return;
        }

        room.currentQuestion = room.questions[room.currentQuestionIndex];
        room.questionStartTime = Date.now();
        room.playerAnswers.clear();

        // Check if this is a bonus round (every 5th question)
        const questionNumber = room.currentQuestionIndex + 1;
        const isBonusRound = questionNumber % 5 === 0;

        // Send question to host and players
        this.io.to(roomCode).emit('newQuestion', {
            questionNumber: questionNumber,
            totalQuestions: room.questions.length,
            question: room.currentQuestion,
            timeLimit: room.settings.timePerQuestion,
            isBonusRound: isBonusRound
        });

        // Auto-advance to next question after time limit
        setTimeout(() => {
            this.endQuestion(roomCode);
        }, room.settings.timePerQuestion * 1000);
    }

    submitAnswer(roomCode, playerSocketId, answerIndex) {
        const room = this.rooms.get(roomCode);
        if (!room || room.gameState !== 'active' || !room.currentQuestion) {
            return false;
        }

        // Check if player already answered
        if (room.playerAnswers.has(playerSocketId)) {
            return false;
        }

        const responseTime = Date.now() - room.questionStartTime;
        const isCorrect = answerIndex === room.currentQuestion.correctIndex;

        // Calculate score (base points + time bonus)
        let points = 0;
        if (isCorrect) {
            const basePoints = 1000;
            const timeBonus = Math.max(0, (room.settings.timePerQuestion * 1000 - responseTime) / 100);
            points = Math.floor(basePoints + timeBonus);

            // Bonus round: double points (every 5th question: 5, 10, 15, 20)
            const questionNumber = room.currentQuestionIndex + 1; // Convert to 1-indexed
            if (questionNumber % 5 === 0) {
                points *= 2;
            }
        }

        room.playerAnswers.set(playerSocketId, {
            answerIndex,
            isCorrect,
            responseTime,
            points
        });

        // Update total score
        const currentScore = room.scores.get(playerSocketId) || 0;
        room.scores.set(playerSocketId, currentScore + points);

        // Notify room of answer count update
        this.io.to(roomCode).emit('playerAnswered', {
            answeredCount: room.playerAnswers.size,
            totalPlayers: room.players.size
        });

        return true;
    }

    endQuestion(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room || !room.currentQuestion) return;

        // Send results to all clients
        const results = {
            correctAnswer: room.currentQuestion.correctAnswer,
            correctIndex: room.currentQuestion.correctIndex,
            playerAnswers: Array.from(room.playerAnswers.entries()).map(([socketId, answer]) => {
                const player = room.players.get(socketId);
                return {
                    playerName: player?.name || 'Unknown',
                    ...answer
                };
            }),
            currentScores: this.getCurrentScores(room)
        };

        this.io.to(roomCode).emit('questionResults', results);

        // Start next question after a delay
        setTimeout(() => {
            this.nextQuestion(roomCode);
        }, 5000); // 5 second delay between questions
    }

    getCurrentScores(room) {
        return Array.from(room.scores.entries()).map(([socketId, score]) => {
            const player = room.players.get(socketId);
            return {
                playerName: player?.name || 'Unknown',
                score
            };
        }).sort((a, b) => b.score - a.score);
    }

    getFinalScores(room) {
        return this.getCurrentScores(room);
    }

    removePlayer(roomCode, playerSocketId) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        room.players.delete(playerSocketId);
        room.scores.delete(playerSocketId);
        room.playerAnswers.delete(playerSocketId);

        // If no players left, remove room
        if (room.players.size === 0) {
            this.rooms.delete(roomCode);
        }
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            // Host creates a room
            socket.on('createRoom', (callback) => {
                try {
                    const room = this.createRoom(socket.id);
                    socket.join(room.code);
                    callback({ success: true, roomCode: room.code });
                } catch (error) {
                    callback({ success: false, error: error.message });
                }
            });

            // Player joins a room
            socket.on('joinRoom', (data, callback) => {
                try {
                    const { roomCode, playerName } = data;
                    const room = this.joinRoom(roomCode, socket.id, playerName);
                    socket.join(roomCode);

                    // Notify all clients in room
                    this.io.to(roomCode).emit('playerJoined', {
                        players: Array.from(room.players.values())
                    });

                    callback({ success: true, room: this.getRoomInfo(room) });
                } catch (error) {
                    callback({ success: false, error: error.message });
                }
            });

            // Host starts the game
            socket.on('startGame', async (data, callback) => {
                try {
                    const { roomCode, settings, forceRefresh } = data;
                    const room = await this.startGame(roomCode, settings, forceRefresh);
                    callback({ success: true });
                } catch (error) {
                    callback({ success: false, error: error.message });
                }
            });

            // Host ends the game
            socket.on('endGame', (data, callback) => {
                try {
                    const { roomCode } = data;
                    this.endGame(roomCode);
                    callback({ success: true });
                } catch (error) {
                    callback({ success: false, error: error.message });
                }
            });

            // Player submits an answer
            socket.on('submitAnswer', (data, callback) => {
                const { roomCode, answerIndex } = data;
                const success = this.submitAnswer(roomCode, socket.id, answerIndex);
                callback({ success });
            });

            // Get room info
            socket.on('getRoomInfo', (roomCode, callback) => {
                const room = this.rooms.get(roomCode);
                if (room) {
                    callback({ success: true, room: this.getRoomInfo(room) });
                } else {
                    callback({ success: false, error: 'Room not found' });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);

                // Remove player from all rooms
                for (const [roomCode, room] of this.rooms) {
                    if (room.players.has(socket.id)) {
                        this.removePlayer(roomCode, socket.id);
                        this.io.to(roomCode).emit('playerLeft', {
                            players: Array.from(room.players.values())
                        });
                    }

                    // If host disconnects, notify room
                    if (room.hostSocketId === socket.id) {
                        this.io.to(roomCode).emit('hostDisconnected');
                        this.rooms.delete(roomCode);
                    }
                }
            });
        });
    }

    getRoomInfo(room) {
        return {
            code: room.code,
            gameState: room.gameState,
            players: Array.from(room.players.values()),
            currentQuestion: room.currentQuestion,
            questionNumber: room.currentQuestionIndex + 1,
            totalQuestions: room.questions.length,
            scores: this.getCurrentScores(room)
        };
    }
}

export default TriviaGameService;