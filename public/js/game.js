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

    // Inky EMP Mute Audio
    if (myPlayer.empExpiresAt && myPlayer.empExpiresAt > gameState.gameTicks) return;

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
    superPellets: [],
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

socket.on('audio_event', (type) => {
    if (type === 'spawn') {
        initAudio();
        // Creepy descending spawn sound
        playWakaBeep(800, 0.6, 1.0);
        setTimeout(() => playWakaBeep(600, 0.8, 1.5), 1000);
        setTimeout(() => playWakaBeep(300, 1.0, 2.0), 2500);
    }
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

// Class Selection Logic
const classButtons = document.querySelectorAll('.class-btn');
const classDesc = document.getElementById('class-desc');

const classDescriptions = {
    blinky: "Phantom (Blinky): Standard stats.<br>Active: Ghost Mode - Invisible & intangible for 20 energy.",
    pinky: "Trapper (Pinky): Faster (+5%), Faster drain.<br>Active: Phalanx - Drops impassable energy wall for 30 energy.",
    inky: "Saboteur (Inky): Slower drain (-5%).<br>Active: EMP - Blackouts screen & audio for others for 50 energy (30s cooldown).",
    clyde: "Vampire (Clyde): Standard stats.<br>Active: Siphon Mode - Drains 2x energy, points to players, steals 5 energy/s when close."
};

classButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove selected class from all
        classButtons.forEach(b => b.classList.remove('selected'));
        // Add selected class to clicked
        btn.classList.add('selected');

        const selectedClass = btn.getAttribute('data-class');
        if (classDesc) classDesc.innerHTML = classDescriptions[selectedClass];

        socket.emit('select_class', selectedClass);
    });
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
        let energyWidth = Math.max(0, p.energy) + "%";
        scoresHTML += `<div class="score-item" style="color: ${p.color}; border-color: ${p.color}; box-shadow: 0 0 10px ${p.color} inset; width: 80px;">
            <div style="margin-bottom: 5px;">${label}: ${p.score || 0}</div>
            <div style="width: 100%; background: #222; height: 6px; border-radius: 3px; overflow: hidden;">
                <div style="width: ${energyWidth}; background: ${p.color}; height: 100%;"></div>
            </div>
        </div>`;
    }

    scoreBoard.innerHTML = scoresHTML;

    if (gameState.status === 'lobby' || gameState.status === 'gameover') {
        lobbyContainer.style.display = 'block';

        if (gameState.status === 'gameover') {
            statusDiv.innerText = "GAME OVER!";
            statusDiv.style.color = "#f00";
            statusDiv.style.textShadow = "0 0 8px #f00";
            document.getElementById('ready-btn').style.display = 'none';
            document.getElementById('class-selection').style.display = 'none';

            // Show rankings instead of ready status
            let rankedPlayers = Object.values(gameState.players).sort((a, b) => {
                if (a.isAlive && !b.isAlive) return -1;
                if (!a.isAlive && b.isAlive) return 1;
                return b.aliveTime - a.aliveTime;
            });
            let rankHtml = '<h3 style="color:#fff; margin-top: 0; margin-bottom: 15px;">RANKINGS</h3>';
            rankedPlayers.forEach((p, index) => {
                let timeStr = (p.aliveTime).toFixed(1) + 's';
                let statusText = p.isAlive ? 'WINNER' : timeStr;
                rankHtml += `<div class="player-lobby-row" style="color: ${p.color}; text-shadow: 0 0 5px ${p.color}; margin-bottom: 8px;">${index + 1}. ${p.name}: ${statusText}</div>`;
            });
            lobbyPlayers.innerHTML = rankHtml;

        } else {
            let lobbyHTML = '';
            for (let id in gameState.players) {
                const p = gameState.players[id];
                let label = id === myId ? "YOU" : p.name;
                let readyText = p.isReady ? "READY" : "WAITING";
                let className = p.ghostClass ? p.ghostClass.toUpperCase() : "BLINKY";
                lobbyHTML += `<div class="player-lobby-row" style="color: ${p.color}; text-shadow: 0 0 5px ${p.color}">${label} (${className}): ${readyText}</div>`;
            }
            lobbyPlayers.innerHTML = lobbyHTML;

            // Show class selection UI if we are in the lobby
            document.getElementById('class-selection').style.display = 'block';

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
    if (e.code === 'Space') {
        socket.emit('ghost_toggle');
        return;
    }
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
let lastTapTime = 0;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: false });

