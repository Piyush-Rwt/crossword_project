document.addEventListener('DOMContentLoaded', () => {
    const resultTitle = document.getElementById('result-title');
    const resultSummary = document.getElementById('result-summary');
    const youScoreEl = document.getElementById('you-score');
    const youTimeEl = document.getElementById('you-time');
    const opponentScoreEl = document.getElementById('opponent-score');
    const opponentTimeEl = document.getElementById('opponent-time');

    const resultsData = JSON.parse(sessionStorage.getItem('1v1-results'));
    const mySocketId = sessionStorage.getItem('mySocketId');

    if (!resultsData) {
        resultTitle.textContent = 'No results found.';
        return;
    }

    if (resultsData.forfeit) {
        resultTitle.textContent = resultsData.winnerId === mySocketId ? 'You Won!' : 'You Lost';
        resultSummary.textContent = resultsData.message;
        // Hide score comparison for forfeit
        document.querySelector('.results-comparison').style.display = 'none';
        return;
    }

    const winnerId = resultsData.winnerId;
    const player1 = resultsData.player1;
    const player2 = resultsData.player2;

    let myResult, opponentResult;

    if (player1.id === mySocketId) {
        myResult = player1;
        opponentResult = player2;
    } else {
        myResult = player2;
        opponentResult = player1;
    }

    // Populate results
    youScoreEl.textContent = myResult.score;
    youTimeEl.textContent = myResult.timeTaken;
    opponentScoreEl.textContent = opponentResult.score;
    opponentTimeEl.textContent = opponentResult.timeTaken;

    // Determine and display winner
    if (winnerId === mySocketId) {
        resultTitle.textContent = 'You Won!';
        document.getElementById('you-result').classList.add('winner');
        document.getElementById('opponent-result').classList.add('loser');
    } else {
        resultTitle.textContent = 'You Lost';
        document.getElementById('you-result').classList.add('loser');
        document.getElementById('opponent-result').classList.add('winner');
    }

    // Clean up session storage
    sessionStorage.removeItem('1v1-results');
    sessionStorage.removeItem('crosswordData');
    sessionStorage.removeItem('gameId');
    sessionStorage.removeItem('mySocketId');
});
