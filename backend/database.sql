-- PostgreSQL schema for the crossword game

CREATE TABLE "crossword_words" (
    "id" SERIAL PRIMARY KEY,
    "word" VARCHAR(100) NOT NULL,
    "clue" TEXT NOT NULL,
    "row_idx" INT NOT NULL,
    "col_idx" INT NOT NULL,
    "direction" VARCHAR(1) NOT NULL CHECK ("direction" IN ('A', 'D')),
    "clue_number" INT NOT NULL
);

CREATE TABLE "player_games" (
    "id" SERIAL PRIMARY KEY,
    "player_name" VARCHAR(50) NOT NULL UNIQUE,
    "score" INT NOT NULL,
    "time_taken" INT NOT NULL,
    "words_solved" JSONB,
    "play_date" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "users" (
    "id" SERIAL PRIMARY KEY,
    "username" VARCHAR(50) NOT NULL UNIQUE,
    "password_hash" VARCHAR(255) NOT NULL,
    "score" INT DEFAULT 0
);