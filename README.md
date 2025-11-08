# Crossword Puzzle Game

A full-stack crossword game application featuring a C backend for dynamic puzzle generation, a Node.js/Express.js server, and a vanilla HTML/CSS/JS frontend for gameplay.

## Features

- **Dynamic Crossword Generation:** The C backend algorithmically generates a new, random crossword puzzle for each game.
- **Interactive Grid:** Play the game in your browser with an interactive grid and clue lists.
- **1v1 Multiplayer Mode:** Compete against another player in a real-time match.
- **Scoring & Answer Checking:** Your answers are checked in real-time, and a score is maintained.
- **High Score Leaderboard:** The game saves high scores to a PostgreSQL database.

## Tech Stack

- **Backend:** C (for puzzle generation), Node.js, Express.js, Socket.IO
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Database:** PostgreSQL

---

## Project Setup (Local Development)

Follow these steps to get the application running on your local machine.

### 1. Prerequisites

- A C compiler (like **GCC**)
- **Node.js** and **npm**
- A running **PostgreSQL** server

### 2. Database Setup

1.  **Connect to your PostgreSQL server** and create a database. For example:
    ```sql
    CREATE DATABASE crossword_db;
    ```
2.  **Connect to the new database**:
    ```bash
    psql crossword_db
    ```
3.  **Create the tables** by running the SQL commands found in `backend/database.sql`.
4.  **Update Credentials:** Open `server.js` and update the `connectionString` in the `new Pool` configuration to match your local PostgreSQL setup.

### 3. Install Dependencies

Navigate to the project root directory and run:

```bash
npm install
```

### 4. Running the Application Locally

1.  Open a command prompt in the `backend` directory:
    ```bash
    cd backend
    ```
2.  Run the debug batch script:
    ```bash
    debug.bat
    ```
    This script automatically compiles the C code and starts the Node.js server.
3.  Open your web browser and go to:
    [http://localhost:3000](http://localhost:3000)

---

## Deployment on Render

This application is configured for deployment on [Render](https://render.com/).

### 1. Fork the Repository

Fork this repository to your own GitHub account.

### 2. Create a New Web Service on Render

1.  Go to your Render dashboard and create a new **Web Service**.
2.  Connect your forked GitHub repository.
3.  Under **Settings**, set the following:
    *   **Build Command:** `./render-build.sh`
    *   **Start Command:** `node server.js`

### 3. Add Environment Variables

Add the following environment variables in the Render dashboard:

*   `DATABASE_URL`: Your PostgreSQL connection string (Render provides a free PostgreSQL database you can use).
*   `SESSION_SECRET`: A long, random string for session security (e.g., you can generate one with `openssl rand -hex 32`).

### 4. Deploy

Click the "Create Web Service" button. The initial build will take a few minutes as it needs to install the C compiler via the `render-build.sh` script. Once deployed, your application will be live.

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
├── render-build.sh         # Build script for Render
└── server.js               # Node.js server
```
