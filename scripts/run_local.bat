@echo off
REM Local Development Runner for Automatic Labeler Frontend (Windows)

echo =========================================
echo Starting Automatic Labeler Frontend (Local)
echo =========================================

cd /d "%~dp0\.."

REM Copy .env.local to .env if it exists
if exist .env.local (
    echo Copying .env.local to .env...
    copy /Y .env.local .env
) else (
    echo Warning: .env.local not found
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
) else (
    echo Dependencies already installed (node_modules exists)
)

REM Start development server
echo Starting development server on port 3000...
call npm start
