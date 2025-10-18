#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <time.h>

// MySQL includes (will be added later if needed, or handled via Node.js)
// #include <mysql.h>

#define MAX_GRID_SIZE 16
#define MAX_WORDS 45
#define MAX_WORD_LENGTH 64
#define MAX_CLUE_LENGTH 256

// Structure to hold word data
typedef struct {
    char word[MAX_WORD_LENGTH];
    char clue[MAX_CLUE_LENGTH];
    int row, col;
    char dir; // 'A' for across, 'D' for down
    int id; // Unique ID for the word
    int clueNumber; // Number displayed on the grid
    int length; // Length of the word
} Word;

// Global variables for the grid and word list
char grid[MAX_GRID_SIZE][MAX_GRID_SIZE];
int clueNumbersGrid[MAX_GRID_SIZE][MAX_GRID_SIZE]; // Stores clue numbers for each cell
Word words[MAX_WORDS];
int numWords = 0;
int currentWordId = 1; // Auto-incrementing ID for words
int currentClueNumber = 1; // Auto-incrementing for clue numbering

// Function prototypes
void initializeGrid();
void printGrid();
void loadWordsFromFile(const char* filename);
bool canPlaceWord(const Word* newWord, bool isFirstWord);
void placeWordOnGrid(const Word* newWord, char* overwritten);
void removeWordFromGrid(const Word* wordToRemove, const char* overwritten);
void assignClueNumbers();
bool generateCrosswordRandom(int wordIndex);
void exportCrosswordAsJson();
bool checkUserAnswer(int word_id, const char *user_word);
void end_game_save(const char *player_name, int score, int time_taken, const char *words_json);

bool generateStaticCrossword();

int main(int argc, char *argv[]) {
    srand(time(NULL)); // Seed for randomization

    if (argc > 1 && strcmp(argv[1], "generate") == 0) {
        int attempts = 0;
        bool success = false;
        while (attempts < 10 && !success) {
            #ifdef DEBUG
            fprintf(stderr, "Generation attempt %d...\n", attempts + 1);
            #endif
            loadWordsFromFile("../data/words.txt");
            initializeGrid();
            if (generateCrosswordRandom(0)) {
assignClueNumbers();
                exportCrosswordAsJson();
                success = true;
            }
            attempts++;
        }
        if (!success) {
            fprintf(stderr, "{\"error\": \"Failed to generate crossword after 10 attempts.\"}\n");
        }
    } else if (argc > 1 && strcmp(argv[1], "generate-static") == 0) {
        if (generateStaticCrossword()) {
            assignClueNumbers();
            exportCrosswordAsJson();
        } else {
            fprintf(stderr, "{\"error\": \"Failed to generate static crossword.\"}\n");
        }
    } else if (argc > 4 && strcmp(argv[1], "checkAnswer") == 0) {
        // Example: ./main checkAnswer <word_id> <user_word> <correct_word>
        // int word_id = atoi(argv[2]); // Unused for now
        const char* user_word = argv[3];
        const char* correct_word = argv[4]; // In a real scenario, this would come from DB/memory

        // For demonstration, we'll just compare directly
        bool correct = (strcmp(user_word, correct_word) == 0);
        fprintf(stdout, "{\"correct\": %s, \"scoreDelta\": %d}\n", correct ? "true" : "false", correct ? 10 : 0);

    } else if (argc > 5 && strcmp(argv[1], "endGame") == 0) {
        // Example: ./main endGame <player_name> <score> <time_taken> <words_json>
        const char* player_name = argv[2];
        int score = atoi(argv[3]);
        int time_taken = atoi(argv[4]);
        const char* words_json = argv[5]; // JSON string of solved words

        // This function will interact with MySQL
        end_game_save(player_name, score, time_taken, words_json);
        fprintf(stdout, "{\"status\": \"Game saved successfully.\"}\n");
    } else {
        fprintf(stderr, "Usage: ./main generate | ./main generate-static | ./main checkAnswer <word_id> <user_word> <correct_word> | ./main endGame <player_name> <score> <time_taken> <words_json>\n");
    }


    return 0;
}

