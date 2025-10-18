@echo off
REM ===============================
REM Debug script for Crossword Project
REM ===============================

REM Step 1: Compile C backend with warnings and debug info
echo [*] Compiling main.c with debug info...
gcc -Wall -Wextra -DDEBUG -g -o main.exe main.c
if %errorlevel% neq 0 (
    echo [!] Compilation failed. Check errors above.
    pause
    exit /b
)

REM Step 2: Run C backend test
echo [*] Running main.exe generate...
.\main.exe generate
echo [*] C backend test completed.
echo.

REM Step 3: Start Node.js server
echo [*] Starting Node.js server...
REM Adjust path to server.js if needed
node ..\server.js
