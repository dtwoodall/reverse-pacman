const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const generateMaze = require('./mazeGenerator');
const { movePacman } = require('./ai');

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
    maze: generateMaze(25, 21) // Ensure odd numbers
};

function startGame() {
    state.status = 'playing';
    state.maze = generateMaze(25, 21);
    initPellets();
    initPacman();
    for (let id in state.players) {
        state.players[id].isAlive = true;
        state.players[id].x = 1;
        state.players[id].y = 1;
        state.players[id].dx = 0;
        state.players[id].dy = 0;
        state.players[id].isReady = false;
        state.players[id].score = 0;
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
    for (let y = Math.floor(state.maze.length / 2); y < state.maze.length; y++) {
        for (let x = Math.floor(state.maze[0].length / 2); x < state.maze[0].length; x++) {
            if (state.maze[y][x] === 0) {
                state.pacman = { x, y, isAlive: true };
                return;
            }
        }
    }
    state.pacman = { x: 1, y: 1, isAlive: true };
}
initPacman();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Create new player at grid (1, 1)
    state.players[socket.id] = {
        x: 1,
        y: 1,
        dx: 0,
        dy: 0,
        score: 0,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        isAlive: true,
        isReady: false
    };

    socket.emit('init', { id: socket.id, state });

    socket.on('ready', () => {
        if (state.players[socket.id]) {
            state.players[socket.id].isReady = true;
            checkAllReady();
        }
    });

    socket.on('move', (dir) => {
        if (state.players[socket.id]) {
            state.players[socket.id].dx = dir.dx;
            state.players[socket.id].dy = dir.dy;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete state.players[socket.id];
    });
});

// Game loop (10 ticks per second)
setInterval(() => {
    if (state.status === 'playing') {
        for (let id in state.players) {
            let p = state.players[id];
            if (!p.isAlive) continue;

            let newX = p.x + p.dx;
            let newY = p.y + p.dy;

            // Wall collision checkout
            if (newY >= 0 && newY < state.maze.length && newX >= 0 && newX < state.maze[0].length) {
                if (state.maze[newY][newX] === 0) { // 0 is path
                    p.x = newX;
                    p.y = newY;

                    // Collect pellet
                    const pIndex = state.pellets.findIndex(pellet => pellet.x === p.x && pellet.y === p.y);
                    if (pIndex !== -1) {
                        state.pellets.splice(pIndex, 1);
                        p.score++;
                    }
                }
            }
            // Check collision after player moves
            if (state.pacman && state.pacman.isAlive && p.x === state.pacman.x && p.y === state.pacman.y) {
                p.isAlive = false;
            }
        }

        const alivePlayers = Object.values(state.players).filter(p => p.isAlive).length;
        const numPlayers = Object.keys(state.players).length;

        // Win or Loss Reset
        if (numPlayers > 0 && (alivePlayers === 0 || state.pellets.length === 0)) {
            state.status = 'gameover';
            for (let id in state.players) {
                state.players[id].isReady = false;
            }
            setTimeout(() => {
                if (state.status === 'gameover') {
                    state.status = 'lobby';
                    io.emit('stateUpdate', state);
                }
            }, 4000);
        }
    }

    io.emit('stateUpdate', state);
}, 100);

let pacmanTickCounter = 0;
setInterval(() => {
    if (state.status === 'playing') {
        pacmanTickCounter++;
        if (pacmanTickCounter >= 2) { // 5 ticks a sec
            pacmanTickCounter = 0;
            movePacman(state);
        }
    }
}, 100);

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
