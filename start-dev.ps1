# Starts the game server with nodemon in a new window so it auto-restarts on code changes
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx nodemon server.js"

# Starts ngrok in a new window for a reliable tunnel
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx ngrok http 3000"

Write-Host "Started reverse-pacman and ngrok in new windows!"
Write-Host "Please look at the ngrok window to find your randomly generated public 'Forwarding' URL." -ForegroundColor Green
Write-Host "To stop, just close the new powershell windows." -ForegroundColor Yellow