document.addEventListener('touchend', (e) => {
    if (gameState.status !== 'playing') return;

    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;

    let touchEndX = e.changedTouches[0].screenX;
    let touchEndY = e.changedTouches[0].screenY;

    let diffX = touchEndX - touchStartX;
    let diffY = touchEndY - touchStartY;

    // Require a minimum swipe distance to avoid registering taps as swipes
    if (Math.abs(diffX) < 30 && Math.abs(diffY) < 30) {
        if (tapLength < 300 && tapLength > 0) {
            socket.emit('ghost_toggle');
            lastTapTime = 0;
            return;
        }
        lastTapTime = currentTime;
        return;
    }

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

    if (!gameState.maze) return;

    const cellSize = 30; // Slightly larger for zoom effect
    const mapWidth = gameState.maze[0].length;
    const mapHeight = gameState.maze.length;

    // Determine the center point of our camera
    let centerX = mapWidth / 2;
    let centerY = mapHeight / 2;
    const myPlayer = gameState.players[myId];
    if (myPlayer && myPlayer.isAlive && gameState.status === 'playing') {
        centerX = myPlayer.x + 0.5;
        centerY = myPlayer.y + 0.5;
    } else if (gameState.pacman && gameState.pacman.isAlive) {
        centerX = gameState.pacman.x + 0.5;
        centerY = gameState.pacman.y + 0.5; // Spectate pacman if dead
    }

    // Number of tiles visible on screen based on canvas size
    const tilesX = Math.ceil(canvas.width / cellSize);
    const tilesY = Math.ceil(canvas.height / cellSize);

    const startWorldX = centerX - (canvas.width / 2) / cellSize;
    const startWorldY = centerY - (canvas.height / 2) / cellSize;
    const startGridX = Math.floor(startWorldX);
    const startGridY = Math.floor(startWorldY);

    // Draw Maze Wrap-around
    ctx.fillStyle = '#1111CC'; // Arcade blue
    for (let y = startGridY - 1; y <= startGridY + tilesY + 1; y++) {
        for (let x = startGridX - 1; x <= startGridX + tilesX + 1; x++) {
            let mapX = x % mapWidth;
            let mapY = y % mapHeight;
            if (mapX < 0) mapX += mapWidth;
            if (mapY < 0) mapY += mapHeight;

            if (gameState.maze[mapY][mapX] === 1) {
                const screenX = (x - startWorldX) * cellSize;
                const screenY = (y - startWorldY) * cellSize;
                ctx.fillRect(screenX, screenY, cellSize + 0.75, cellSize + 0.75); // Prevent seams
            }
        }
    }

    // Helper for wrap-around entity rendering relative to camera
    function getRelativeScreenPos(ex, ey) {
        let dx = ex - centerX;
        let dy = ey - centerY;

        if (dx > mapWidth / 2) dx -= mapWidth;
        if (dx < -mapWidth / 2) dx += mapWidth;
        if (dy > mapHeight / 2) dy -= mapHeight;
        if (dy < -mapHeight / 2) dy += mapHeight;

        return {
            x: (canvas.width / 2) + dx * cellSize,
            y: (canvas.height / 2) + dy * cellSize
        };
    }

    // Draw Pinky's Walls
    if (gameState.walls) {
        ctx.fillStyle = 'rgba(255, 184, 255, 0.5)'; // Pink energy wall
        ctx.strokeStyle = '#FFB8FF';
        ctx.lineWidth = 2;
        for (let w of gameState.walls) {
            const pos = getRelativeScreenPos(w.x + 0.5, w.y + 0.5);
            if (pos.x >= -cellSize && pos.x <= canvas.width + cellSize && pos.y >= -cellSize && pos.y <= canvas.height + cellSize) {
                ctx.fillRect(pos.x - cellSize / 2, pos.y - cellSize / 2, cellSize, cellSize);
                ctx.strokeRect(pos.x - cellSize / 2, pos.y - cellSize / 2, cellSize, cellSize);
            }
        }
    }

    // Draw pellets
    ctx.fillStyle = '#FFF';
    for (let pellet of gameState.pellets) {
        const pos = getRelativeScreenPos(pellet.x + 0.5, pellet.y + 0.5);
        if (pos.x >= -cellSize && pos.x <= canvas.width + cellSize && pos.y >= -cellSize && pos.y <= canvas.height + cellSize) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
        }
    }

    // Draw Super Pellets
    if (gameState.superPellets) {
        for (let sp of gameState.superPellets) {
            const pos = getRelativeScreenPos(sp.x + 0.5, sp.y + 0.5);
            if (pos.x >= -cellSize && pos.x <= canvas.width + cellSize && pos.y >= -cellSize && pos.y <= canvas.height + cellSize) {
                if (sp.type === 'speed') ctx.fillStyle = '#FFFF00'; // Yellow
                else if (sp.type === 'pac_sense') ctx.fillStyle = '#00FF00'; // Green
                else if (sp.type === 'invisibility') ctx.fillStyle = '#800080'; // Purple
                else if (sp.type === 'stun') ctx.fillStyle = '#FF0000'; // Red
                else ctx.fillStyle = '#FFFFFF';

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.closePath();

                // Add a glow effect
                ctx.shadowBlur = 10;
                ctx.shadowColor = ctx.fillStyle;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.closePath();
                ctx.shadowBlur = 0;
            }
        }
    }

    // Draw Pac-Man
    if (gameState.pacman && gameState.pacman.isAlive) {
        const pos = getRelativeScreenPos(gameState.pacman.x + 0.5, gameState.pacman.y + 0.5);
        if (pos.x >= -cellSize && pos.x <= canvas.width + cellSize && pos.y >= -cellSize && pos.y <= canvas.height + cellSize) {
            ctx.fillStyle = '#FFFF00'; // Yellow
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, cellSize * 0.45, 0.2 * Math.PI, 1.8 * Math.PI);
            ctx.lineTo(pos.x, pos.y); // Pac-Man mouth
            ctx.fill();
            ctx.closePath();
        }
    }

    // Draw players (ghosts)
    for (let id in gameState.players) {
        const player = gameState.players[id];
        if (!player.isAlive) continue;

        const pos = getRelativeScreenPos(player.x + 0.5, player.y + 0.5);
        if (pos.x < -cellSize || pos.x > canvas.width + cellSize || pos.y < -cellSize || pos.y > canvas.height + cellSize) continue;

        if (player.ghostMode) ctx.globalAlpha = 0.4;
        if (player.siphonMode) ctx.globalAlpha = 0.7; // Visual cue for siphon

        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, cellSize * 0.4, Math.PI, 0);
        ctx.lineTo(pos.x + cellSize * 0.4, pos.y + cellSize * 0.4);
        ctx.lineTo(pos.x + cellSize * 0.2, pos.y + cellSize * 0.2);
        ctx.lineTo(pos.x, pos.y + cellSize * 0.4);
        ctx.lineTo(pos.x - cellSize * 0.2, pos.y + cellSize * 0.2);
        ctx.lineTo(pos.x - cellSize * 0.4, pos.y + cellSize * 0.4);
        ctx.fill();
        ctx.closePath();

        // Eyes
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(pos.x - cellSize * 0.15, pos.y - cellSize * 0.1, 3, 0, Math.PI * 2);
        ctx.arc(pos.x + cellSize * 0.15, pos.y - cellSize * 0.1, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();

        ctx.fillStyle = '#00F';
        ctx.beginPath();
        ctx.arc(pos.x - cellSize * 0.15, pos.y - cellSize * 0.1, 1.5, 0, Math.PI * 2);
        ctx.arc(pos.x + cellSize * 0.15, pos.y - cellSize * 0.1, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();

        if (id === myId) {
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw Clyde Siphon Tethers
        if (player.siphonTargets && player.siphonTargets.length > 0) {
            ctx.strokeStyle = '#FFB852'; // Orange tether
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            for (let targetId of player.siphonTargets) {
                const tPlayer = gameState.players[targetId];
                if (tPlayer) {
                    const tPos = getRelativeScreenPos(tPlayer.x + 0.5, tPlayer.y + 0.5);
                    ctx.beginPath();
                    ctx.moveTo(pos.x, pos.y);
                    ctx.lineTo(tPos.x, tPos.y);
                    ctx.stroke();
                }
            }
            ctx.setLineDash([]); // Reset
        }

        // Draw active power-up statuses
        if (player.powerups) {
            const yOffset = pos.y - cellSize;
            if (player.powerups.stunned > gameState.gameTicks) {
                ctx.fillStyle = '#FF0000';
                ctx.font = '10px "Press Start 2P"';
                ctx.textAlign = 'center';
                ctx.fillText("STUNNED!", pos.x, yOffset - 10);
            }
            if (player.powerups.invisibility > gameState.gameTicks) {
                ctx.fillStyle = '#800080';
                ctx.font = '10px "Press Start 2P"';
                ctx.textAlign = 'center';
                ctx.fillText("INVISIBLE", pos.x, yOffset - 10);
                if (id !== myId) {
                    // Force the other players to be fully invisible to you
                    ctx.globalAlpha = 0.0;
                }
            }
        }

        ctx.globalAlpha = 1.0;
    }



    // --- Fog of War rendering ---
    if (myPlayer && myPlayer.isAlive && gameState.status === 'playing') {
        const poly = [];
        const numRays = 360;

        // Inky EMP Check
        let maxDist = 8; // View distance in tiles
        if (myPlayer.empExpiresAt && myPlayer.empExpiresAt > gameState.gameTicks) {
            maxDist = 1.5; // Severe Fog of War reduction
        }

        for (let i = 0; i < numRays; i += 2) {
            let angle = (i * Math.PI) / 180;
            let dx = Math.cos(angle) * 0.2;
            let dy = Math.sin(angle) * 0.2;

            let cx = myPlayer.x + 0.5;
            let cy = myPlayer.y + 0.5;
            let dist = 0;

            while (dist < maxDist) {
                cx += dx;
                cy += dy;
                dist += 0.2;

                let mapX = Math.floor(cx) % mapWidth;
                let mapY = Math.floor(cy) % mapHeight;
                if (mapX < 0) mapX += mapWidth;
                if (mapY < 0) mapY += mapHeight;

                if (gameState.maze[mapY][mapX] === 1) break;
            }

            const pX = (canvas.width / 2) + (cx - (myPlayer.x + 0.5)) * cellSize;
            const pY = (canvas.height / 2) + (cy - (myPlayer.y + 0.5)) * cellSize;
            poly.push({ x: pX, y: pY });
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

            const screenPx = canvas.width / 2;
            const screenPy = canvas.height / 2;
            const grad = fogCtx.createRadialGradient(screenPx, screenPy, 0, screenPx, screenPy, maxDist * cellSize);
            grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
            grad.addColorStop(0.7, 'rgba(0, 0, 0, 1)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            fogCtx.fillStyle = grad;
            fogCtx.fill();
        }

        // Draw the fog onto the main canvas
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(fogCanvas, 0, 0);
    }

    // Draw global UI overlays over the fog of war
    if (myPlayer && myPlayer.powerups && myPlayer.powerups.pacSense > gameState.gameTicks && gameState.pacman && gameState.pacman.isAlive) {
        // Draw an arrow pointing to Pacman globally
        const pPos = getRelativeScreenPos(gameState.pacman.x + 0.5, gameState.pacman.y + 0.5);
        const myScreenPos = getRelativeScreenPos(myPlayer.x + 0.5, myPlayer.y + 0.5);

        const dx = pPos.x - myScreenPos.x;
        const dy = pPos.y - myScreenPos.y;
        const angle = Math.atan2(dy, dx);

        // Draw compass arrow at fixed distance from player
        const arrowDist = cellSize * 2;
        const arrowX = myScreenPos.x + Math.cos(angle) * arrowDist;
        const arrowY = myScreenPos.y + Math.sin(angle) * arrowDist;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(angle);
        ctx.fillStyle = '#00FF00';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-10, -5);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-10, 5);
        ctx.fill();
        ctx.restore();
    }

    // Clyde Siphon Tracking Arrows over the fog of war
    if (myPlayer && myPlayer.isAlive && myPlayer.siphonMode && myPlayer.ghostClass === 'clyde') {
        const myScreenPos = getRelativeScreenPos(myPlayer.x + 0.5, myPlayer.y + 0.5);
        for (let tId in gameState.players) {
            if (tId !== myId && gameState.players[tId].isAlive) {
                const other = gameState.players[tId];
                const oPos = getRelativeScreenPos(other.x + 0.5, other.y + 0.5);

                const dx = oPos.x - myScreenPos.x;
                const dy = oPos.y - myScreenPos.y;
                const angle = Math.atan2(dy, dx);

                const arrowDist = cellSize * 2.5; // Slightly further out to avoid overlapping Pac-Sense
                const arrowX = myScreenPos.x + Math.cos(angle) * arrowDist;
                const arrowY = myScreenPos.y + Math.sin(angle) * arrowDist;

                ctx.save();
                ctx.translate(arrowX, arrowY);
                ctx.rotate(angle);
                ctx.fillStyle = '#FFB852'; // Orange
                ctx.beginPath();
                ctx.moveTo(10, 0);
                ctx.lineTo(-10, -5);
                ctx.lineTo(-5, 0);
                ctx.lineTo(-10, 5);
                ctx.fill();
                ctx.restore();
            }
        }
    }
}

function gameLoop() {
    updateAudio();
    draw();
    requestAnimationFrame(gameLoop);
}
