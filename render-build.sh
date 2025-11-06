#!/usr/bin/env bash
set -o errexit

apt-get update && apt-get install -y build-essential
gcc backend/main.c -o backend/main
npm install