bool generateStaticCrossword() {
    initializeGrid();
    numWords = 3;

    // Word 1: AGENT
    strcpy(words[0].word, "AGENT");
    strcpy(words[0].clue, "Spy");
    words[0].length = 5;
    words[0].row = 0;
    words[0].col = 0;
    words[0].dir = 'A';
    words[0].id = 1;

    // Word 2: GAME
    strcpy(words[1].word, "GAME");
    strcpy(words[1].clue, "Fun activity");
    words[1].length = 4;
    words[1].row = 0;
    words[1].col = 1;
    words[1].dir = 'D';
    words[1].id = 2;

    // Word 3: EMPTY
    strcpy(words[2].word, "EMPTY");
    strcpy(words[2].clue, "Containing nothing");
    words[2].length = 5;
    words[2].row = 2;
    words[2].col = 0;
    words[2].dir = 'A';
    words[2].id = 3;

    // Place words on grid
    char overwritten[MAX_WORD_LENGTH];
    placeWordOnGrid(&words[0], overwritten);
    placeWordOnGrid(&words[1], overwritten);
    placeWordOnGrid(&words[2], overwritten);

    return true;
}

// Initializes the grid with empty cells (e.g., '*') and clue numbers to 0
void initializeGrid() {
    for (int i = 0; i < MAX_GRID_SIZE; i++) {
        for (int j = 0; j < MAX_GRID_SIZE; j++) {
            grid[i][j] = ' '; // Use space for empty cells
            clueNumbersGrid[i][j] = 0;
        }
    }
    currentWordId = 1;
    currentClueNumber = 1;
}

// Prints the grid to console (for debugging)
void printGrid() {
    for (int i = 0; i < MAX_GRID_SIZE; i++) {
        for (int j = 0; j < MAX_GRID_SIZE; j++) {
            printf("%c ", grid[i][j]);
        }
        printf("\n");
    }
}

// Loads words and clues from a file
void loadWordsFromFile(const char* filename) {
    currentWordId = 1; // Reset word ID for each new generation
    FILE* file = fopen(filename, "r");
    if (!file) {
        fprintf(stderr, "Error: Could not open words file %s\n", filename);
        return;
    }

    char line[MAX_CLUE_LENGTH + MAX_WORD_LENGTH + 10]; // Buffer for a line
    Word tempWords[MAX_WORDS]; // Temporary storage for all words
    int tempNumWords = 0;

    while (fgets(line, sizeof(line), file) && tempNumWords < MAX_WORDS) {
        // Format: WORD,CLUE
        char* word_str = strtok(line, ",");
        char* clue_str = strtok(NULL, "\n"); // Get rest of the line as clue

        if (word_str && clue_str) {
            // Remove trailing newline from word_str if present (strtok might leave it)
            size_t word_len = strlen(word_str);
            if (word_len > 0 && word_str[word_len - 1] == '\r') {
                word_str[word_len - 1] = '\0';
                word_len--;
            }

            // Filter words by length suitable for MAX_GRID_SIZE
            if (word_len > 0 && word_len <= MAX_GRID_SIZE) {
                strncpy(tempWords[tempNumWords].word, word_str, MAX_WORD_LENGTH - 1);
                tempWords[tempNumWords].word[MAX_WORD_LENGTH - 1] = '\0';
                strncpy(tempWords[tempNumWords].clue, clue_str, MAX_CLUE_LENGTH - 1);
                tempWords[tempNumWords].clue[MAX_CLUE_LENGTH - 1] = '\0';
                tempWords[tempNumWords].length = word_len;
                tempWords[tempNumWords].id = currentWordId++;
                tempWords[tempNumWords].clueNumber = 0; // Assigned later
                tempNumWords++;
            }
        }
    }
    fclose(file);

    // --- New word selection logic ---
    // Shuffle all the loaded words to randomize selection.
    for (int i = 0; i < tempNumWords; i++) {
        int j = rand() % tempNumWords;
        Word temp = tempWords[i];
        tempWords[i] = tempWords[j];
        tempWords[j] = temp;
    }

    // Select all available words, up to MAX_WORDS, to attempt to place on the grid.
    numWords = 0;
    for (int i = 0; i < tempNumWords && numWords < MAX_WORDS; i++) {
        words[numWords++] = tempWords[i];
    }

    // Shuffle the final selected words before attempting to place them.
    // This is important for the backtracking algorithm to try different placement orders.
    for (int i = 0; i < numWords; i++) {
        int j = rand() % numWords;
        Word temp = words[i];
        words[i] = words[j];
        words[j] = temp;
    }

    #ifdef DEBUG
    fprintf(stderr, "Selected words for generation (balanced mix):\n");
    for (int i = 0; i < numWords; i++) {
        fprintf(stderr, "- %s\n", words[i].word);
    }
    #endif
}

