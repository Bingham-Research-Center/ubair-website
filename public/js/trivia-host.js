// Trivia Host JavaScript
class TriviaHost {
    constructor() {
        this.socket = io();
        this.roomCode = null;
        this.gameState = 'waiting';
        this.currentTimer = null;
        this.totalPlayers = 0;
        this.answeredCount = 0;
        this.confetti = new Confetti();

        this.initializeEventHandlers();
        this.createRoom();
    }

    initializeEventHandlers() {
        // Socket event handlers
        this.socket.on('playerJoined', (data) => {
            this.updatePlayersList(data.players);
        });

        this.socket.on('playerLeft', (data) => {
            this.updatePlayersList(data.players);
        });

        this.socket.on('newQuestion', (data) => {
            this.showQuestion(data);
        });

        this.socket.on('questionResults', (data) => {
            this.showResults(data);
        });

        this.socket.on('gameFinished', (data) => {
            this.showFinalScores(data.finalScores);
        });

        this.socket.on('playerAnswered', (data) => {
            this.updateAnswerCount(data.answeredCount, data.totalPlayers);
        });

        this.socket.on('hostDisconnected', () => {
            alert('Host connection lost. Please refresh the page.');
        });

        this.socket.on('gameEnded', (data) => {
            this.showFinalScores(data.finalScores);
        });
    }

    createRoom() {
        this.socket.emit('createRoom', (response) => {
            if (response.success) {
                this.roomCode = response.roomCode;
                this.showRoomCode();
            } else {
                alert('Failed to create room: ' + response.error);
            }
        });
    }

    showRoomCode() {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('roomCodeDisplay').style.display = 'block';
        document.getElementById('playersWaiting').style.display = 'block';
        document.getElementById('gameSettings').style.display = 'block';
        document.getElementById('roomCode').textContent = this.roomCode;
    }

    updatePlayersList(players) {
        const playerList = document.getElementById('playerList');
        const playerCount = document.getElementById('playerCount');
        const startGameBtn = document.getElementById('startGameBtn');

        this.totalPlayers = players.length;
        playerCount.textContent = players.length;

        if (players.length > 0) {
            startGameBtn.disabled = false;
            startGameBtn.innerHTML = '<i class="fas fa-play"></i> Start Game';
        } else {
            startGameBtn.disabled = true;
        }

        playerList.innerHTML = players.map((player, index) => `
            <div class="player-item pulse-new" style="animation-delay: ${index * 0.1}s">
                <i class="fas fa-user"></i>
                <div>${player.name}</div>
            </div>
        `).join('');
    }

    updateAnswerCount(answeredCount, totalPlayers) {
        this.answeredCount = answeredCount;
        document.getElementById('answeredCount').textContent = answeredCount;
        document.getElementById('totalPlayers').textContent = totalPlayers;
    }

