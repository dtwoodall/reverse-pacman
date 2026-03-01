const socket = io({ transports: ['websocket'] });

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
}

function gameLoop() {
    draw();
    requestAnimationFrame(gameLoop);
}
