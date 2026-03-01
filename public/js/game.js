const socket = io({ transports: ['websocket'] });

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d');

// Audio System
let audioCtx = null;
let nextWakaTime = 0;
let wakaPhase = 0;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('touchstart', initAudio, { once: true });
document.addEventListener('keydown', initAudio, { once: true });

function playWakaBeep(freq, vol, duration) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function updateAudio() {
    if (gameState.status !== 'playing' || !gameState.pacman || !gameState.pacman.isAlive) return;
    const myPlayer = gameState.players[myId];
    if (!myPlayer || !myPlayer.isAlive) return;

    const dx = gameState.pacman.x - myPlayer.x;
    const dy = gameState.pacman.y - myPlayer.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const maxDist = 15; // Silence beyond 15 tiles
    if (dist > maxDist) return;

    const now = performance.now();
    if (now > nextWakaTime) {
        let intensity = 1 - (dist / maxDist);
        // Ensure intensity is within healthy bounds
        intensity = Math.max(0.1, Math.min(1, intensity));

        const volume = intensity * 0.4;
        const speedMs = 150 + (1 - intensity) * 600;

        const pitch = wakaPhase === 0 ? 300 : 450;
        wakaPhase = 1 - wakaPhase;

        playWakaBeep(pitch + (intensity * 100), volume, speedMs / 1000);

        nextWakaTime = now + speedMs;
    }
}

let gameState = {
    players: {},
    pellets: [],
    pacman: null
};
let myId = null;

socket.on('init', (data) => {
    myId = data.id;
    gameState = data.state;
    requestAnimationFrame(gameLoop);
});

socket.on('stateUpdate', (newState) => {
    gameState = newState;
    updateUI();
});

document.getElementById('ready-btn').addEventListener('click', () => {
    socket.emit('ready');
    const btn = document.getElementById('ready-btn');
    btn.innerText = 'WAITING...';
    btn.disabled = true;
});

document.getElementById('join-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('name-input').value;
    if (nameInput.trim().length > 0) {
        socket.emit('join', nameInput.trim());
        document.getElementById('name-container').style.display = 'none';
        document.getElementById('ui-container').style.display = 'flex';
    }
});

function updateUI() {
    const statusDiv = document.getElementById('game-status');
    const scoreBoard = document.getElementById('score-board');
    const lobbyContainer = document.getElementById('lobby-container');
    const lobbyPlayers = document.getElementById('lobby-players');

    if (!gameState || !gameState.players) return;

    let aliveCount = 0;
    let scoresHTML = '';

    for (let id in gameState.players) {
        const p = gameState.players[id];
        if (p.isAlive) aliveCount++;

        let label = id === myId ? "YOU" : p.name;
        scoresHTML += `<div class="score-item" style="color: ${p.color}; border-color: ${p.color}; box-shadow: 0 0 10px ${p.color} inset;">${label}: ${p.score || 0}</div>`;
    }

    scoreBoard.innerHTML = scoresHTML;

    if (gameState.status === 'lobby' || gameState.status === 'gameover') {
        lobbyContainer.style.display = 'block';
        let lobbyHTML = '';
        for (let id in gameState.players) {
            const p = gameState.players[id];
            let label = id === myId ? "YOU" : p.name;
            let readyText = p.isReady ? "READY" : "WAITING";
            lobbyHTML += `<div class="player-lobby-row" style="color: ${p.color}; text-shadow: 0 0 5px ${p.color}">${label}: ${readyText}</div>`;
        }
        lobbyPlayers.innerHTML = lobbyHTML;

        if (gameState.status === 'gameover') {
            statusDiv.innerText = "GAME OVER!";
            statusDiv.style.color = "#f00";
            statusDiv.style.textShadow = "0 0 8px #f00";
            document.getElementById('ready-btn').style.display = 'none';
        } else {
            statusDiv.innerText = "WAITING IN LOBBY...";
            statusDiv.style.color = "#0ff";
            statusDiv.style.textShadow = "0 0 8px #0ff";
            document.getElementById('ready-btn').style.display = 'inline-block';
            if (!gameState.players[myId]?.isReady) {
                document.getElementById('ready-btn').innerText = 'READY UP';
                document.getElementById('ready-btn').disabled = false;
            }
        }
    } else {
        lobbyContainer.style.display = 'none';

        if (gameState.players[myId]) {
            if (!gameState.players[myId].isAlive) {
                statusDiv.innerText = "YOU DIED! SPECTATING...";
                statusDiv.style.color = "#f00";
                statusDiv.style.textShadow = "0 0 8px #f00";
            } else {
                statusDiv.innerText = `ALIVE GHOSTS: ${aliveCount}`;
                statusDiv.style.color = "#ff0";
                statusDiv.style.textShadow = "0 0 8px #ff0";
            }
        }
    }
}

document.addEventListener('keydown', (e) => {
    if (gameState.status !== 'playing') return;
    let dir = null;
    if (e.key === 'ArrowUp') dir = { dx: 0, dy: -1 };
    if (e.key === 'ArrowDown') dir = { dx: 0, dy: 1 };
    if (e.key === 'ArrowLeft') dir = { dx: -1, dy: 0 };
    if (e.key === 'ArrowRight') dir = { dx: 1, dy: 0 };
    if (dir) socket.emit('move', dir);
});

// Mobile Swipe Controls
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: false });

