document.addEventListener('DOMContentLoaded', () => {
    const gridElement = document.getElementById('crossword-grid');
    const acrossCluesList = document.getElementById('across-clues');
    const downCluesList = document.getElementById('down-clues');
    const timerDisplay = document.getElementById('timer');
    const finishGameBtn = document.getElementById('finishGameBtn');
    const gameSection = document.getElementById('game-section');
    const waitingForResultsSection = document.getElementById('waiting-for-results');
    const yourFinalResultsEl = document.getElementById('your-final-results');
    const opponentStatusEl = document.getElementById('opponent-status');
    const forfeitBtn = document.getElementById('forfeitBtn');

    const socket = io('https://crossword-project.onrender.com', {
        transports: ['websocket']
    });
    let crosswordData = null;
    let gameId = null;
    let timerInterval = null;
    let timeRemaining = 300; // 5 minutes in seconds

    function initializeGame() {
        gameId = sessionStorage.getItem('gameId');
        const storedData = sessionStorage.getItem('crosswordData');

        if (gameId) {
            socket.emit('rejoin-game', { gameId });
        }

        if (!gameId || !storedData) {
            alert('Could not find game data. Returning to homepage.');
            window.location.href = 'index.html';
            return;
        }

        crosswordData = JSON.parse(storedData);
        console.log('Starting 1v1 game with data:', crosswordData);

        renderCrossword(crosswordData.grid, crosswordData.clueNumbers, crosswordData.clues);
        startTimer();
    }

    function renderCrossword(grid, clueNumbers, clues) {
        gridElement.innerHTML = '';
        acrossCluesList.innerHTML = '';
        downCluesList.innerHTML = '';

        gridElement.style.gridTemplateColumns = `repeat(${grid[0].length}, 1fr)`;
        gridElement.style.gridTemplateRows = `repeat(${grid.length}, 1fr)`;

        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                const cellDiv = document.createElement('div');
                cellDiv.className = 'cell';

                if (grid[r][c] === ' ') {
                    cellDiv.classList.add('black');
                } else {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.maxLength = 1;
                    input.className = 'cell-input';
                    input.dataset.row = r;
                    input.dataset.col = c;
                    cellDiv.appendChild(input);

                    if (clueNumbers[r][c] > 0) {
                        const clueNumberSpan = document.createElement('span');
                        clueNumberSpan.className = 'clue-number';
                        clueNumberSpan.textContent = clueNumbers[r][c];
                        cellDiv.appendChild(clueNumberSpan);
                    }
                }
                gridElement.appendChild(cellDiv);
            }
        }

        clues.forEach(clue => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `<b>${clue.number}.</b> ${clue.text}`;
            if (clue.dir === 'A') {
                acrossCluesList.appendChild(listItem);
            } else {
                downCluesList.appendChild(listItem);
            }
        });
    }

    function startTimer() {
        timerInterval = setInterval(() => {
            timeRemaining--;
            const minutes = String(Math.floor(timeRemaining / 60)).padStart(2, '0');
            const seconds = String(timeRemaining % 60).padStart(2, '0');
            timerDisplay.textContent = `${minutes}:${seconds}`;

            if (timeRemaining <= 0) {
                endGame();
            }
        }, 1000);
    }

    function endGame() {
        if (timerInterval) clearInterval(timerInterval);

        gridElement.querySelectorAll('input').forEach(input => input.disabled = true);
        finishGameBtn.disabled = true;
        forfeitBtn.disabled = true;

        gameSection.style.display = 'none';
        waitingForResultsSection.style.display = 'block';

        let score = 0;
        for (const clue of crosswordData.clues) {
            let userWord = '';
            for (let i = 0; i < clue.length; i++) {
                let r = clue.row + (clue.dir === 'D' ? i : 0);
                let c = clue.col + (clue.dir === 'A' ? i : 0);
                const input = gridElement.querySelector(`input[data-row='${r}'][data-col='${c}']`);
                if (input) {
                    userWord += input.value.toUpperCase();
                }
            }
            if (userWord === clue.word.toUpperCase()) {
                score += 10;
            }
        }

        const timeTaken = 300 - timeRemaining;

        console.log(`Game finished. Score: ${score}, Time: ${timeTaken}s. Notifying server.`);
        yourFinalResultsEl.textContent = `You finished with a score of ${score} in ${timeTaken} seconds.`;
        opponentStatusEl.textContent = 'Opponent is still playing...';
        opponentStatusEl.style.display = 'block';

        socket.emit('player-finished', { gameId, score, timeTaken });
    }

    finishGameBtn.addEventListener('click', endGame);

    socket.on('game-over', (results) => {
        console.log('Game over. Results:', results);
        sessionStorage.setItem('1v1-results', JSON.stringify(results));
        sessionStorage.setItem('mySocketId', socket.id);
        sessionStorage.removeItem('gameId');
        sessionStorage.removeItem('crosswordData');
        window.location.href = '/results-1v1.html';
    });

    socket.on('opponent-finished', ({ score, timeTaken }) => {
        opponentStatusEl.textContent = `Your opponent has finished with a score of ${score} in ${timeTaken} seconds.`;
        opponentStatusEl.style.display = 'block';
    });

    const forfeitModal = document.getElementById('forfeitModal');
    const confirmForfeitBtn = document.getElementById('confirmForfeitBtn');
    const cancelForfeitBtn = document.getElementById('cancelForfeitBtn');

    forfeitBtn.addEventListener('click', () => {
        forfeitModal.style.display = 'flex';
    });

    cancelForfeitBtn.addEventListener('click', () => {
        forfeitModal.style.display = 'none';
    });

    confirmForfeitBtn.addEventListener('click', () => {
        forfeitModal.style.display = 'none';
        console.log("Forfeit confirmed via modal");
        console.log(`[DEBUG] Forfeiting game with gameId: ${gameId}`);
        socket.emit('player-forfeit', { gameId });
    });

    socket.on('opponent-disconnected', () => {
        sessionStorage.removeItem('gameId');
        sessionStorage.removeItem('crosswordData');
        alert('Your opponent has disconnected. You win!');
        window.location.href = '/';
    });

    socket.on('error', (message) => {
        alert(`A server error occurred: ${message}`);
        window.location.href = 'index.html';
    });

    initializeGame();
});