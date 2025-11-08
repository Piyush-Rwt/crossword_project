const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require("socket.io");
const sharedsession = require("express-socket.io-session");
const pgSession = require('connect-pg-simple')(session);

process.on("uncaughtException", (err) => {
  console.error("[ERROR] Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[ERROR] Unhandled Rejection:", reason);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 30000 
});

const port = 3000;
const saltRounds = 10;

const ADMIN_PASSWORD_HASH = '$2a$10$e/O/iTDO9RIhtvFJh5vLHe827cgfZJD/rT7K1blhPHv6zP55HRuAe';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));
const sessionMiddleware = session({
    store: new pgSession({
        pool : pool,
        tableName : 'user_sessions'
      }),
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
});
app.use(sessionMiddleware);

io.use(sharedsession(sessionMiddleware, {
    autoSave: true
}));

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
        if (error.code === '23505') {
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
    if (score === undefined || timeTaken === undefined || !wordsSolved) {
        return res.status(400).json({ error: 'Missing game data.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'INSERT INTO "player_games" (user_id, score, time_taken, words_solved) VALUES ($1, $2, $3, $4)',
            [userId, score, timeTaken, JSON.stringify(wordsSolved)]
        );
        await client.query(
            'UPDATE "users" SET total_score = total_score + $1, games_played = games_played + 1, highscore = GREATEST(highscore, $1) WHERE id = $2',
            [score, userId]
        );
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
        const { rows } = await pool.query('SELECT * FROM leaderboard ORDER BY highscore DESC LIMIT 10');
        res.json(rows);
    } catch (error) {
        console.error('DB error in /api/leaderboard:', error);
        res.status(500).json({ error: 'DB error when fetching leaderboard.' });
    }
});

