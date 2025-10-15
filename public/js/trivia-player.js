// Trivia Player JavaScript
class TriviaPlayer {
    constructor() {
        this.socket = io();
        this.playerName = '';
        this.roomCode = '';
        this.currentScore = 0;
        this.hasAnswered = false;
        this.gameState = 'joining';
        this.streak = 0;
        this.confetti = new Confetti();

        this.initializeEventHandlers();
        this.setupFormHandlers();
    }

    initializeEventHandlers() {
        // Socket event handlers
        this.socket.on('playerJoined', (data) => {
            this.showWaitingScreen();
            this.updatePlayerCount(data.players.length);
        });

        this.socket.on('newQuestion', (data) => {
            this.showQuestion(data);
        });

        this.socket.on('questionResults', (data) => {
            this.showQuestionResult(data);
        });

        this.socket.on('gameFinished', (data) => {
            this.showFinalResults(data.finalScores);
        });

        this.socket.on('playerLeft', (data) => {
            this.updatePlayerCount(data.players.length);
        });

        this.socket.on('hostDisconnected', () => {
            this.showError('Host disconnected. Game ended.');
        });

        this.socket.on('disconnect', () => {
            if (this.gameState !== 'joining') {
                this.showError('Connection lost. Please check your internet connection.');
            }
        });

        this.socket.on('reconnect', () => {
            if (this.gameState !== 'joining') {
                // Try to rejoin the room
                this.attemptRejoin();
            }
        });

        this.socket.on('gameEnded', (data) => {
            this.showFinalResults(data.finalScores);
        });
    }

