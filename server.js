const express = require('express');
const path = require('path');
const { spawn } = require('child_process'); // For executing C backend
const mysql = require('mysql2/promise'); // For MySQL connection
const app = express();
const port = 3000;

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, 'frontend')));

// MySQL Connection Pool (replace with your actual credentials)
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // Replace with your MySQL user
    password: 'Vlpg@123', // Replace with your MySQL password
    database: 'crossword_db', // Replace with your database name
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.get('/api/generateCrossword', (req, res) => {
    const cProcess = spawn(path.join(__dirname, 'backend', 'main'), ['generate']);

    let output = '';
    let errorOutput = '';

    cProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    cProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    cProcess.on('close', async (code) => {
        if (code === 0) {
            try {
                const crosswordData = JSON.parse(output);

                // --- BEGIN NEW DATABASE LOGIC ---
                let connection;
                try {
                    connection = await pool.getConnection();
                    await connection.execute('DELETE FROM crossword_words'); // Clear old words

                    if (crosswordData.clues && crosswordData.clues.length > 0) {
                        const values = crosswordData.clues.map(c => 
                            [c.word_id, c.word, c.text, c.row, c.col, c.dir, c.number]
                        );
                        await connection.query(
                            'INSERT INTO crossword_words (id, word, clue, row_idx, col_idx, direction, clue_number) VALUES ?',
                            [values]
                        );
                    }
                } catch (dbError) {
                    console.error('Database error while populating crossword_words:', dbError);
                    // Non-critical error for the user, but answer checking will fail.
                } finally {
                    if (connection) connection.release();
                }
                // --- END NEW DATABASE LOGIC ---

                res.json(crosswordData);
            } catch (e) {
                console.error('Failed to parse C backend output:', e, 'Output:', output);
                res.status(500).json({ error: 'Failed to parse crossword data from C backend.' });
            }
        } else {
            console.error(`C backend exited with code ${code}. Error: ${errorOutput}`);
            res.status(500).json({ error: 'Failed to generate crossword from C backend.', details: errorOutput });
        }
    });
});

// API endpoint to check a user's answer
app.post('/api/checkAnswer', async (req, res) => {
    const { word_id, user_word } = req.body;

    if (!word_id || !user_word) {
        return res.status(400).json({ error: 'Missing word_id or user_word.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT word FROM crossword_words WHERE id = ?',
            [word_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Word not found.' });
        }

        const correctWord = rows[0].word;
        const isCorrect = (user_word.toUpperCase() === correctWord.toUpperCase());
        const scoreDelta = isCorrect ? 10 : 0;

        res.json({ correct: isCorrect, scoreDelta: scoreDelta });

    } catch (error) {
        console.error('Database error in /api/checkAnswer:', error);
        res.status(500).json({ error: 'Database error during answer check.' });
    } finally {
        if (connection) connection.release();
    }
});

// API endpoint to end the game and save results
app.post('/api/endGame', async (req, res) => {
    const { playerName, score, timeTaken, wordsSolved } = req.body;

    if (!playerName || score === undefined || timeTaken === undefined || !wordsSolved) {
        return res.status(400).json({ error: 'Missing player data for endGame.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.execute(
            'INSERT INTO player_games (player_name, score, time_taken, words_solved) VALUES (?, ?, ?, ?)',
            [playerName, score, timeTaken, JSON.stringify(wordsSolved)]
        );
        
        if (result.affectedRows > 0) {
            res.json({ status: 'Game data saved successfully.' });
        } else {
            throw new Error('No rows were affected.');
        }

    } catch (error) {
        console.error('Database error in /api/endGame:', error);
        res.status(500).json({ error: 'Database error when saving game.' });
    } finally {
        if (connection) connection.release();
    }
});

// API endpoint to get scores from the database
app.get('/api/scores', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT player_name, score, time_taken, play_date FROM player_games ORDER BY score DESC, time_taken ASC LIMIT 10'
        );
        res.json(rows);
    } catch (error) {
        console.error('Database error in /api/scores:', error);
        res.status(500).json({ error: 'Database error when fetching scores.' });
    } finally {
        if (connection) connection.release();
    }
});

// API endpoint to delete all scores
app.delete('/api/scores', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.execute('TRUNCATE TABLE player_games');
        res.status(200).json({ status: 'All scores deleted successfully.' });
    } catch (error) {
        console.error('Database error in /api/scores DELETE:', error);
        res.status(500).json({ error: 'Database error when deleting scores.' });
    } finally {
        if (connection) connection.release();
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
