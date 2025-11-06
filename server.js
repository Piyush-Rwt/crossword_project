const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg'); // Use the pg library
const session = require('express-session');
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require("socket.io");

process.on("uncaughtException", (err) => {
  console.error("[ERROR] Uncaught Exception:", err);
  // Consider graceful shutdown or restart mechanism here
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[ERROR] Unhandled Rejection:", reason);
  // Consider graceful shutdown or restart mechanism here
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",   // or your frontend domain
    methods: ["GET", "POST"]
  }
});

const port = 3000;
const saltRounds = 10;

const ADMIN_PASSWORD_HASH = '$2b$10$e/O/iTDO9RIhtvFJh5vLHe827cgfZJD/rT7K1blhPHv6zP55HRuAe';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// PostgreSQL Connection Pool
// It automatically uses the DATABASE_URL environment variable on Render.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// --- AUTHENTICATION MIDDLEWARE ---

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden. Administrator access required.' });
    }
};

// --- AUTHENTICATION ROUTES ---

app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const { rows } = await pool.query(
            'INSERT INTO "users" (username, password_hash) VALUES ($1, $2) RETURNING id',
            [username, hashedPassword]
        );
        res.status(201).json({ status: 'User created successfully.', userId: rows[0].id });
    } catch (error) {
        if (error.code === '23505') { // Unique violation in PostgreSQL
            return res.status(409).json({ error: 'Username already exists.' });
        }
        console.error('Database error during sign-up:', error);
        res.status(500).json({ error: 'Database error during sign-up.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    try {
        const { rows } = await pool.query('SELECT * FROM "users" WHERE username = $1', [username]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.user = { id: user.id, username: user.username, role: 'user' };
            res.json({ status: 'Login successful.' });
        } else {
            res.status(401).json({ error: 'Invalid credentials.' });
        }
    } catch (error) {
        console.error('Database error during login:', error);
        res.status(500).json({ error: 'Database error during login.' });
    }
});

app.post('/api/admin/verify', async (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ error: 'Password is required.' });
    }
    try {
        const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        if (match) {
            req.session.user = { id: 'admin', username: 'Admin', role: 'admin' };
            res.json({ status: 'Admin verification successful.' });
        } else {
            res.status(401).json({ error: 'Invalid admin password.' });
        }
    } catch (error) {
        console.error('Error during admin verification:', error);
        res.status(500).json({ error: 'Server error during admin verification.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out.' });
        }
        res.clearCookie('connect.sid');
        res.json({ status: 'Logout successful.' });
    });
});

