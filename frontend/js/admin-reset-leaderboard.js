document.getElementById('reset-leaderboard-btn').addEventListener('click', async () => {
    const messageDiv = document.getElementById('message');
    messageDiv.style.display = 'none';

    try {
        const response = await fetch('/api/users/scores', { method: 'DELETE' });

        if (response.ok) {
            messageDiv.textContent = 'All user scores have been reset to 0. Redirecting to dashboard...';
            messageDiv.style.display = 'block';
            messageDiv.style.color = 'green';
            setTimeout(() => {
                window.location.href = '/admin/dashboard';
            }, 2000);
        } else {
            const data = await response.json();
            messageDiv.textContent = `Failed to reset scores: ${data.error}`;
            messageDiv.style.display = 'block';
            messageDiv.style.color = 'red';
        }
    } catch (error) {
        console.error('Error resetting scores:', error);
        messageDiv.textContent = 'An error occurred while resetting scores.';
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
    }
});