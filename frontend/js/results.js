document.addEventListener('DOMContentLoaded', () => {
    const scoresTableBody = document.querySelector('#scores-table tbody');
    const clearScoresBtn = document.getElementById('clear-scores-btn');

    // Fetch and display scores on page load
    if (scoresTableBody) {
        fetchScores();
    }

    // Handle Clear Scores button click
    if (clearScoresBtn) {
        clearScoresBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete ALL scores? This action cannot be undone.')) {
                return;
            }

            try {
                const response = await fetch('/api/scores', {
                    method: 'DELETE',
                });

                if (response.ok) {
                    alert('All scores have been deleted.');
                    fetchScores(); // Refresh the scores list
                } else {
                    const result = await response.json();
                    alert('Failed to delete scores: ' + result.error);
                }
            } catch (error) {
                console.error('Error deleting scores:', error);
                alert('An error occurred while deleting scores.');
            }
        });
    }

    async function fetchScores() {
        try {
            const response = await fetch('/api/scores');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const scores = await response.json();
            scoresTableBody.innerHTML = ''; // Clear previous scores

            if (scores.length === 0) {
                const row = scoresTableBody.insertRow();
                row.innerHTML = `<td colspan="5">No scores recorded yet.</td>`;
                return;
            }

            scores.forEach((score, index) => {
                const row = scoresTableBody.insertRow();
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${score.player_name}</td>
                    <td>${score.score}</td>
                    <td>${score.time_taken}s</td>
                    <td>${new Date(score.play_date).toLocaleDateString()}</td>
                `;
            });
        } catch (error) {
            console.error('Error fetching scores:', error);
            const row = scoresTableBody.insertRow();
            row.innerHTML = `<td colspan="5">Failed to load scores.</td>`;
        }
    }
});