app.get('/api/session/status', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// --- GAME & API ROUTES ---

app.get('/api/generateCrossword', (req, res) => {
    const cProcess = spawn(path.join(__dirname, 'backend', 'main'), ['generate'], { cwd: path.join(__dirname, 'backend') });
    let output = '';
    let errorOutput = '';
    cProcess.stdout.on('data', (data) => output += data.toString());
    cProcess.stderr.on('data', (data) => errorOutput += data.toString());
    cProcess.on('close', async (code) => {
        if (code === 0) {
            try {
                const crosswordData = JSON.parse(output);
                await pool.query('DELETE FROM "crossword_words"');
                if (crosswordData.clues && crosswordData.clues.length > 0) {
                    for (const c of crosswordData.clues) {
                        await pool.query('INSERT INTO "crossword_words" (id, word, clue, row_idx, col_idx, direction, clue_number) VALUES ($1, $2, $3, $4, $5, $6, $7)', 
                            [c.word_id, c.word, c.text, c.row, c.col, c.dir, c.number]);
                    }
                }
                res.json(crosswordData);
            } catch (e) {
                console.error('Failed to parse C backend output or save to DB:', e, 'Output:', output);
                res.status(500).json({ error: 'Failed to process crossword data.' });
            }
        } else {
            console.error(`C backend exited with code ${code}. Error: ${errorOutput}`);
            res.status(500).json({ error: 'Failed to generate crossword.', details: errorOutput });
        }
    });
});

app.post('/api/checkAnswer', async (req, res) => {
    const { word_id, user_word } = req.body;
    if (!word_id || !user_word) {
        return res.status(400).json({ error: 'Missing word_id or user_word.' });
    }
    try {
        const { rows } = await pool.query('SELECT word FROM "crossword_words" WHERE id = $1', [word_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Word not found.' });
        const isCorrect = (user_word.toUpperCase() === rows[0].word.toUpperCase());
        res.json({ correct: isCorrect, scoreDelta: isCorrect ? 10 : 0 });
    } catch (error) {
        console.error('DB error in /api/checkAnswer:', error);
        res.status(500).json({ error: 'DB error during answer check.' });
    }
});

app.post('/api/endGame', isAuthenticated, async (req, res) => {
    const { score, timeTaken, wordsSolved } = req.body;
    const userId = req.session.user.id;
    const username = req.session.user.username;
    if (score === undefined || timeTaken === undefined || !wordsSolved) {
        return res.status(400).json({ error: 'Missing game data.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE "users" SET score = score + $1 WHERE id = $2', [score, userId]);
        const { rows: existingScores } = await client.query('SELECT id, score FROM "player_games" WHERE player_name = $1', [username]);
        if (existingScores.length === 0) {
            await client.query(
                'INSERT INTO "player_games" (player_name, score, time_taken, words_solved) VALUES ($1, $2, $3, $4)',
                [username, score, timeTaken, JSON.stringify(wordsSolved)]
            );
        } else {
            const existingScore = existingScores[0];
            if (score > existingScore.score) {
                await client.query(
                    'UPDATE "player_games" SET score = $1, time_taken = $2, words_solved = $3, play_date = CURRENT_TIMESTAMP WHERE id = $4',
                    [score, timeTaken, JSON.stringify(wordsSolved), existingScore.id]
                );
            }
        }
        await client.query('COMMIT');
        res.json({ status: 'Game data saved successfully.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('DB error in /api/endGame:', error);
        res.status(500).json({ error: 'DB error when saving game.' });
    } finally {
        client.release();
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT username, score FROM "users" ORDER BY score DESC LIMIT 10');
        res.json(rows);
    } catch (error) {
        console.error('DB error in /api/leaderboard:', error);
        res.status(500).json({ error: 'DB error when fetching leaderboard.' });
    }
});

app.get('/api/scores', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT player_name, score, time_taken, play_date FROM "player_games" ORDER BY score DESC, time_taken ASC LIMIT 10');
        res.json(rows);
    } catch (error) {
        console.error('DB error in /api/scores:', error);
        res.status(500).json({ error: 'DB error when fetching scores.' });
    }
});

app.delete('/api/scores', isAdmin, async (req, res) => {
    try {
        await pool.query('TRUNCATE TABLE "player_games"');
        res.status(200).json({ status: 'All scores deleted successfully.' });
    } catch (error) {
        console.error('DB error in /api/scores DELETE:', error);
        res.status(500).json({ error: 'DB error when deleting scores.' });
    }
});

app.delete('/api/users/scores', isAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE "users" SET score = 0');
        res.status(200).json({ status: 'All user scores have been reset to 0.' });
    } catch (error) {
        console.error('DB error in /api/users/scores DELETE:', error);
        res.status(500).json({ error: 'DB error when resetting user scores.' });
    }
});

// --- FRONTEND SERVING ---
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'signup.html')));
app.get('/help', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'help.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'leaderboard.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin-login.html')));
app.get('/admin/dashboard', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin', 'dashboard.html')));
app.get('/admin/delete-scores', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin', 'delete-scores.html')));
app.get('/admin/reset-leaderboard', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin', 'reset-leaderboard.html')));

// --- 1v1 MATCHMAKING LOGIC ---
let waitingPlayer = null;
const activeGames = {};

io.on('connection', (socket) => {
    console.log('A user connected with socket id:', socket.id);
    socket.on('find-1v1-match', async () => {
        const client = await pool.connect();
        try {
            console.log(`Player ${socket.id} is looking for a 1v1 match.`);
            await client.query('BEGIN');

            // Add the current player to the players table if they don't exist
            await client.query('INSERT INTO players (socket_id) VALUES ($1) ON CONFLICT (socket_id) DO NOTHING', [socket.id]);

            // Find a waiting player
            const { rows: waitingPlayers } = await client.query(
                'SELECT * FROM players WHERE is_waiting = true AND socket_id != $1 LIMIT 1', 
                [socket.id]
            );

            if (waitingPlayers.length > 0) {
                // Match found
                const player1 = waitingPlayers[0];
                const player2_socket_id = socket.id;

                // Create a new game in the active_1v1 table
                const gameId = `game_${Date.now()}`;
                await client.query(
                    'INSERT INTO active_1v1 (game_id, player1_id, player2_id, status) VALUES ($1, $2, $3, $4)',
                    [gameId, player1.socket_id, player2_socket_id, 'active']
                );

                // Mark both players as no longer waiting
                await client.query('UPDATE players SET is_waiting = false WHERE socket_id = $1 OR socket_id = $2', [player1.socket_id, player2_socket_id]);

                await client.query('COMMIT');

                console.log(`Match found! Game ID: ${gameId}. Players: ${player1.socket_id} vs ${player2_socket_id}`);

                // Generate crossword and start the game
                const cProcess = spawn(path.join(__dirname, 'backend', 'main'), ['generate-sized', '7'], { cwd: path.join(__dirname, 'backend') });
                let output = '';
                cProcess.stdout.on('data', (data) => output += data.toString());
                cProcess.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const crosswordData = JSON.parse(output);
                            io.to(player1.socket_id).to(player2_socket_id).emit('match-found', { gameId, crosswordData });
                        } catch (e) {
                            io.to(player1.socket_id).to(player2_socket_id).emit('error', 'Failed to create a game.');
                        }
                    } else {
                        io.to(player1.socket_id).to(player2_socket_id).emit('error', 'Failed to create a game.');
                    }
                });

            } else {
                // No waiting players, so mark the current player as waiting
                await client.query('UPDATE players SET is_waiting = true WHERE socket_id = $1', [socket.id]);
                await client.query('COMMIT');
                socket.emit('waiting-for-match');
                console.log(`Player ${socket.id} is now waiting for an opponent.`);
            }
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[ERROR] in find-1v1-match handler:', error);
            socket.emit('error', 'An error occurred while finding a match.');
        } finally {
            client.release();
        }
    });
    socket.on('player-finished', async ({ gameId, score, timeTaken }) => {
        const client = await pool.connect();
        try {
            console.log(`[DEBUG] Player ${socket.id} finished game ${gameId} with score ${score} in ${timeTaken}s.`);
            await client.query('BEGIN');

            let { rows: games } = await client.query('SELECT * FROM active_1v1 WHERE game_id = $1 AND status = \'active\'', [gameId]);
            if (games.length === 0) {
                console.log(`[ERROR] Game not found or not active for player-finished event. Game ID: ${gameId}`);
                await client.query('ROLLBACK');
                return;
            }
            let game = games[0];

            // Determine if the current player is player1 or player2 and update their score
            const isPlayer1 = game.player1_id === socket.id;
            if (isPlayer1) {
                await client.query('UPDATE active_1v1 SET player1_score = $1, player1_time = $2 WHERE game_id = $3', [score, timeTaken, gameId]);
            } else {
                await client.query('UPDATE active_1v1 SET player2_score = $1, player2_time = $2 WHERE game_id = $3', [score, timeTaken, gameId]);
            }

            // Refresh game state
            let { rows: updatedGames } = await client.query('SELECT * FROM active_1v1 WHERE game_id = $1', [gameId]);
            game = updatedGames[0];

            const opponentId = isPlayer1 ? game.player2_id : game.player1_id;
            io.to(opponentId).emit('opponent-finished', { score, timeTaken });

            // Check if both players have finished
            if (game.player1_score !== null && game.player2_score !== null) {
                // Both players finished, determine winner
                let winnerId;
                if (game.player1_score > game.player2_score) {
                    winnerId = game.player1_id;
                } else if (game.player2_score > game.player1_score) {
                    winnerId = game.player2_id;
                } else {
                    // Tie in score, winner is the one with less time
                    winnerId = game.player1_time < game.player2_time ? game.player1_id : game.player2_id;
                }

                await client.query('UPDATE active_1v1 SET status = \'ended\' WHERE game_id = $1', [gameId]);

                const finalResults = {
                    winnerId,
                    player1: { id: game.player1_id, score: game.player1_score, timeTaken: game.player1_time },
                    player2: { id: game.player2_id, score: game.player2_score, timeTaken: game.player2_time }
                };

                io.to(gameId).emit('game-over', finalResults);
                console.log(`[DEBUG] Game over for ${gameId}. Winner: ${winnerId}.`);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[ERROR] in player-finished handler:', error);
        } finally {
            client.release();
        }
    });

    socket.on('player-forfeit', async ({ gameId }) => {
        const client = await pool.connect();
        try {
            console.log(`[DEBUG] Server received player-forfeit for gameId: ${gameId}`);
            await client.query('BEGIN');

            const { rows: activeGames } = await client.query('SELECT * FROM active_1v1 WHERE game_id = $1 AND status = \'active\'', [gameId]);

            if (activeGames.length > 0) {
                const game = activeGames[0];
                const opponentId = game.player1_id === socket.id ? game.player2_id : game.player1_id;

                await client.query('UPDATE active_1v1 SET status = \'forfeited\' WHERE game_id = $1', [gameId]);

                if (opponentId) {
                    const finalResults = {
                        winnerId: opponentId,
                        forfeit: true,
                        message: `Player ${socket.id} forfeited the match.`
                    };
                    io.to(game.game_id).emit('game-over', finalResults);
                    console.log(`[DEBUG] Player ${socket.id} forfeited. ${opponentId} wins game ${game.game_id}. Emitting 'game-over'.`);
                }
                await client.query('COMMIT');
            } else {
                console.log(`[ERROR] Game not found for forfeit from ${socket.id}. Game ID: ${gameId}`);
                await client.query('ROLLBACK');
            }
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[ERROR] in player-forfeit handler:', error);
        } finally {
            client.release();
        }
    });

    socket.on('disconnect', async () => {
        const client = await pool.connect();
        try {
            console.log(`User disconnected: ${socket.id}`);
            await client.query('BEGIN');

            // Find if the player was in an active game
            const { rows: activeGames } = await client.query(
                'SELECT * FROM active_1v1 WHERE (player1_id = $1 OR player2_id = $1) AND status = \'active\'',
                [socket.id]
            );

            if (activeGames.length > 0) {
                const game = activeGames[0];
                const opponentId = game.player1_id === socket.id ? game.player2_id : game.player1_id;

                // Mark the game as forfeited
                await client.query('UPDATE active_1v1 SET status = \'forfeited\' WHERE game_id = $1', [game.game_id]);

                // Notify the opponent
                if (opponentId) {
                    io.to(opponentId).emit('opponent-disconnected');
                    console.log(`Player ${socket.id} disconnected from game ${game.game_id}. Notifying ${opponentId}.`);
                }
            }

            // Remove the player from the players table
            await client.query('DELETE FROM players WHERE socket_id = $1', [socket.id]);

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[ERROR] in disconnect handler:', error);
        } finally {
            client.release();
        }
    });
});

server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});