    setupFormHandlers() {
        const roomCodeInput = document.getElementById('roomCodeInput');
        const playerNameInput = document.getElementById('playerNameInput');

        // Auto-uppercase room code and limit to 6 characters
        roomCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
        });

        // Limit player name and prevent special characters
        playerNameInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 20);
        });

        // Handle Enter key on inputs
        roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                playerNameInput.focus();
            }
        });

        playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinRoom();
            }
        });

        // Auto-focus room code input
        roomCodeInput.focus();
    }

    joinRoom() {
        const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
        const playerName = document.getElementById('playerNameInput').value.trim();

        // Validation
        if (!roomCode || roomCode.length !== 6) {
            this.showError('Please enter a valid 6-character room code.');
            return;
        }

        if (!playerName || playerName.length < 2) {
            this.showError('Please enter a name with at least 2 characters.');
            return;
        }

        this.roomCode = roomCode;
        this.playerName = playerName;

        // Show loading state
        this.updateStatus('Joining room...');

        // Attempt to join
        this.socket.emit('joinRoom', {
            roomCode: roomCode,
            playerName: playerName
        }, (response) => {
            if (response.success) {
                this.gameState = 'waiting';
                this.showWaitingScreen();
                this.updatePlayerCount(response.room.players.length);
            } else {
                this.showError(response.error);
            }
        });
    }

    attemptRejoin() {
        if (this.roomCode && this.playerName) {
            this.socket.emit('joinRoom', {
                roomCode: this.roomCode,
                playerName: this.playerName
            }, (response) => {
                if (!response.success) {
                    this.showError('Could not reconnect to game: ' + response.error);
                }
            });
        }
    }

    showWaitingScreen() {
        document.getElementById('joinForm').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('waitingMessage').style.display = 'block';
        document.getElementById('joinedRoomCode').textContent = this.roomCode;
        this.updateStatus('Joined successfully! Waiting for game to start...');
    }

    updatePlayerCount(count) {
        const playerCountDisplay = document.getElementById('playerCountDisplay');
        if (playerCountDisplay) {
            playerCountDisplay.textContent = count;
        }
    }

    showQuestion(data) {
        this.gameState = 'playing';
        this.hasAnswered = false;

        // Hide other screens
        document.getElementById('waitingMessage').style.display = 'none';
        document.getElementById('resultMessage').style.display = 'none';

        // Show question container
        document.getElementById('questionContainer').style.display = 'block';
        document.getElementById('playerScore').style.display = 'block';

        // Show/hide bonus round badge
        const bonusBadge = document.getElementById('playerBonusBadge');
        if (data.isBonusRound) {
            bonusBadge.style.display = 'block';
        } else {
            bonusBadge.style.display = 'none';
        }

        // Update question info
        document.getElementById('questionNumber').textContent = data.questionNumber;
        document.getElementById('totalQuestions').textContent = data.totalQuestions;
        document.getElementById('questionText').textContent = data.question.question;

        // Create answer buttons
        const answerButtons = document.getElementById('answerButtons');
        answerButtons.innerHTML = data.question.answers.map((answer, index) => `
            <button class="mobile-answer" onclick="submitAnswer(${index})" data-index="${index}">
                ${String.fromCharCode(65 + index)}. ${answer}
            </button>
        `).join('');

        // Start timer
        this.startQuestionTimer(data.timeLimit);

        // Update status
        this.updateStatus('Question ' + data.questionNumber + ' of ' + data.totalQuestions);
    }

    startQuestionTimer(timeLimit) {
        let timeLeft = timeLimit;
        const timerElement = document.getElementById('questionTimer');

        this.questionTimer = setInterval(() => {
            timerElement.textContent = timeLeft;

            if (timeLeft <= 5) {
                timerElement.classList.add('warning');
            }

            timeLeft--;

            if (timeLeft < 0) {
                clearInterval(this.questionTimer);
                timerElement.textContent = '0';
                this.disableAnswers();
            }
        }, 1000);
    }

    submitAnswer(answerIndex) {
        if (this.hasAnswered) return;

        this.hasAnswered = true;

        // Visual feedback
        const answerButtons = document.querySelectorAll('.mobile-answer');
        answerButtons.forEach((btn, index) => {
            if (index === answerIndex) {
                btn.classList.add('selected');
            }
            btn.classList.add('disabled');
        });

        // Submit to server
        this.socket.emit('submitAnswer', {
            roomCode: this.roomCode,
            answerIndex: answerIndex
        }, (response) => {
            if (response.success) {
                this.updateStatus('Answer submitted! Waiting for results...');
                // Add haptic feedback on mobile
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            }
        });

        // Clear timer
        if (this.questionTimer) {
            clearInterval(this.questionTimer);
        }
    }

    disableAnswers() {
        const answerButtons = document.querySelectorAll('.mobile-answer');
        answerButtons.forEach(btn => {
            btn.classList.add('disabled');
            btn.onclick = null;
        });

        if (!this.hasAnswered) {
            this.updateStatus('Time\'s up!');
        }
    }

    showQuestionResult(data) {
        // Hide question
        document.getElementById('questionContainer').style.display = 'none';

        // Find my result
        const myResult = data.playerAnswers.find(answer => answer.playerName === this.playerName);

        if (myResult) {
            const isCorrect = myResult.isCorrect;
            const points = myResult.points;

            // Update score
            this.currentScore += points;
            document.getElementById('currentScore').textContent = this.currentScore;

            // Update streak
            if (isCorrect) {
                this.streak++;
                this.confetti.burst();

                // Show streak indicator if 2 or more
                if (this.streak >= 2) {
                    const streakIndicator = document.getElementById('streakIndicator');
                    const streakCount = document.getElementById('streakCount');
                    streakCount.textContent = this.streak;
                    streakIndicator.style.display = 'block';

                    if (this.streak >= 3) {
                        streakIndicator.classList.add('fire');
                    }
                }
            } else {
                this.streak = 0;
                document.getElementById('streakIndicator').style.display = 'none';
            }

            // Show result message
            const resultMessage = document.getElementById('resultMessage');
            const resultText = document.getElementById('resultText');
            const scoreChange = document.getElementById('scoreChange');

            resultMessage.className = 'status-message ' + (isCorrect ? 'correct' : 'incorrect');
            resultText.textContent = isCorrect ? (this.streak >= 3 ? 'ON FIRE! 🔥' : 'Correct!') : 'Incorrect';
            scoreChange.textContent = isCorrect ? `+${points} points` : '+0 points';
            scoreChange.className = isCorrect ? 'score-change-positive' : '';

            resultMessage.style.display = 'block';
        } else {
            // Player didn't answer
            this.streak = 0;
            document.getElementById('streakIndicator').style.display = 'none';

            const resultMessage = document.getElementById('resultMessage');
            const resultText = document.getElementById('resultText');
            const scoreChange = document.getElementById('scoreChange');

            resultMessage.className = 'status-message incorrect';
            resultText.textContent = 'No answer submitted';
            scoreChange.textContent = '+0 points';

            resultMessage.style.display = 'block';
        }

        // Update ranking
        this.updatePlayerRank(data.currentScores);

        // Show correct answer
        setTimeout(() => {
            this.updateStatus(`Correct answer: ${data.correctAnswer}`);
        }, 2000);
    }

    updatePlayerRank(scores) {
        const myRank = scores.findIndex(score => score.playerName === this.playerName) + 1;
        const totalPlayers = scores.length;

        const playerRank = document.getElementById('playerRank');
        if (playerRank) {
            if (myRank === 1 && totalPlayers > 1) {
                playerRank.textContent = `🏆 1st place of ${totalPlayers}`;
            } else if (myRank === 2) {
                playerRank.textContent = `🥈 2nd place of ${totalPlayers}`;
            } else if (myRank === 3) {
                playerRank.textContent = `🥉 3rd place of ${totalPlayers}`;
            } else {
                playerRank.textContent = `${myRank}${this.getOrdinalSuffix(myRank)} place of ${totalPlayers}`;
            }
        }
    }

    getOrdinalSuffix(num) {
        const j = num % 10;
        const k = num % 100;
        if (j === 1 && k !== 11) return 'st';
        if (j === 2 && k !== 12) return 'nd';
        if (j === 3 && k !== 13) return 'rd';
        return 'th';
    }

    showFinalResults(scores) {
        this.gameState = 'finished';

        // Hide other screens
        document.getElementById('questionContainer').style.display = 'none';
        document.getElementById('resultMessage').style.display = 'none';
        document.getElementById('playerScore').style.display = 'none';
        document.getElementById('streakIndicator').style.display = 'none';

        // Find my final position
        const myPosition = scores.findIndex(score => score.playerName === this.playerName) + 1;
        const totalPlayers = scores.length;

        // Show final results
        const gameFinished = document.getElementById('gameFinished');
        const finalResult = document.getElementById('finalResult');

        let resultText = '';
        if (myPosition === 1 && totalPlayers > 1) {
            resultText = '🏆 Congratulations! You won!';
            // Winner gets confetti
            setTimeout(() => this.confetti.burst(), 300);
            setTimeout(() => this.confetti.burst(), 800);
            setTimeout(() => this.confetti.burst(), 1300);
        } else if (myPosition === 2) {
            resultText = '🥈 Great job! You came in 2nd place!';
            setTimeout(() => this.confetti.burst(), 500);
        } else if (myPosition === 3) {
            resultText = '🥉 Well done! You came in 3rd place!';
        } else {
            resultText = `You finished in ${myPosition}${this.getOrdinalSuffix(myPosition)} place`;
        }

        resultText += `<br><strong>Final Score: ${this.currentScore} points</strong>`;

        finalResult.innerHTML = resultText;
        gameFinished.style.display = 'block';

        this.updateStatus('Game complete!');
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').style.display = 'block';
        document.getElementById('joinForm').style.display = 'none';
        document.getElementById('waitingMessage').style.display = 'none';
        this.updateStatus('Error occurred');
    }

    updateStatus(status) {
        document.getElementById('playerStatus').textContent = status;
    }

    resetToJoin() {
        this.gameState = 'joining';
        this.roomCode = '';
        this.playerName = '';
        this.currentScore = 0;
        this.hasAnswered = false;
        this.streak = 0;

        // Reset form
        document.getElementById('roomCodeInput').value = '';
        document.getElementById('playerNameInput').value = '';

        // Show join form
        document.getElementById('joinForm').style.display = 'block';
        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('waitingMessage').style.display = 'none';
        document.getElementById('questionContainer').style.display = 'none';
        document.getElementById('resultMessage').style.display = 'none';
        document.getElementById('playerScore').style.display = 'none';
        document.getElementById('gameFinished').style.display = 'none';
        document.getElementById('streakIndicator').style.display = 'none';

        this.updateStatus('Ready to join a game!');

        // Focus room code input
        document.getElementById('roomCodeInput').focus();
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
        const particleCount = 30;
        const colors = ['#0f4c81', '#2c5aa0', '#ffd700', '#ff6b6b', '#51cf66', '#ff8e53'];

        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: this.canvas.width / 2,
                y: this.canvas.height / 3,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12 - 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 8 + 4,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 8,
                opacity: 1,
                gravity: 0.4
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

// Global functions for onclick handlers
function joinRoom() {
    window.triviaPlayer.joinRoom();
}

function submitAnswer(answerIndex) {
    window.triviaPlayer.submitAnswer(answerIndex);
}

function resetToJoin() {
    window.triviaPlayer.resetToJoin();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.triviaPlayer = new TriviaPlayer();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.triviaPlayer) {
        // Page became visible - check connection
        if (window.triviaPlayer.gameState !== 'joining' && !window.triviaPlayer.socket.connected) {
            window.triviaPlayer.showError('Connection lost. Please refresh the page.');
        }
    }
});

// Prevent accidental navigation during game
window.addEventListener('beforeunload', (e) => {
    if (window.triviaPlayer && window.triviaPlayer.gameState === 'playing') {
        e.preventDefault();
        e.returnValue = 'Game in progress. Are you sure you want to leave?';
        return 'Game in progress. Are you sure you want to leave?';
    }
});