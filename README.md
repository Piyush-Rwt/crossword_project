# Crossword Puzzle Game

A full-stack crossword game application featuring a C backend for dynamic puzzle generation, a Node.js/Express.js server, and a vanilla HTML/CSS/JS frontend for gameplay.

## Features

- **Dynamic Crossword Generation:** The C backend algorithmically generates a new, random crossword puzzle for each game.
- **Interactive Grid:** Play the game in your browser with an interactive grid and clue lists.
- **Scoring & Answer Checking:** Your answers are checked in real-time, and a score is maintained.
- **High Score Leaderboard:** The game saves high scores to a PostgreSQL database.
- **Player Tools:** Includes a "Show Answers" feature for when you're stuck and an option to clear the high score board.

## Tech Stack

- **Backend:** C (for puzzle generation), Node.js, Express.js
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Database:** PostgreSQL

---

## Project Setup

Follow these steps to get the application running on your local machine.

### 1. Prerequisites

- A C compiler (like **GCC**)
- **Node.js** and **npm**
- A running **PostgreSQL** server

### 2. Database Setup

You must set up the PostgreSQL database for the game to store words and high scores.

1.  **Connect to your PostgreSQL server** and create a database. For example:
    ```sql
    CREATE DATABASE crossword_db;
    ```
2.  **Connect to the new database**:
    ```bash
    psql crossword_db
    ```
3.  **Create the tables** by running the SQL commands found in `backend/database.sql`.
4.  **Update Credentials:** Open `server.js` and update the `connectionString` in the `new Pool` configuration to match your PostgreSQL setup.

### 3. Install Dependencies

Navigate to the project root directory (`C:\Users\DELL\crossword_project`) in your command prompt and run:

```bash
npm install
```

This will install the required Node.js packages (Express, pg).

---

## Running the Application

1.  Open a command prompt in the `backend` directory:
    ```bash
    cd C:\Users\DELL\crossword_project\backend
    ```
2.  Run the debug batch script:
    ```bash
    debug.bat
    ```
    This script automatically compiles the C code and starts the Node.js server.