document.addEventListener('touchend', (e) => {
    if (gameState.status !== 'playing') return;
    let touchEndX = e.changedTouches[0].screenX;
    let touchEndY = e.changedTouches[0].screenY;

    let diffX = touchEndX - touchStartX;
    let diffY = touchEndY - touchStartY;

    // Require a minimum swipe distance to avoid registering taps as swipes
    if (Math.abs(diffX) < 30 && Math.abs(diffY) < 30) return;

    let dir = null;
    if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe
        if (diffX > 0) dir = { dx: 1, dy: 0 }; // Right
        else dir = { dx: -1, dy: 0 };          // Left
    } else {
        // Vertical swipe
        if (diffY > 0) dir = { dx: 0, dy: 1 }; // Down
        else dir = { dx: 0, dy: -1 };          // Up
    }

    if (dir) socket.emit('move', dir);
}, { passive: false });

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height); // Clear canvas

    // Draw maze
    if (gameState.maze) {
        const cellSize = 25;
        const offsetX = (canvas.width - Math.max(0, gameState.maze[0].length) * cellSize) / 2;
        const offsetY = (canvas.height - gameState.maze.length * cellSize) / 2;

        for (let y = 0; y < gameState.maze.length; y++) {
            for (let x = 0; x < gameState.maze[y].length; x++) {
                if (gameState.maze[y][x] === 1) {
                    ctx.fillStyle = '#1111CC'; // Arcade blue
                    ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
                }
            }
        }
    }

    // Draw players (ghosts)
    let offsetX = 0;
    let offsetY = 0;
    const cellSize = 25;
    if (gameState.maze) {
        offsetX = (canvas.width - Math.max(0, gameState.maze[0].length) * cellSize) / 2;
        offsetY = (canvas.height - gameState.maze.length * cellSize) / 2;
    }

    // Draw pellets
    ctx.fillStyle = '#FFF';
    for (let pellet of gameState.pellets) {
        const screenX = offsetX + pellet.x * cellSize + cellSize / 2;
        const screenY = offsetY + pellet.y * cellSize + cellSize / 2;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
    }

    // Draw Pac-Man
    if (gameState.pacman && gameState.pacman.isAlive) {
        const px = offsetX + gameState.pacman.x * cellSize + cellSize / 2;
        const py = offsetY + gameState.pacman.y * cellSize + cellSize / 2;
        ctx.fillStyle = '#FFFF00'; // Yellow
        ctx.beginPath();
        ctx.arc(px, py, 12, 0.2 * Math.PI, 1.8 * Math.PI);
        ctx.lineTo(px, py); // Pac-Man mouth
        ctx.fill();
        ctx.closePath();
    }

    for (let id in gameState.players) {
        const player = gameState.players[id];
        if (!player.isAlive) continue;

        const screenX = offsetX + player.x * cellSize + cellSize / 2;
        const screenY = offsetY + player.y * cellSize + cellSize / 2;

        ctx.fillStyle = player.color;
        ctx.beginPath();
        // Semi-circle top
        ctx.arc(screenX, screenY, 10, Math.PI, 0);
        // Bottom skirt
        ctx.lineTo(screenX + 10, screenY + 10);
        ctx.lineTo(screenX + 5, screenY + 6);
        ctx.lineTo(screenX, screenY + 10);
        ctx.lineTo(screenX - 5, screenY + 6);
        ctx.lineTo(screenX - 10, screenY + 10);
        ctx.fill();
        ctx.closePath();

        // Eyes
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(screenX - 4, screenY - 2, 3, 0, Math.PI * 2);
        ctx.arc(screenX + 4, screenY - 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();

        ctx.fillStyle = '#00F';
        ctx.beginPath();
        ctx.arc(screenX - 4, screenY - 2, 1.5, 0, Math.PI * 2);
        ctx.arc(screenX + 4, screenY - 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();

        // Draw identifier for self
        if (id === myId) {
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // --- Fog of War rendering ---
    const myPlayer = gameState.players[myId];
    if (myPlayer && myPlayer.isAlive && gameState.status === 'playing') {
        const px = myPlayer.x + 0.5;
        const py = myPlayer.y + 0.5;
        const poly = [];
        const numRays = 360;
        const maxDist = 8; // View distance in tiles

        for (let i = 0; i < numRays; i += 2) {
            let angle = (i * Math.PI) / 180;
            let dx = Math.cos(angle) * 0.2;
            let dy = Math.sin(angle) * 0.2;

            let cx = px;
            let cy = py;
            let dist = 0;

            while (dist < maxDist) {
                cx += dx;
                cy += dy;
                dist += 0.2;

                let gridX = Math.floor(cx);
                let gridY = Math.floor(cy);

                if (gridY < 0 || gridY >= gameState.maze.length || gridX < 0 || gridX >= gameState.maze[0].length) break;
                if (gameState.maze[gridY][gridX] === 1) break;
            }
            poly.push({
                x: offsetX + cx * cellSize,
                y: offsetY + cy * cellSize
            });
        }

        // Draw the pitch black overlay on an offscreen canvas
        fogCanvas.width = canvas.width;
        fogCanvas.height = canvas.height;
        fogCtx.fillStyle = '#000';
        fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);

        // Cut out the polygon with gradient
        fogCtx.globalCompositeOperation = 'destination-out';
        fogCtx.beginPath();
        if (poly.length > 0) {
            fogCtx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
                fogCtx.lineTo(poly[i].x, poly[i].y);
            }
            fogCtx.closePath();

            const screenPx = offsetX + px * cellSize;
            const screenPy = offsetY + py * cellSize;
            const grad = fogCtx.createRadialGradient(screenPx, screenPy, 0, screenPx, screenPy, maxDist * cellSize);
            grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
            grad.addColorStop(0.7, 'rgba(0, 0, 0, 1)'); // Sharp center
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            fogCtx.fillStyle = grad;
            fogCtx.fill();
        }

        // Draw the fog onto the main canvas
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(fogCanvas, 0, 0);
    }
}

function gameLoop() {
    updateAudio();
    draw();
    requestAnimationFrame(gameLoop);
}
