#!/bin/bash

# Local Development Runner for Automatic Labeler Frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo "Starting Automatic Labeler Frontend (Local)"
echo "========================================="

cd "$PROJECT_DIR"

# Copy .env.local to .env if it exists
if [ -f .env.local ]; then
    echo "Copying .env.local to .env..."
    cp .env.local .env
else
    echo "Warning: .env.local not found"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
else
    echo "Dependencies already installed (node_modules exists)"
fi

# Start development server
echo "Starting development server on port 3000..."
npm start
