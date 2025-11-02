document.addEventListener('DOMContentLoaded', () => {
    const gridElement = document.getElementById('crossword-grid');
    const acrossCluesList = document.getElementById('across-clues');
    const downCluesList = document.getElementById('down-clues');
    const scoresTableBody = document.querySelector('#scores-table tbody');
    const timerDisplay = document.getElementById('timer');
    const endGameBtn = document.getElementById('end-game');

    const playerNameInput = document.getElementById('player-name');
    const joinGameBtn = document.getElementById('join-game-btn');
    const playerInputSection = document.getElementById('player-input-section');
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
                // Optionally, show player input section again or redirect
                playerInputSection.style.display = 'block';
                gameSection.style.display = 'none';
            }
        }
    }

    // Event listener for the Join Game button
    if (joinGameBtn) {
        joinGameBtn.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            if (name.length > 0 && name.length <= 10) {
                currentPlayerName = name;
                localStorage.setItem('playerName', currentPlayerName);
                playerInputSection.style.display = 'none';
                gameSection.style.display = 'block';
                initializeGame();
            } else {
                alert('Please enter a valid name (1-10 characters).');
            }
        });
    }

    // Render grid with letters and clue numbers
    function generateGrid(grid, clueNumbers) {


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

    // Handle answer submission
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            // Gather all words from the grid and check them
            // This is a simplified approach; a more robust one would identify words based on clue numbers
            // For now, we'll iterate through the known words from crosswordData.clues
            if (!crosswordData || !crosswordData.clues) return;

            for (const clue of crosswordData.clues) {
                const wordId = clue.word_id;
                const cells = Array.from(gridElement.querySelectorAll(`.cell-input[data-row][data-col]`));
                let userWord = '';

                // Reconstruct user's word from grid based on clue's position and direction
                for (let i = 0; i < clue.length; i++) {
                    let r = clue.row + (clue.dir === 'D' ? i : 0);
                    let c = clue.col + (clue.dir === 'A' ? i : 0);
                    const cellInput = cells.find(input => parseInt(input.dataset.row) === r && parseInt(input.dataset.col) === c);
                    if (cellInput) {
                        userWord += cellInput.value.toUpperCase();
                    } else {
                        userWord += ' '; // Placeholder for empty cell
                    }
                }

                if (userWord.length === clue.length && userWord.includes(' ')) {
                    // Word is not fully entered, skip checking
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
                        if (!wordsSolved[wordId]) { // Only add score if not already solved
                            currentScore += result.scoreDelta;
                            wordsSolved[wordId] = true;
                            // Highlight word in green
                            for (let i = 0; i < clue.length; i++) {
                                let r = clue.row + (clue.dir === 'D' ? i : 0);
                                let c = clue.col + (clue.dir === 'A' ? i : 0);
                                const cellInput = cells.find(input => parseInt(input.dataset.row) === r && parseInt(input.dataset.col) === c);
                                if (cellInput) {
                                    cellInput.style.backgroundColor = '#e6ffe6'; // Light green
                                }
                            }
                            const clueListItem = document.querySelector(`li[data-word-id="${wordId}"]`);
                            if (clueListItem) clueListItem.style.color = 'green';
                        }
                    } else {
                        // Highlight word in red (optional, or clear input)
                        for (let i = 0; i < clue.length; i++) {
                            let r = clue.row + (clue.dir === 'D' ? i : 0);
                            let c = clue.col + (clue.dir === 'A' ? i : 0);
                            const cellInput = cells.find(input => parseInt(input.dataset.row) === r && parseInt(input.dataset.col) === c);
                            if (cellInput && !wordsSolved[wordId]) { // Only if not already solved
                                cellInput.style.backgroundColor = '#ffe6e6'; // Light red
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error checking answer:', error);
                }
            }
            alert(`Current Score: ${currentScore}`);
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
                    alert('Game Saved! Final Score: ' + currentScore + ', Time: ' + timeTaken + 's');
                    // Optionally redirect to results page or show a summary
                    window.location.href = 'result.html';
                } else {
                    alert('Failed to save game: ' + result.error);
                }
            } catch (error) {
                console.error('Error saving game:', error);
                alert('An error occurred while saving the game.');
            }
        });
    }

    // Handle Show Answers button click
    const showAnswersBtn = document.getElementById('show-answers-btn');
    if (showAnswersBtn) {
        showAnswersBtn.addEventListener('click', () => {
            if (!crosswordData || !crosswordData.grid) {
                alert('No crossword data available to show answers.');
                return;
            }

            if (!confirm('Are you sure you want to reveal all answers?')) {
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
