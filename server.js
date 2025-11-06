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
    socket.on('find-1v1-match', () => {
        console.log('Player', socket.id, 'is looking for a 1v1 match.');
        if (waitingPlayer) {
            const player1 = waitingPlayer;
            const player2 = socket;
            const gameId = `game_${Date.now()}`;
            waitingPlayer = null;
            player1.join(gameId);
            player2.join(gameId);
            activeGames[gameId] = { players: [player1.id, player2.id], results: {} };
            console.log(`Match found! Game ID: ${gameId}. Players: ${player1.id} vs ${player2.id}`);
            // Generate a 7x7 crossword for the match
            const cProcess = spawn(path.join(__dirname, 'backend', 'main'), ['generate-sized', '7'], { cwd: path.join(__dirname, 'backend') });
            let output = '';
            let errorOutput = '';
            cProcess.stdout.on('data', (data) => output += data.toString());
            cProcess.stderr.on('data', (data) => errorOutput += data.toString());
            cProcess.on('close', (code) => {
                if (code === 0) {
                    try {
                        const crosswordData = JSON.parse(output);
                        io.to(gameId).emit('match-found', { gameId, crosswordData });
                    } catch (e) {
                        console.error('Failed to parse 5x5 C backend output:', e, 'Output:', output);
                        io.to(gameId).emit('error', 'Failed to create a game.');
                    }
                } else {
                    console.error(`5x5 C backend exited with code ${code}. Stderr: ${errorOutput}`);
                    io.to(gameId).emit('error', 'Failed to create a game.');
                }
            });
        } else {
            waitingPlayer = socket;
            socket.emit('waiting-for-match');
            console.log('Player', socket.id, 'is now waiting for an opponent.');
        }
    });
    socket.on('player-finished', ({ gameId, score, timeTaken }) => {
        try {
            const game = activeGames[gameId];
            if (!game) {
                console.log(`[DEBUG] Game not found for gameId: ${gameId}`);
                return;
            }

            console.log(`[DEBUG] Player ${socket.id} finished. Score: ${score}, Time: ${timeTaken}`);
            game.results[socket.id] = { score, timeTaken };
            console.log(`[DEBUG] Game results for ${gameId}:`, game.results);

            const opponentId = game.players.find(id => id !== socket.id);
            if (opponentId) {
                io.to(opponentId).emit('opponent-finished', { score, timeTaken });
            }

            if (Object.keys(game.results).length === 2) {
                console.log(`[DEBUG] Both players finished. Determining winner for game ${gameId}.`);
                // Both players finished, determine winner
                const [player1Id, player2Id] = game.players;
                const result1 = game.results[player1Id];
                const result2 = game.results[player2Id];
                let winnerId;
                if (result1.score > result2.score) {
                    winnerId = player1Id;
                } else if (result2.score > result1.score) {
                    winnerId = player2Id;
                } else {
                    winnerId = result1.timeTaken < result2.timeTaken ? player1Id : player2Id;
                }
                const finalResults = { winnerId, player1: { id: player1Id, ...result1 }, player2: { id: player2Id, ...result2 } };
                io.to(gameId).emit('game-over', finalResults);
                console.log(`[DEBUG] Game over for ${gameId}. Winner: ${winnerId}. Deleting game.`);
                delete activeGames[gameId];
            } else {
                console.log(`[DEBUG] One player finished. Starting timeout for game ${gameId}.`);
                // One player finished, start a timeout for the other
                game.timeout = setTimeout(() => {
                    if (activeGames[gameId] && Object.keys(game.results).length === 1) {
                        const winnerId = Object.keys(game.results)[0];
                        const finalResults = {
                            winnerId,
                            forfeit: true,
                            message: 'Opponent timed out.'
                        };
                        io.to(gameId).emit('game-over', finalResults);
                        console.log(`[DEBUG] Timeout for game ${gameId}. Winner by timeout: ${winnerId}. Deleting game.`);
                        delete activeGames[gameId];
                    }
                }, 60000); // 60-second timeout
            }
        } catch (error) {
            console.error('[ERROR] in player-finished handler:', error);
        }
    });

    socket.on('player-forfeit', ({ gameId }) => {
        try {
            console.log(`[DEBUG] Server received player-forfeit for gameId: ${gameId}`);
            console.log(`[DEBUG] Current activeGames object:`, JSON.stringify(activeGames, null, 2));

            const game = activeGames[gameId];
            if (!game) {
                console.log(`[ERROR] Game not found for forfeit from ${socket.id}. Game ID: ${gameId}`);
                return;
            }

            const opponentId = game.players.find(id => id !== socket.id);
            if (opponentId) {
                const finalResults = {
                    winnerId: opponentId,
                    forfeit: true,
                    message: `Player ${socket.id} forfeited the match.`
                };
                io.to(gameId).emit('game-over', finalResults);
                console.log(`[DEBUG] Player ${socket.id} forfeited. ${opponentId} wins game ${gameId}. Emitting 'game-over'.`);
            } else {
                console.log(`[ERROR] Opponent not found for game ${gameId} when player ${socket.id} forfeited.`);
            }

            delete activeGames[gameId];
            console.log(`[DEBUG] Deleted game ${gameId} from activeGames.`);
        } catch (error) {
            console.error('[ERROR] in player-forfeit handler:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            console.log('The waiting player has disconnected. Queue is now empty.');
        }
        for (const gameId in activeGames) {
            const game = activeGames[gameId];
            if (game.players.includes(socket.id)) {
                const opponentId = game.players.find(id => id !== socket.id);
                if (opponentId) {
                    io.to(opponentId).emit('opponent-disconnected');
                    console.log(`Player ${socket.id} disconnected from game ${gameId}. Notifying ${opponentId}.`);
                }
                delete activeGames[gameId];
                break;
            }
        }
    });
});

server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});