3.  Open your web browser and go to:
    [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
crossword_project/
├── backend/
│   ├── main.c              # C code for crossword generation
│   ├── database.sql        # Correct database schema
│   └── debug.bat           # Script to compile and run the backend
├── data/
│   └── words.txt           # Word list for the generator
├── frontend/
│   ├── css/
│   │   └── style.css       # All styles for the application
│   ├── js/
│   │   ├── crossword.js    # Game logic for the play page
│   │   └── results.js      # Logic for the high scores page
│   ├── index.html          # Home page
│   ├── play.html           # Game play page
│   └── result.html         # High scores page
├── node_modules/           # Project dependencies
├── .gitignore              # Files to be ignored by Git
├── package.json            # Project metadata and dependencies
├── package-lock.json       # Exact versions of dependencies
└── server.js               # Node.js server
```

---

## In-Depth Technical Overview

This section details the technologies, data structures, and algorithms used across the different parts of the application.

### C Backend

The core of the puzzle generation is a command-line application written in C.

*   **Languages/Technologies:**
    *   **C:** Chosen for its high performance and low-level memory control, which is ideal for the computationally intensive task of crossword generation.
    *   **GCC:** Used to compile the C source code into an executable.

*   **Data Structures:**
    *   `Word struct`:
        *   **What:** A custom structure that bundles all data for a single word (the word string, its clue, length, and its placement on the grid).
        *   **Why:** It provides a clean and organized way to manage all the properties of a word as a single, cohesive unit.
    *   `char grid[][]`:
        *   **What:** A 2D array of characters that represents the game board.
        *   **Why:** This is a natural and efficient way to represent a 2D grid, allowing for direct, constant-time access to any cell using its row and column index.
    *   `int clueNumbersGrid[][]`:
        *   **What:** A parallel 2D array that stores the clue number for each cell that marks the beginning of a word.
        *   **Why:** It decouples the clue numbering from the grid of letters, which simplifies the logic for assigning and rendering the clue numbers on the frontend.

*   **Algorithms:**
    *   **Backtracking (`generateCrosswordRandom()`):**
        *   **What:** A recursive algorithm that explores all possible word placements. It works by placing a word on the grid, then recursively calling itself to place the next word. If it hits a "dead end" where no more words can be placed, it "backtracks" by undoing the last placement and trying a different one.
        *   **Why:** Backtracking is a classic and effective algorithm for solving constraint satisfaction problems like crossword generation. It guarantees finding a valid solution if one exists for the given set of words.
    *   **Fisher-Yates Shuffle (`loadWordsFromFile()`):**
        *   **What:** An algorithm used to randomize the order of words selected from the `words.txt` file.
        *   **Why:** This randomization is crucial for ensuring that a different and unpredictable puzzle is generated each time the user plays, providing high replayability.

*   **Key Functions:**
        *   `loadWordsFromFile()`: Reads the `words.txt` file, shuffles the words, and selects a set of words for the puzzle.
        *   `generateCrosswordRandom()`: The core recursive function that implements the backtracking algorithm to place words on the grid.
        *   `canPlaceWord()`: A helper function that validates a potential word placement, checking for out-of-bounds errors and letter conflicts.
        *   `assignClueNumbers()`: Iterates through the placed words to assign unique clue numbers to each starting cell.
        *   `exportCrosswordAsJson()`: Serializes the completed grid, clues, and other metadata into a JSON string to be sent to the Node.js server.

### Node.js Server

The server acts as the central coordinator for the entire application.

*   **Languages/Technologies:**
    *   **Node.js:** An asynchronous, event-driven JavaScript runtime that is well-suited for building scalable web servers that can handle many concurrent connections.
    *   **Express.js:** A minimalist web framework for Node.js that simplifies the process of building APIs and handling web traffic.

*   **Key Responsibilities:**
    *   **API Routing:** Manages all the API endpoints (e.g., `/api/generateCrossword`, `/api/checkAnswer`, `/api/scores`) that the frontend calls.
    *   **Process Management:** Uses the built-in `child_process` module to spawn the C backend executable. This allows the Node.js server to leverage the high-performance C code for puzzle generation without blocking its main event loop.
    *   **Database Interaction:** Manages a connection pool to the PostgreSQL database and executes all SQL queries for checking answers, saving scores, and fetching the leaderboard.

### Database (PostgreSQL)

*   **Technology:**
    *   **PostgreSQL:** A popular, open-source relational database management system (RDBMS) used for its reliability and widespread support.

*   **Schema:**
    *   `crossword_words` table:
        *   **What:** Stores the complete data for the *current* puzzle being played (words, clues, locations). This table is cleared and re-populated for each new game.
        *   **Why:** It provides a persistent source of truth for the current game session, allowing the server to be stateless and easily validate answers against the correct words.
    *   `player_games` table:
        *   **What:** A persistent table that stores the high scores for all completed games.
        *   **Why:** To provide the leaderboard functionality and persist player achievements across multiple game sessions.

### Frontend

The frontend is what the user sees and interacts with in their browser.

*   **Languages/Technologies:**
    *   **HTML:** Provides the fundamental structure and content of the web pages.
    *   **CSS:** Used for all styling, including the layout of the grid, colors, fonts, and the custom "gaming vibe" theme.
    *   **Vanilla JavaScript (ES6):** No frontend frameworks were used. All client-side logic is written in plain, modern JavaScript.

*   **Key Browser APIs & Techniques:**
    *   **DOM Manipulation:** Standard methods like `document.getElementById`, `createElement`, and `appendChild` are used to dynamically build the crossword grid and clue lists from the JSON data sent by the server.
    *   **Event Handling (`addEventListener`):** Manages all user interactions, such as clicking buttons and typing letters into the grid cells.
    *   **`fetch()` API:** Used for all asynchronous (AJAX) calls to the Node.js server, allowing the game to get new data, check answers, and save scores without ever needing to reload the page.