// Checks if a word can be placed on the grid.
bool canPlaceWord(const Word* newWord, bool isFirstWord) {
    int r = newWord->row;
    int c = newWord->col;
    int len = newWord->length;
    int intersections = 0;

    // Check boundaries first
    if (newWord->dir == 'A') { // Across
        if (c + len > MAX_GRID_SIZE) return false;
    } else { // Down
        if (r + len > MAX_GRID_SIZE) return false;
    }

    // Check for conflicts and count intersections
    for (int i = 0; i < len; i++) {
        int curR = r + (newWord->dir == 'D' ? i : 0);
        int curC = c + (newWord->dir == 'A' ? i : 0);

        if (grid[curR][curC] != ' ') {
            if (grid[curR][curC] != newWord->word[i]) {
                return false; // Conflict with existing letter
            }
            intersections++; // This is a valid intersection
        }
    }

    // For any word after the first, it must intersect with at least one existing word.
    if (!isFirstWord && intersections == 0) {
        return false;
    }

    return true;
}

// Places a word on the grid, saving the overwritten characters.
void placeWordOnGrid(const Word* newWord, char* overwritten) {
    for (int i = 0; i < newWord->length; i++) {
        int curR = newWord->row + (newWord->dir == 'D' ? i : 0);
        int curC = newWord->col + (newWord->dir == 'A' ? i : 0);
        overwritten[i] = grid[curR][curC];
        grid[curR][curC] = newWord->word[i];
    }
}

// Removes a word from the grid by restoring the overwritten characters.
void removeWordFromGrid(const Word* wordToRemove, const char* overwritten) {
    for (int i = 0; i < wordToRemove->length; i++) {
        int curR = wordToRemove->row + (wordToRemove->dir == 'D' ? i : 0);
        int curC = wordToRemove->col + (wordToRemove->dir == 'A' ? i : 0);
        grid[curR][curC] = overwritten[i];
    }
}

// Assigns clue numbers to all placed words, handling shared starting cells.
void assignClueNumbers() {
    // Reset clue numbers grid and word clue numbers
    for (int i = 0; i < MAX_GRID_SIZE; i++) {
        for (int j = 0; j < MAX_GRID_SIZE; j++) {
            clueNumbersGrid[i][j] = 0;
        }
    }
    for (int i = 0; i < numWords; i++) {
        words[i].clueNumber = 0;
    }
    currentClueNumber = 1;

    // Iterate through words and assign clue numbers
    for (int i = 0; i < numWords; i++) {
        // If word already has a number, skip (because it shares a start with a previous word)
        if (words[i].clueNumber != 0) {
            continue;
        }

        // Assign the new clue number
        words[i].clueNumber = currentClueNumber;
        clueNumbersGrid[words[i].row][words[i].col] = currentClueNumber;

        // Check for other words starting at the same spot
        for (int j = i + 1; j < numWords; j++) {
            if (words[j].row == words[i].row && words[j].col == words[i].col) {
                words[j].clueNumber = currentClueNumber;
            }
        }
        currentClueNumber++;
    }
}


// Backtracking function to generate the crossword.
bool generateCrosswordRandom(int wordIndex) {
    if (wordIndex == numWords) {
        return true; // All words have been successfully placed.
    }

    Word* currentWord = &words[wordIndex];
    bool isFirstWord = (wordIndex == 0);

    typedef struct {
        int r, c;
        char dir;
    } Placement;

    Placement possiblePlacements[MAX_GRID_SIZE * MAX_GRID_SIZE * 2];
    int numPossiblePlacements = 0;

    // Find all valid placements for the current word.
    for (int r = 0; r < MAX_GRID_SIZE; r++) {
        for (int c = 0; c < MAX_GRID_SIZE; c++) {
            // Try placing Across
            currentWord->row = r;
            currentWord->col = c;
            currentWord->dir = 'A';
            if (canPlaceWord(currentWord, isFirstWord)) {
                possiblePlacements[numPossiblePlacements++] = (Placement){r, c, 'A'};
            }

            // Try placing Down
            currentWord->row = r;
            currentWord->col = c;
            currentWord->dir = 'D';
            if (canPlaceWord(currentWord, isFirstWord)) {
                possiblePlacements[numPossiblePlacements++] = (Placement){r, c, 'D'};
            }
        }
    }

    // Shuffle possible placements for random crossword generation.
    for (int i = 0; i < numPossiblePlacements; i++) {
        int j = rand() % numPossiblePlacements;
        Placement temp = possiblePlacements[i];
        possiblePlacements[i] = possiblePlacements[j];
        possiblePlacements[j] = temp;
    }

    // Try each valid placement and recurse.
    for (int i = 0; i < numPossiblePlacements; i++) {
        currentWord->row = possiblePlacements[i].r;
        currentWord->col = possiblePlacements[i].c;
        currentWord->dir = possiblePlacements[i].dir;

        #ifdef DEBUG
        fprintf(stderr, "Placing word '%s' at row %d, col %d, dir %c\n", currentWord->word, currentWord->row, currentWord->col, currentWord->dir);
        #endif
        char overwritten[MAX_WORD_LENGTH];
        placeWordOnGrid(currentWord, overwritten);

        if (generateCrosswordRandom(wordIndex + 1)) {
            return true; // Successfully placed this and subsequent words.
        }

        #ifdef DEBUG
        fprintf(stderr, "Backtracking word '%s' from row %d, col %d, dir %c\n", currentWord->word, currentWord->row, currentWord->col, currentWord->dir);
        #endif
        removeWordFromGrid(currentWord, overwritten); // Backtrack if subsequent placement failed.
    }

    // If no placement for the current word leads to a full solution, return false.
    return false;
}


