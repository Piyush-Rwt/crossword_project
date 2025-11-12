document.addEventListener('DOMContentLoaded', () => {
    const gridElement = document.getElementById('crossword-grid');
    const acrossCluesList = document.getElementById('across-clues');
    const downCluesList = document.getElementById('down-clues');
    const scoresTableBody = document.querySelector('#scores-table tbody');
    const timerDisplay = document.getElementById('timer');
    const endGameBtn = document.getElementById('end-game');

    const gameSection = document.getElementById('game-section');

    let currentPlayerName = '';
    let currentScore = 0;
    let wordsSolved = {}; // { word_id: true/false }
    let crosswordData = null; // To store the fetched crossword data

    // Timer variables
    let timerStarted = false;
    let startTime = null;
    let timerInterval = null;

    // Function to update timer display
    function updateTimerDisplay() {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        if (timerDisplay) {
            timerDisplay.textContent = `${minutes}:${seconds}`;
        }
    }

    // Function to initialize the game (fetch crossword, generate grid, etc.)
    async function initializeGame() {
        if (gridElement) {
            try {
                const response = await fetch('/api/generateCrossword');
                if (!response.ok) {
                    if (response.status === 401) { // If not authorized, redirect to login
                        window.location.href = '/login';
                        return;
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                crosswordData = await response.json();
                console.log('Crossword Data:', crosswordData);

                // Clear previous grid and clues
                gridElement.innerHTML = '';
                acrossCluesList.innerHTML = '';
                downCluesList.innerHTML = '';

                generateGrid(crosswordData.grid, crosswordData.clueNumbers);
                populateClues(crosswordData.clues);

                // Start the timer automatically
                if (!timerStarted) {
                    timerStarted = true;
                    startTime = Date.now();
                    timerInterval = setInterval(updateTimerDisplay, 1000);
                }

            } catch (error) {
                console.error('Error fetching or generating crossword:', error);
                alert('Failed to generate crossword. Please try again.');
                gameSection.style.display = 'none';
            }
        }
    }

    // Check session status and start the game
    (async () => {
        try {
            const response = await fetch('/api/session/status');
            const data = await response.json();

            if (data.loggedIn) {
                currentPlayerName = data.user.username;
                gameSection.style.display = 'block';
                initializeGame();
            } else {
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('Error checking session status:', error);
            window.location.href = '/login';
        }
    })();

    // Render grid with letters and clue numbers
    function generateGrid(grid, clueNumbers) {
        gridElement.style.gridTemplateColumns = `repeat(${grid[0].length}, 1fr)`;
        gridElement.style.gridTemplateRows = `repeat(${grid.length}, 1fr)`;


        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                const cellDiv = document.createElement('div');
                cellDiv.className = 'cell';
                cellDiv.dataset.row = r;
                cellDiv.dataset.col = c;

                if (grid[r][c] === ' ') { // Black cell
                    cellDiv.classList.add('black');
                } else {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.maxLength = 1;
                    input.className = 'cell-input';
                    input.dataset.row = r;
                    input.dataset.col = c;
                    input.value = ''; // Ensure grid is empty on start


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
    }

    // Populate clues list
    function populateClues(clues) {
        clues.forEach(clue => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `<b>${clue.number}.</b> ${clue.text}`;
            listItem.dataset.wordId = clue.word_id;
            listItem.dataset.direction = clue.dir;
            listItem.dataset.length = clue.length;

            if (clue.dir === 'A') {
                acrossCluesList.appendChild(listItem);
            } else {
                downCluesList.appendChild(listItem);
            }
        });
    }

    const gameModal = document.getElementById('game-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');

    function showModal(title, message, options = {}) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        modalConfirmBtn.textContent = options.confirmText || 'OK';
        modalCancelBtn.style.display = options.showCancel ? 'inline-block' : 'none';

        gameModal.style.display = 'flex';

        return new Promise((resolve) => {
            modalConfirmBtn.onclick = () => {
                gameModal.style.display = 'none';
                resolve(true);
            };
            modalCancelBtn.onclick = () => {
                gameModal.style.display = 'none';
                resolve(false);
            };
        });
    }

    // Handle answer submission
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            if (!crosswordData || !crosswordData.clues) return;

            for (const clue of crosswordData.clues) {
                const wordId = clue.word_id;
                const cells = Array.from(gridElement.querySelectorAll(`.cell-input[data-row][data-col]`));
                let userWord = '';

                for (let i = 0; i < clue.length; i++) {
                    let r = clue.row + (clue.dir === 'D' ? i : 0);
                    let c = clue.col + (clue.dir === 'A' ? i : 0);
                    const cellInput = cells.find(input => parseInt(input.dataset.row) === r && parseInt(input.dataset.col) === c);
                    if (cellInput) {
                        userWord += cellInput.value.toUpperCase();
                    } else {
                        userWord += ' ';
                    }
                }

                if (userWord.length === clue.length && userWord.includes(' ')) {
                    continue;
                }

                try {
                    const response = await fetch('/api/checkAnswer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ word_id: wordId, user_word: userWord })
                    });
                    const result = await response.json();

                    if (result.correct) {
                        if (!wordsSolved[wordId]) {
                            currentScore += result.scoreDelta;
                            wordsSolved[wordId] = true;
                            for (let i = 0; i < clue.length; i++) {
                                let r = clue.row + (clue.dir === 'D' ? i : 0);
                                let c = clue.col + (clue.dir === 'A' ? i : 0);
                                const cellInput = cells.find(input => parseInt(input.dataset.row) === r && parseInt(input.dataset.col) === c);
                                if (cellInput) {
                                    cellInput.style.backgroundColor = '#e6ffe6';
                                }
                            }
                            const clueListItem = document.querySelector(`li[data-word-id="${wordId}"]`);
                            if (clueListItem) clueListItem.style.color = 'green';
                        }
                    } else {
                        for (let i = 0; i < clue.length; i++) {
                            let r = clue.row + (clue.dir === 'D' ? i : 0);
                            let c = clue.col + (clue.dir === 'A' ? i : 0);
                            const cellInput = cells.find(input => parseInt(input.dataset.row) === r && parseInt(input.dataset.col) === c);
                            if (cellInput && !wordsSolved[wordId]) {
                                cellInput.style.backgroundColor = '#ffe6e6';
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error checking answer:', error);
                }
            }
            showModal('Current Score', `Your score is: ${currentScore}`);
        });
    }

    // Handle End Game button click
    if (endGameBtn) {
        endGameBtn.addEventListener('click', async () => {
            if (timerInterval) clearInterval(timerInterval);
            const timeTaken = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

            const solvedWordsArray = Object.keys(wordsSolved).filter(id => wordsSolved[id]).map(id => parseInt(id));

            try {
                const response = await fetch('/api/endGame', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        playerName: currentPlayerName,
                        score: currentScore,
                        timeTaken: timeTaken,
                        wordsSolved: solvedWordsArray
                    })
                });
                const result = await response.json();
                if (response.ok) {
                    await showModal('Game Saved!', `Final Score: ${currentScore}, Time: ${timeTaken}s`);
                    window.location.href = 'result.html';
                } else {
                    showModal('Error', `Failed to save game: ${result.error}`);
                }
            } catch (error) {
                console.error('Error saving game:', error);
                showModal('Error', 'An error occurred while saving the game.');
            }
        });
    }

    // Handle Show Answers button click
    const showAnswersBtn = document.getElementById('show-answers-btn');
    if (showAnswersBtn) {
        showAnswersBtn.addEventListener('click', async () => {
            if (!crosswordData || !crosswordData.grid) {
                showModal('Error', 'No crossword data available to show answers.');
                return;
            }

            const confirmed = await showModal('Confirm', 'Are you sure you want to reveal all answers?', { showCancel: true });
            if (!confirmed) {
                return;
            }

            const grid = crosswordData.grid;
            const cells = Array.from(gridElement.querySelectorAll('.cell-input'));

            for (let r = 0; r < grid.length; r++) {
                for (let c = 0; c < grid[r].length; c++) {
                    if (grid[r][c] !== ' ') {
                        const cellInput = cells.find(input => parseInt(input.dataset.row) === r && parseInt(input.dataset.col) === c);
                        if (cellInput) {
                            cellInput.value = grid[r][c];
                            cellInput.style.backgroundColor = '#e6f7ff'; // Light blue
                        }
                    }
                }
            }
        });
    }


});
