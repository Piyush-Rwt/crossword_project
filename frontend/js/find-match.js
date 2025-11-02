document.addEventListener('DOMContentLoaded', () => {
    const statusMessage = document.getElementById('status-message');
    const socket = io();

    console.log('Attempting to find a 1v1 match...');
    socket.emit('find-1v1-match');

    socket.on('waiting-for-match', () => {
        console.log('Server acknowledged: now waiting for an opponent.');
        statusMessage.textContent = 'Waiting for an opponent...';
    });

    socket.on('match-found', ({ gameId, crosswordData }) => {
        console.log('Match found! Game ID:', gameId);
        // Store the crossword data in session storage to be accessed on the game page
        sessionStorage.setItem('crosswordData', JSON.stringify(crosswordData));
        sessionStorage.setItem('gameId', gameId);

        // Redirect to the 1v1 game page
        window.location.href = '/play-1v1.html';
    });

    socket.on('error', (message) => {
        console.error('Received an error from the server:', message);
        statusMessage.textContent = `Error: ${message}. Please try again.`;
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from the server.');
        statusMessage.textContent = 'Disconnected. Please refresh to try again.';
    });
});
