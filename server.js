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
    maze: null,
    specialRooms: [],
    gameTicks: 0,
    walls: [] // Array of temporary walls added by Pinky
};

function startGame() {
    state.status = 'playing';
    const generated = generateMaze(79, 61); // Even larger for more room
    state.maze = generated.grid;
    state.specialRooms = generated.specialRooms;
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
        state.players[id].siphonMode = false; // For Clyde
        state.players[id].aliveTime = 0;
    }
    state.walls = []; // Clear any Pinky walls
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
    state.superPellets = [];

    // Normal pellets
    for (let y = 0; y < state.maze.length; y++) {
        for (let x = 0; x < state.maze[0].length; x++) {
            if (state.maze[y][x] === 0) {
                // Don't spawn normal pellets in the exact center of special rooms
                const skip = state.specialRooms.some(r => r.x === x && r.y === y);
                if (!skip && Math.random() < 0.3) {
                    state.pellets.push({ x, y });
                }
            }
        }
    }

    // Super Pellets in Special Rooms
    const powerUps = ['speed', 'pac_sense', 'invisibility', 'stun'];
    for (let room of state.specialRooms) {
        state.superPellets.push({
            x: room.x,
            y: room.y,
            type: powerUps[Math.floor(Math.random() * powerUps.length)]
        });
    }
}

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
            siphonMode: false,
            aliveTime: 0,
            ghostClass: 'blinky',
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

    socket.on('select_class', (cls) => {
        if (state.players[socket.id] && state.status === 'lobby') {
            const validClasses = ['blinky', 'pinky', 'inky', 'clyde'];
            if (validClasses.includes(cls)) {
                state.players[socket.id].ghostClass = cls;
                io.emit('stateUpdate', state); // Broadcast class changes to lobby
            }
        }
    });

    socket.on('ghost_toggle', () => {
        let p = state.players[socket.id];
        if (p && p.isAlive && state.status === 'playing') {
            const cls = p.ghostClass;

            if (cls === 'blinky') {
                if (p.ghostMode) {
                    p.ghostMode = false;
                } else if (p.energy >= 20) {
                    p.energy -= 20;
                    p.ghostMode = true;
                }
            } else if (cls === 'pinky') {
                if (p.energy >= 30) {
                    p.energy -= 30;
                    // Find coordinate exactly behind Pinky
                    let backX = p.x; let backY = p.y;
                    if (p.dy === -1) backY++; else if (p.dy === 1) backY--;
                    else if (p.dx === -1) backX++; else if (p.dx === 1) backX--;

                    // Wrap if needed
                    if (backX < 0) backX = state.maze[0].length - 1;
                    if (backX >= state.maze[0].length) backX = 0;
                    if (backY < 0) backY = state.maze.length - 1;
                    if (backY >= state.maze.length) backY = 0;

                    state.walls.push({ x: backX, y: backY, expiresAt: state.gameTicks + 50 });
                }
            } else if (cls === 'inky') {
                // EMP - 50 energy, 5s duration, 30s cooldown
                if (state.gameTicks >= 300) { // Can't use in first 30s
                    if (!p.lastEmpTick || state.gameTicks - p.lastEmpTick >= 300) { // 30s cooldown
                        if (p.energy >= 50) {
                            p.energy -= 50;
                            p.lastEmpTick = state.gameTicks;
                            io.emit('audio_event', 'emp');
                            for (let id in state.players) {
                                if (id !== socket.id) {
                                    state.players[id].empExpiresAt = state.gameTicks + 50;
                                }
                            }
                        }
                    }
                }
            } else if (cls === 'clyde') {
                p.siphonMode = !p.siphonMode;
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

        // Expire temporary Pinky walls
        state.walls = state.walls.filter(w => w.expiresAt > state.gameTicks);

        for (let id in state.players) {
            let p = state.players[id];
            if (!p.isAlive) continue;

            const cls = p.ghostClass;

            // Passive and Powerup Modifiers
            let speedMult = 1.0;
            let drainMult = 1.0;
            if (cls === 'pinky') { speedMult = 1.05; drainMult = 1.05; }
            if (cls === 'inky') { drainMult = 0.95; }
            if (cls === 'clyde') { speedMult = 0.95; }

            if (p.powerups && p.powerups.speed > state.gameTicks) speedMult += 0.30;
            if (p.powerups && p.powerups.stunned > state.gameTicks) speedMult = 0.0;

            // Invisibility Powerup or Ghost Mode
            const isInvisible = (p.powerups && p.powerups.invisibility > state.gameTicks);
            if (p.ghostMode) drainMult *= 5.0; // Blinky only (or powerup later)
            // No drain penalty for powerup invisibility
            if (p.siphonMode) drainMult *= 2.0; // Clyde

            // Check Clyde Siphon effect
            if (p.siphonMode && cls === 'clyde') {
                p.siphonTargets = []; // Inform UI
                const { hasLineOfSight } = require('./ai'); // Load helper
                for (let otherId in state.players) {
                    if (otherId !== id && state.players[otherId].isAlive) {
                        let other = state.players[otherId];
                        let dist = Math.max(Math.abs(p.x - other.x), Math.abs(p.y - other.y)); // Approx distance
                        if (dist <= 5 && hasLineOfSight(state, p.x, p.y, other.x, other.y)) {
                            // Steal 5 energy per second = 0.5 per tick
                            let stolen = Math.min(other.energy, 0.5);
                            other.energy -= stolen;
                            p.energy = Math.min(100, p.energy + stolen);
                            p.siphonTargets.push(otherId);
                        }
                    }
                }
            }

            // Update energy and time
            p.aliveTime += 0.1;
            let depletion = baseDepletionRate * drainMult;
            p.energy -= depletion;

            if (p.energy <= 0) {
                p.energy = 0;
                p.isAlive = false;
                p.ghostMode = false;
                p.siphonMode = false;
                continue;
            }

            // Move Accumulator
            p.moveAccumulator = (p.moveAccumulator || 0) + speedMult;
            while (p.moveAccumulator >= 1.0) {
                p.moveAccumulator -= 1.0;

                // Check if player has a queued turn and try to apply it
                if (p.nextDx !== undefined && p.nextDy !== undefined) {
                    let checkX = p.x + p.nextDx;
                    let checkY = p.y + p.nextDy;
                    if (checkX < 0) checkX = state.maze[0].length - 1;
                    if (checkX >= state.maze[0].length) checkX = 0;
                    if (checkY < 0) checkY = state.maze.length - 1;
                    if (checkY >= state.maze.length) checkY = 0;

                    const isWall = state.maze[checkY][checkX] === 1 || state.walls.some(w => w.x === checkX && w.y === checkY);
                    if (!isWall) {
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
                const isWall = state.maze[newY][newX] === 1 || state.walls.some(w => w.x === newX && w.y === newY);
                if (!isWall) {
                    p.x = newX;
                    p.y = newY;

                    // Collect normal pellet
                    if (!p.ghostMode && !isInvisible) {
                        const pIndex = state.pellets.findIndex(pellet => pellet.x === p.x && pellet.y === p.y);
                        if (pIndex !== -1) {
                            state.pellets.splice(pIndex, 1);
                            p.score++;
                            p.energy = Math.min(100, p.energy + 1);
                        }
                    }

                    // Collect Super Pellet
                    const spIndex = state.superPellets.findIndex(sp => sp.x === p.x && sp.y === p.y);
                    if (spIndex !== -1) {
                        const sp = state.superPellets[spIndex];
                        state.superPellets.splice(spIndex, 1);
                        p.score += 5; // Bonus points

                        p.powerups = p.powerups || {};
                        if (sp.type === 'speed') p.powerups.speed = state.gameTicks + 50;
                        if (sp.type === 'pac_sense') p.powerups.pacSense = state.gameTicks + 50;
                        if (sp.type === 'invisibility') p.powerups.invisibility = state.gameTicks + 50;

                        if (sp.type === 'stun') {
                            for (let otherId in state.players) {
                                if (otherId !== id && state.players[otherId].isAlive) {
                                    state.players[otherId].powerups = state.players[otherId].powerups || {};
                                    state.players[otherId].powerups.stunned = state.gameTicks + 30; // 3 seconds
                                }
                            }
                        }
                    }
                }

                // Check collision after player moves
                if (!p.ghostMode && !isInvisible && state.pacman && state.pacman.isAlive && p.x === state.pacman.x && p.y === state.pacman.y) {
                    p.isAlive = false;
                    p.ghostMode = false;
                    p.siphonMode = false;
                }
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

const initGen = generateMaze(79, 61);
state.maze = initGen.grid;
state.specialRooms = initGen.specialRooms;
initPellets();

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
