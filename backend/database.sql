CREATE TABLE IF NOT EXISTS crossword_words (
    id INT AUTO_INCREMENT PRIMARY KEY,
    word VARCHAR(100) NOT NULL,
    clue TEXT NOT NULL,
    row_idx INT NOT NULL,
    col_idx INT NOT NULL,
    direction ENUM('A','D') NOT NULL,
    clue_number INT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_name VARCHAR(50) NOT NULL,
    score INT NOT NULL,
    time_taken INT NOT NULL,
    words_solved JSON,
    play_date DATETIME DEFAULT CURRENT_TIMESTAMP
);
