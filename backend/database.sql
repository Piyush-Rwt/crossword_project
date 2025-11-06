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

CREATE TABLE "players" (
    "player_id" SERIAL PRIMARY KEY,
    "socket_id" VARCHAR(255) NOT NULL UNIQUE,
    "is_waiting" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "active_1v1" (
    "game_id" VARCHAR(255) PRIMARY KEY,
    "player1_id" INT NOT NULL REFERENCES "players"("player_id") ON DELETE CASCADE,
    "player2_id" INT NOT NULL REFERENCES "players"("player_id") ON DELETE CASCADE,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "player1_score" INT,
    "player2_score" INT,
    "player1_time" INT,
    "player2_time" INT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);