    showQuestion(data) {
        this.gameState = 'active';
        this.answeredCount = 0;

        // Hide waiting screen, settings, and room code
        document.getElementById('playersWaiting').style.display = 'none';
        document.getElementById('gameSettings').style.display = 'none';
        document.getElementById('resultsDisplay').style.display = 'none';
        document.getElementById('roomCodeDisplay').style.display = 'none';

        // Enter fullscreen if available
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log('Fullscreen request failed:', err);
            });
        }

        // Show question display
        document.getElementById('questionDisplay').style.display = 'block';

        // Check if bonus round (server tells us)
        const bonusBadge = document.getElementById('bonusRoundBadge');
        if (data.isBonusRound) {
            bonusBadge.style.display = 'block';
        } else {
            bonusBadge.style.display = 'none';
        }

        // Update question content
        document.getElementById('currentQuestion').textContent = data.questionNumber;
        document.getElementById('totalQuestions').textContent = data.totalQuestions;
        document.getElementById('questionText').textContent = data.question.question;

        // Initialize answer count
        document.getElementById('answeredCount').textContent = '0';
        document.getElementById('totalPlayers').textContent = this.totalPlayers;

        // Create answer options
        const answerOptions = document.getElementById('answerOptions');
        answerOptions.innerHTML = data.question.answers.map((answer, index) => `
            <div class="answer-option" data-index="${index}">
                ${String.fromCharCode(65 + index)}. ${answer}
            </div>
        `).join('');

        // Start timer
        this.startTimer(data.timeLimit);
    }

    startTimer(timeLimit) {
        let timeLeft = timeLimit;
        const timerElement = document.getElementById('timer');

        this.currentTimer = setInterval(() => {
            timerElement.textContent = timeLeft;

            if (timeLeft <= 5) {
                timerElement.classList.add('warning');
            } else {
                timerElement.classList.remove('warning');
            }

            timeLeft--;

            if (timeLeft < 0) {
                clearInterval(this.currentTimer);
                timerElement.textContent = '0';
            }
        }, 1000);
    }

    showResults(data) {
        // Clear timer
        if (this.currentTimer) {
            clearInterval(this.currentTimer);
        }

        // Hide question display
        document.getElementById('questionDisplay').style.display = 'none';

        // Show results
        document.getElementById('resultsDisplay').style.display = 'block';

        // Highlight correct answer with animation
        const answerOptions = document.querySelectorAll('.answer-option');
        answerOptions.forEach((option, index) => {
            if (index === data.correctIndex) {
                option.classList.add('correct');
                option.classList.add('correct-celebration');
            } else {
                option.classList.add('incorrect');
            }
        });

        // Trigger confetti if many players got it right
        const correctAnswers = data.playerAnswers.filter(a => a.isCorrect).length;
        if (correctAnswers > 0) {
            setTimeout(() => this.confetti.burst(), 500);
        }

        // Show question results
        const questionResults = document.getElementById('questionResults');
        questionResults.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <strong>Correct Answer:</strong> ${data.correctAnswer}
            </div>
            <div style="margin-bottom: 2rem;">
                <strong>Player Responses:</strong>
                ${data.playerAnswers.length === 0 ?
                    '<p style="color: #666; font-style: italic;">No players answered this question</p>' :
                    data.playerAnswers.map(answer => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; margin: 0.25rem 0; background: ${answer.isCorrect ? '#d4edda' : '#f8d7da'}; border-radius: 4px;">
                            <span>${answer.playerName}</span>
                            <span class="${answer.isCorrect ? 'score-change-positive' : ''}">${answer.isCorrect ? `+${answer.points} pts` : '0 pts'}</span>
                        </div>
                    `).join('')
                }
            </div>
            <div>
                <h4>Current Standings:</h4>
                ${data.currentScores.map((score, index) => `
                    <div class="score-item ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}">
                        <span>${index + 1}. ${score.playerName}</span>
                        <span>${score.score} pts</span>
                    </div>
                `).join('')}
            </div>
        `;

        // Start next question timer
        this.startNextQuestionTimer();
    }

    startNextQuestionTimer() {
        let timeLeft = 5;
        const timerElement = document.getElementById('nextQuestionTimer');

        const timer = setInterval(() => {
            timerElement.textContent = timeLeft;
            timeLeft--;

            if (timeLeft < 0) {
                clearInterval(timer);
            }
        }, 1000);
    }

    showFinalScores(scores) {
        // Hide all other displays
        document.getElementById('questionDisplay').style.display = 'none';
        document.getElementById('resultsDisplay').style.display = 'none';

        // Exit fullscreen when game ends
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(err => {
                console.log('Exit fullscreen failed:', err);
            });
        }

        // Show final scores
        document.getElementById('finalScores').style.display = 'block';

        const finalScoresList = document.getElementById('finalScoresList');
        finalScoresList.innerHTML = scores.map((score, index) => `
            <div class="score-item ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}">
                <span>
                    ${index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : ''}
                    ${index + 1}. ${score.playerName}
                </span>
                <span>${score.score} pts</span>
            </div>
        `).join('');

        this.gameState = 'finished';

        // Celebrate the winner with confetti
        setTimeout(() => this.confetti.burst(), 500);
        setTimeout(() => this.confetti.burst(), 1500);
    }
}

// Simple Confetti Effect Class
class Confetti {
    constructor() {
        this.canvas = document.getElementById('confettiCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.animationId = null;

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    burst() {
        const particleCount = 50;
        const colors = ['#0f4c81', '#2c5aa0', '#ffd700', '#ff6b6b', '#51cf66', '#ff8e53'];

        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: this.canvas.width / 2,
                y: this.canvas.height / 2,
                vx: (Math.random() - 0.5) * 15,
                vy: (Math.random() - 0.5) * 15 - 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 10 + 5,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10,
                opacity: 1,
                gravity: 0.5
            });
        }

        if (!this.animationId) {
            this.animate();
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Update position
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.rotation += p.rotationSpeed;
            p.opacity -= 0.01;

            // Remove if off screen or faded
            if (p.y > this.canvas.height || p.opacity <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Draw particle
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation * Math.PI / 180);
            this.ctx.globalAlpha = p.opacity;
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            this.ctx.restore();
        }

        if (this.particles.length > 0) {
            this.animationId = requestAnimationFrame(() => this.animate());
        } else {
            this.animationId = null;
        }
    }
}

// Game control functions
function startGame() {
    const host = window.triviaHost;

    // Get game settings
    const questionCount = document.getElementById('questionCount').value;
    const difficulty = document.getElementById('difficulty').value;

    // Update settings on server - category is null for mixed STEM
    // forceRefresh: true ensures new questions are fetched
    host.socket.emit('startGame', {
        roomCode: host.roomCode,
        settings: {
            questionCount: parseInt(questionCount),
            difficulty: difficulty,
            category: null // Mixed STEM categories
        },
        forceRefresh: true // Force new questions every game
    }, (response) => {
        if (!response.success) {
            alert('Failed to start game: ' + response.error);
        }
    });
}

function endGame() {
    const host = window.triviaHost;

    // Confirm before ending
    if (confirm('Are you sure you want to end the game? All progress will be lost.')) {
        host.socket.emit('endGame', {
            roomCode: host.roomCode
        }, (response) => {
            if (response && response.success) {
                console.log('Game ended successfully');
            }
        });
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.triviaHost = new TriviaHost();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden - you might want to pause timers
    } else {
        // Page is visible - resume if needed
    }
});

// Handle beforeunload
window.addEventListener('beforeunload', (e) => {
    if (window.triviaHost && window.triviaHost.gameState === 'active') {
        e.preventDefault();
        e.returnValue = 'Game in progress. Are you sure you want to leave?';
        return 'Game in progress. Are you sure you want to leave?';
    }
});