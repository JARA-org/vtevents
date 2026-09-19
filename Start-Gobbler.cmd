@echo off
setlocal
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Install Node.js 22.22 or later and try again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci --include=dev
  if errorlevel 1 goto failed
)
if not exist apps\frontend\dist\index.html (
  call npm.cmd run build
  if errorlevel 1 goto failed
)
echo Open http://localhost:3000 in your browser after the server starts.
echo Keep this window open. Press Ctrl+C to stop My Gobbler.
call npm.cmd run local
if errorlevel 1 goto failed
exit /b 0
:failed
echo My Gobbler could not start. See the error above.
pause
exit /b 1