app.get('/api/scores', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT u.username, pg.score, pg.time_taken, pg.play_date FROM "player_games" pg JOIN "users" u ON pg.user_id = u.id ORDER BY pg.score DESC, pg.time_taken ASC LIMIT 10');
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
        await pool.query('UPDATE "users" SET total_score = 0, highscore = 0, games_played = 0, wins = 0, losses = 0');
        res.status(200).json({ status: 'All user scores have been reset to 0.' });
    } catch (error) {
        console.error('DB error in /api/users/scores DELETE:', error);
        res.status(500).json({ error: 'DB error when resetting user scores.' });
    }
});

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'signup.html')));
app.get('/help', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'help.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'leaderboard.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin-login.html')));
app.get('/admin/dashboard', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin', 'dashboard.html')));
app.get('/admin/delete-scores', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin', 'delete-scores.html')));
app.get('/admin/reset-leaderboard', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin', 'reset-leaderboard.html')));

io.on('connection', (socket) => {
    console.log('A user connected with socket id:', socket.id);

    socket.on('find-1v1-match', async () => {
        if (!socket.handshake.session.user) {
            return socket.emit('error', 'User not authenticated.');
        }
        const userId = socket.handshake.session.user.id;
        const client = await pool.connect();
        try {
            console.log(`Player ${socket.id} (user: ${userId}) is looking for a 1v1 match.`);
            await client.query('BEGIN');

            const { rows: currentPlayerRows } = await client.query(
                'INSERT INTO players (socket_id, user_id) VALUES ($1, $2) ON CONFLICT (socket_id) DO UPDATE SET user_id = $2 RETURNING player_id',
                [socket.id, userId]
            );
            const currentPlayerId = currentPlayerRows[0].player_id;

            const { rows: waitingPlayers } = await client.query(
                'SELECT * FROM players WHERE is_waiting = true AND player_id != $1 LIMIT 1',
                [currentPlayerId]
            );

            if (waitingPlayers.length > 0) {
                const player1 = waitingPlayers[0];
                const player2_id = currentPlayerId;

                const gameId = `game_${Date.now()}`;
                await client.query(
                    'INSERT INTO active_1v1 (game_id, player1_id, player2_id, status) VALUES ($1, $2, $3, $4)',
                    [gameId, player1.player_id, player2_id, 'active']
                );

                await client.query('UPDATE players SET is_waiting = false WHERE player_id = $1 OR player_id = $2', [player1.player_id, player2_id]);

                await client.query('COMMIT');

                const { rows: player1SocketRows } = await client.query('SELECT socket_id FROM players WHERE player_id = $1', [player1.player_id]);
                const player1_socket_id = player1SocketRows[0].socket_id;
                const player2_socket_id = socket.id;

                io.sockets.sockets.get(player1_socket_id)?.join(gameId);
                io.sockets.sockets.get(player2_socket_id)?.join(gameId);

                console.log(`Match found! Game ID: ${gameId}. Players: ${player1_socket_id} vs ${player2_socket_id}`);

                const cProcess = spawn(path.join(__dirname, 'backend', 'main'), ['generate-sized', '7'], { cwd: path.join(__dirname, 'backend') });
                let output = '';
                cProcess.stdout.on('data', (data) => output += data.toString());
                cProcess.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const crosswordData = JSON.parse(output);
                            io.to(gameId).emit('match-found', { gameId, crosswordData });
                        } catch (e) {
                            io.to(gameId).emit('error', 'Failed to create a game.');
                        }
                    } else {
                        io.to(gameId).emit('error', 'Failed to create a game.');
                    }
                });

            } else {
                await client.query('UPDATE players SET is_waiting = true WHERE player_id = $1', [currentPlayerId]);
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

    socket.on('rejoin-game', async ({ gameId }) => {
        if (!socket.handshake.session.user) {
            return;
        }
        const userId = socket.handshake.session.user.id;
        const client = await pool.connect();
        try {
            const { rows } = await client.query(
                'SELECT p.player_id FROM players p JOIN active_1v1 a ON (p.player_id = a.player1_id OR p.player_id = a.player2_id) WHERE a.game_id = $1 AND p.user_id = $2',
                [gameId, userId]
            );
            if (rows.length > 0) {
                const playerId = rows[0].player_id;
                await client.query('UPDATE players SET socket_id = $1 WHERE player_id = $2', [socket.id, playerId]);
                socket.join(gameId);
                console.log(`Player ${userId} rejoined game ${gameId} with new socket ${socket.id}`);
            }
        } catch (error) {
            console.error('[ERROR] in rejoin-game handler:', error);
        } finally {
            client.release();
        }
    });

    socket.on('player-finished', async ({ gameId, score, timeTaken }) => {
        const client = await pool.connect();
        try {
            console.log(`[DEBUG] Player ${socket.id} finished game ${gameId} with score ${score} in ${timeTaken}s.`);
            await client.query('BEGIN');

            const { rows: playerRows } = await client.query('SELECT player_id FROM players WHERE socket_id = $1', [socket.id]);
            if (playerRows.length === 0) {
                await client.query('ROLLBACK');
                return;
            }
            const playerId = playerRows[0].player_id;

            let { rows: games } = await client.query('SELECT * FROM active_1v1 WHERE game_id = $1 AND status = \'active\'', [gameId]);
            if (games.length === 0) {
                console.log(`[ERROR] Game not found or not active for player-finished event. Game ID: ${gameId}`);
                await client.query('ROLLBACK');
                return;
            }
            let game = games[0];

            const isPlayer1 = game.player1_id === playerId;
            if (isPlayer1) {
                await client.query('UPDATE active_1v1 SET player1_score = $1, player1_time = $2 WHERE game_id = $3', [score, timeTaken, gameId]);
            } else {
                await client.query('UPDATE active_1v1 SET player2_score = $1, player2_time = $2 WHERE game_id = $3', [score, timeTaken, gameId]);
            }

            let { rows: updatedGames } = await client.query('SELECT * FROM active_1v1 WHERE game_id = $1', [gameId]);
            game = updatedGames[0];

            const opponentId = isPlayer1 ? game.player2_id : game.player1_id;
            const { rows: opponentSocketRows } = await client.query('SELECT socket_id FROM players WHERE player_id = $1', [opponentId]);
            if (opponentSocketRows.length > 0) {
                const opponentSocketId = opponentSocketRows[0].socket_id;
                io.to(opponentSocketId).emit('opponent-finished', { score, timeTaken });
            }

            if (game.player1_score !== null && game.player2_score !== null) {
                const { rows: p1Rows } = await client.query('SELECT user_id, socket_id FROM players WHERE player_id = $1', [game.player1_id]);
                const { rows: p2Rows } = await client.query('SELECT user_id, socket_id FROM players WHERE player_id = $1', [game.player2_id]);
                const player1UserId = p1Rows[0].user_id;
                const player2UserId = p2Rows[0].user_id;
                const player1SocketId = p1Rows[0].socket_id;
                const player2SocketId = p2Rows[0].socket_id;

                let winnerUserId, loserUserId;
                if (game.player1_score > game.player2_score) {
                    winnerUserId = player1UserId;
                    loserUserId = player2UserId;
                } else if (game.player2_score > game.player1_score) {
                    winnerUserId = player2UserId;
                    loserUserId = player1UserId;
                } else {
                    if (game.player1_time < game.player2_time) {
                        winnerUserId = player1UserId;
                        loserUserId = player2UserId;
                    } else {
                        winnerUserId = player2UserId;
                        loserUserId = player1UserId;
                    }
                }

                await client.query('UPDATE users SET wins = wins + 1, games_played = games_played + 1 WHERE id = $1', [winnerUserId]);
                await client.query('UPDATE users SET losses = losses + 1, games_played = games_played + 1 WHERE id = $1', [loserUserId]);
                await client.query('UPDATE active_1v1 SET status = \'ended\', winner_id = $1, ended_at = CURRENT_TIMESTAMP WHERE game_id = $2', [winnerUserId, gameId]);

                const finalResults = {
                    winnerId: winnerUserId === player1UserId ? player1SocketId : player2SocketId,
                    player1: { id: player1SocketId, score: game.player1_score, timeTaken: game.player1_time },
                    player2: { id: player2SocketId, score: game.player2_score, timeTaken: game.player2_time }
                };

                io.to(gameId).emit('game-over', finalResults);
                console.log(`[DEBUG] Game over for ${gameId}. Winner user: ${winnerUserId}.`);
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
            console.log(`[DEBUG] Server received player-forfeit for gameId: ${gameId} from ${socket.id}`);
            await client.query('BEGIN');

            const { rows: playerRows } = await client.query('SELECT player_id, user_id FROM players WHERE socket_id = $1', [socket.id]);
            if (playerRows.length === 0) {
                await client.query('ROLLBACK');
                return;
            }
            const forfeiterPlayerId = playerRows[0].player_id;
            const forfeiterUserId = playerRows[0].user_id;

            const { rows: activeGames } = await client.query('SELECT * FROM active_1v1 WHERE game_id = $1 AND status = \'active\'', [gameId]);

            if (activeGames.length > 0) {
                const game = activeGames[0];
                const opponentPlayerId = game.player1_id === forfeiterPlayerId ? game.player2_id : game.player1_id;
                
                const { rows: opponentPlayerRows } = await client.query('SELECT user_id, socket_id FROM players WHERE player_id = $1', [opponentPlayerId]);
                const opponentUserId = opponentPlayerRows[0].user_id;
                const opponentSocketId = opponentPlayerRows[0].socket_id;

                await client.query('UPDATE users SET losses = losses + 1, games_played = games_played + 1 WHERE id = $1', [forfeiterUserId]);
                await client.query('UPDATE users SET wins = wins + 1, games_played = games_played + 1 WHERE id = $1', [opponentUserId]);
                await client.query('UPDATE active_1v1 SET status = \'forfeited\', winner_id = $1, ended_at = CURRENT_TIMESTAMP WHERE game_id = $2', [opponentUserId, gameId]);

                const finalResults = {
                    winnerId: opponentSocketId,
                    forfeit: true,
                    message: `Player ${socket.handshake.session.user.username} forfeited the match.`
                };
                
                io.to(gameId).emit('game-over', finalResults);
                console.log(`[DEBUG] Player ${forfeiterUserId} forfeited. ${opponentUserId} wins game ${game.game_id}.`);
                
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

            const { rows: playerRows } = await client.query('SELECT player_id, user_id FROM players WHERE socket_id = $1', [socket.id]);
            if (playerRows.length === 0) {
                await client.query('ROLLBACK');
                return;
            }
            const disconnectedPlayerId = playerRows[0].player_id;
            const disconnectedUserId = playerRows[0].user_id;

            const { rows: activeGames } = await client.query(
                'SELECT * FROM active_1v1 WHERE (player1_id = $1 OR player2_id = $1) AND status = \'active\'',
                [disconnectedPlayerId]
            );

            if (activeGames.length > 0) {
                const game = activeGames[0];
                const opponentPlayerId = game.player1_id === disconnectedPlayerId ? game.player2_id : game.player1_id;

                const { rows: opponentPlayerRows } = await client.query('SELECT user_id, socket_id FROM players WHERE player_id = $1', [opponentPlayerId]);
                const opponentUserId = opponentPlayerRows[0].user_id;
                const opponentSocketId = opponentPlayerRows[0].socket_id;

                await client.query('UPDATE users SET losses = losses + 1, games_played = games_played + 1 WHERE id = $1', [disconnectedUserId]);
                await client.query('UPDATE users SET wins = wins + 1, games_played = games_played + 1 WHERE id = $1', [opponentUserId]);
                await client.query('UPDATE active_1v1 SET status = \'forfeited\', winner_id = $1, ended_at = CURRENT_TIMESTAMP WHERE game_id = $2', [opponentUserId, game.game_id]);
                
                io.to(opponentSocketId).emit('opponent-disconnected');
                console.log(`Player ${disconnectedUserId} disconnected from game ${game.game_id}. Notifying ${opponentSocketId}.`);
            } else {
                await client.query('DELETE FROM players WHERE socket_id = $1', [socket.id]);
            }

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