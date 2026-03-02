const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const generateMaze = require('./mazeGenerator');
const { movePacman, spawnPacman } = require('./ai');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Game state
const state = {
    status: 'lobby',
    players: {},
    pellets: [],
    pacman: { x: 0, y: 0 }, // To be implemented
    maze: generateMaze(49, 41), // Ensure odd numbers
    gameTicks: 0
};

function startGame() {
    state.status = 'playing';
    state.maze = generateMaze(49, 41);
    initPellets();
    initPacman();
    state.gameTicks = 0;
    for (let id in state.players) {
        state.players[id].isAlive = true;
        state.players[id].x = 1;
        state.players[id].y = 1;
        state.players[id].dx = 0;
        state.players[id].dy = 0;
        state.players[id].isReady = false;
        state.players[id].score = 0;
        state.players[id].energy = 50;
        state.players[id].ghostMode = false;
        state.players[id].aliveTime = 0;
    }
}

function checkAllReady() {
    if (state.status !== 'lobby' && state.status !== 'gameover') return;
    const playerIds = Object.keys(state.players);
    if (playerIds.length === 0) return;
    const allReady = playerIds.every(id => state.players[id].isReady);
    if (allReady) {
        startGame();
    }
}

function initPellets() {
    state.pellets = [];
    for (let y = 0; y < state.maze.length; y++) {
        for (let x = 0; x < state.maze[0].length; x++) {
            if (state.maze[y][x] === 0) {
                state.pellets.push({ x, y });
            }
        }
    }
}
initPellets();

function initPacman() {
    state.pacman = { x: 0, y: 0, isAlive: false, hasSpawned: false, moveAccumulator: 0, targetPlayerId: null, lastSeen: null };
}
initPacman();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (name) => {
        let cleanName = (name || "Ghost").substring(0, 10).toUpperCase();

        state.players[socket.id] = {
            name: cleanName,
            x: 1,
            y: 1,
            dx: 0,
            dy: 0,
            score: 0,
            energy: 0,
            ghostMode: false,
            aliveTime: 0,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            isAlive: state.status !== 'playing', // Join as spectator if game started
            isReady: false
        };

        socket.emit('init', { id: socket.id, state });
        checkAllReady();
    });

    socket.on('ready', () => {
        if (state.players[socket.id]) {
            state.players[socket.id].isReady = true;
            checkAllReady();
        }
    });

    socket.on('move', (dir) => {
        if (state.players[socket.id]) {
            state.players[socket.id].nextDx = dir.dx;
            state.players[socket.id].nextDy = dir.dy;
        }
    });

    socket.on('ghost_toggle', () => {
        let p = state.players[socket.id];
        if (p && p.isAlive && state.status === 'playing') {
            if (p.ghostMode) {
                p.ghostMode = false;
            } else if (p.energy >= 20) {
                p.energy -= 20;
                p.ghostMode = true;
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete state.players[socket.id];
        checkAllReady();
    });
});

// Game loop (10 ticks per second)
setInterval(() => {
    if (state.status === 'playing') {
        state.gameTicks++;
        const baseDepletionRate = 0.1 + (state.gameTicks / 1500) * 0.1; // Scales up slowly

        // Pac-Man Spawning (10 Seconds)
        if (state.gameTicks === 100 && state.pacman && !state.pacman.hasSpawned) {
            spawnPacman(state);
            io.emit('audio_event', 'spawn');
        }

        // Pac-Man AI Phase Speed Accumulator
        if (state.pacman && state.pacman.isAlive && state.pacman.hasSpawned) {
            let phaseTicks = Math.max(0, state.gameTicks - 100);
            let speedFactor = Math.pow(1.1, Math.floor(phaseTicks / 150));

            // Base speed is 2.5 tiles/sec. Caps at 10 tiles/sec to prevent breaking collision too easily.
            let currentSpeed = Math.min(10.0, 2.5 * speedFactor);
            state.pacman.moveAccumulator = (state.pacman.moveAccumulator || 0) + (currentSpeed * 0.1);

            while (state.pacman.moveAccumulator >= 1.0) {
                state.pacman.moveAccumulator -= 1.0;
                movePacman(state);
            }
        }

        for (let id in state.players) {
            let p = state.players[id];
            if (!p.isAlive) continue;

            // Update energy and time
            p.aliveTime += 0.1;
            let depletion = baseDepletionRate * (p.ghostMode ? 5 : 1);
            p.energy -= depletion;

            if (p.energy <= 0) {
                p.energy = 0;
                p.isAlive = false;
                p.ghostMode = false;
                continue;
            }

            // Check if player has a queued turn and try to apply it
            if (p.nextDx !== undefined && p.nextDy !== undefined) {
                let checkX = p.x + p.nextDx;
                let checkY = p.y + p.nextDy;
                if (checkX < 0) checkX = state.maze[0].length - 1;
                if (checkX >= state.maze[0].length) checkX = 0;
                if (checkY < 0) checkY = state.maze.length - 1;
                if (checkY >= state.maze.length) checkY = 0;

                if (state.maze[checkY][checkX] === 0) {
                    p.dx = p.nextDx;
                    p.dy = p.nextDy;
                    p.nextDx = undefined;
                    p.nextDy = undefined;
                }
            }

            let newX = p.x + p.dx;
            let newY = p.y + p.dy;
            if (newX < 0) newX = state.maze[0].length - 1;
            if (newX >= state.maze[0].length) newX = 0;
            if (newY < 0) newY = state.maze.length - 1;
            if (newY >= state.maze.length) newY = 0;

            // Wall collision checkout for actual move
            if (state.maze[newY][newX] === 0) { // 0 is path
                p.x = newX;
                p.y = newY;

                // Collect pellet
                const pIndex = state.pellets.findIndex(pellet => pellet.x === p.x && pellet.y === p.y);
                if (pIndex !== -1) {
                    state.pellets.splice(pIndex, 1);
                    p.score++;
                    p.energy = Math.min(100, p.energy + 1);
                }
            }
            // Check collision after player moves (Ghost mode makes intangible)
            if (!p.ghostMode && state.pacman && state.pacman.isAlive && p.x === state.pacman.x && p.y === state.pacman.y) {
                p.isAlive = false;
                p.ghostMode = false;
            }
        }

        const alivePlayers = Object.values(state.players).filter(p => p.isAlive).length;
        const numPlayers = Object.keys(state.players).length;

        // Win or Loss Reset (End if 1 or 0 players remain)
        if (numPlayers > 0 && ((numPlayers > 1 && alivePlayers <= 1) || (numPlayers === 1 && alivePlayers === 0))) {
            state.status = 'gameover';
            for (let id in state.players) {
                state.players[id].isReady = false;
            }
            setTimeout(() => {
                if (state.status === 'gameover') {
                    state.status = 'lobby';
                    io.emit('stateUpdate', state);
                }
            }, 5000);
        }
    }

    io.emit('stateUpdate', state);
}, 100);

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
