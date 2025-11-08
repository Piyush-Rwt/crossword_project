#!/usr/bin/env bash
# exit on error
set -o errexit

# 1. Install C compiler
echo "Installing C compiler..."
apt-get update && apt-get install -y build-essential

# 2. Compile C code
echo "Compiling C backend..."
gcc -O2 -Wall backend/main.c -o backend/main

# 3. Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install