document.addEventListener('DOMContentLoaded', () => {
    const scoresTableBody = document.querySelector('#scores-table tbody');

    // Fetch and display scores on page load
    if (scoresTableBody) {
        fetchScores();
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
