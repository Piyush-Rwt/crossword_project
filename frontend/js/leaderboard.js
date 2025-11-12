document.addEventListener('DOMContentLoaded', async () => {
    const leaderboardContainer = document.getElementById('leaderboard-container');

    async function fetchLeaderboard() {
        const response = await fetch('/api/leaderboard');
        if (response.ok) {
            const leaderboardData = await response.json();
            renderLeaderboard(leaderboardData);
        } else {
            leaderboardContainer.innerHTML = '<p>Could not load leaderboard.</p>';
        }
    }

    function renderLeaderboard(leaderboard) {
        if (leaderboard.length === 0) {
            leaderboardContainer.innerHTML = '<p>No scores yet.</p>';
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Score</th>
                </tr>
            </thead>
            <tbody>
                ${leaderboard.map((player, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${player.username}</td>
                        <td>${player.highscore}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        leaderboardContainer.appendChild(table);
    }

    fetchLeaderboard();
});