// Exports the generated crossword data as JSON
void exportCrosswordAsJson() {
    fprintf(stdout, "{\n");
    fprintf(stdout, "  \"grid\": [");
    for (int r = 0; r < MAX_GRID_SIZE; r++) {
        fprintf(stdout, "[");
        for (int c = 0; c < MAX_GRID_SIZE; c++) {
            fprintf(stdout, "\"%c\"%s", grid[r][c], (c == MAX_GRID_SIZE - 1) ? "" : ",");
        }
        fprintf(stdout, "]%s", (r == MAX_GRID_SIZE - 1) ? "" : ",");
    }
    fprintf(stdout, "],\n");

    fprintf(stdout, "  \"clueNumbers\": [");
    for (int r = 0; r < MAX_GRID_SIZE; r++) {
        fprintf(stdout, "[");
        for (int c = 0; c < MAX_GRID_SIZE; c++) {
            fprintf(stdout, "%d%s", clueNumbersGrid[r][c], (c == MAX_GRID_SIZE - 1) ? "" : ",");
        }
        fprintf(stdout, "]%s", (r == MAX_GRID_SIZE - 1) ? "" : ",");
    }
    fprintf(stdout, "],\n");

    fprintf(stdout, "  \"clues\": [");
    bool firstClue = true;
    for (int i = 0; i < numWords; i++) {
        if (words[i].clueNumber > 0) { // Only export words that were successfully placed and numbered
            if (!firstClue) {
                fprintf(stdout, ",\n");
            }
            fprintf(stdout, "    {\"number\":%d,\"dir\":\"%c\",\"text\":\"%s\",\"word_id\":%d,\"length\":%d,\"row\":%d,\"col\":%d,\"word\":\"%s\"}",
                    words[i].clueNumber, words[i].dir, words[i].clue, words[i].id, words[i].length, words[i].row, words[i].col, words[i].word);
            firstClue = false;
        }
    }
    fprintf(stdout, "]\n");
    fprintf(stdout, "}\n");
}

// Checks if user's answer matches the correct word (simplified for now)
bool checkUserAnswer(int word_id, const char *user_word) {
    (void)word_id; // Mark as unused
    (void)user_word; // Mark as unused
    // In a real scenario, this would query a database or a stored list of correct words
    // For this C backend, we'll assume the correct word is passed as an argument for now
    // and Node.js will handle fetching the correct word based on word_id.
    // This function is more of a placeholder for the C backend's role in validation.
    return false; // Placeholder
}

// Saves game results to MySQL (placeholder for now)
void end_game_save(const char *player_name, int score, int time_taken, const char *words_json) {
    // This function would typically connect to a MySQL database
    // and execute INSERT statements.
    // For now, we'll just print the data to stderr as a log.
    fprintf(stderr, "Saving game: Player=%s, Score=%d, Time=%d, WordsSolved=%s\n",
            player_name, score, time_taken, words_json);

    // Example of how MySQL connection might look (requires libmysqlclient-dev)
    /*
    MYSQL *conn;
    conn = mysql_init(NULL);
    if (!mysql_real_connect(conn, "localhost", "user", "password", "database", 0, NULL, 0)) {
        fprintf(stderr, "Error: %s\n", mysql_error(conn));
        return;
    }

    char query[1024];
    snprintf(query, sizeof(query),
             "INSERT INTO player_games (player_name, score, time_taken, words_solved) VALUES ('%s', %d, %d, '%s')",
             player_name, score, time_taken, words_json);

    if (mysql_query(conn, query)) {
        fprintf(stderr, "Error: %s\n", mysql_error(conn));
    }

    mysql_close(conn);
    */
}
