function spawnPacman(state) {
    const players = Object.values(state.players).filter(p => p.isAlive && !p.ghostMode);

    let bestSpot = { x: 1, y: 1 };
    let maxMinDist = -1;

    // Find the walkable tile that maximizes the minimum distance to any player
    for (let y = 1; y < state.maze.length - 1; y++) {
        for (let x = 1; x < state.maze[0].length - 1; x++) {
            if (state.maze[y][x] === 0) {
                let minDist = Infinity;
                if (players.length === 0) minDist = 10;
                for (let p of players) {
                    let d = Math.abs(p.x - x) + Math.abs(p.y - y);
                    if (d < minDist) minDist = d;
                }
                if (minDist > maxMinDist) {
                    maxMinDist = minDist;
                    bestSpot = { x, y };
                }
            }
        }
    }

    state.pacman = {
        x: bestSpot.x,
        y: bestSpot.y,
        isAlive: true,
        hasSpawned: true,
        moveAccumulator: 0,
        targetPlayerId: null,
        lastSeen: null
    };
}

function hasLineOfSight(state, x1, y1, x2, y2) {
    let dx = Math.abs(x2 - x1);
    let dy = Math.abs(y2 - y1);
    let sx = (x1 < x2) ? 1 : -1;
    let sy = (y1 < y2) ? 1 : -1;
    let err = dx - dy;

    let cx = x1;
    let cy = y1;

    while (true) {
        if (cx === x2 && cy === y2) return true;
        if (state.maze[cy][cx] === 1 || (state.walls && state.walls.some(w => w.x === cx && w.y === cy))) return false;

        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
    }
}

function getNextStepBFS(state, sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return null;

    const queue = [{ x: sx, y: sy, path: [] }];
    const visited = new Set();
    visited.add(`${sx},${sy}`);
    let iterations = 0;

    while (queue.length > 0) {
        iterations++;
        // Allow longer search for larger maps, but cap it to prevent stalls
        if (iterations > 3000) return null;
        const current = queue.shift();

        if (current.x === tx && current.y === ty) {
            return current.path[0];
        }

        const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
        for (let dir of dirs) {
            let nx = current.x + dir.dx;
            let ny = current.y + dir.dy;

            // Wraparound support logic (if map wraps)
            if (nx < 0) nx = state.maze[0].length - 1;
            if (nx >= state.maze[0].length) nx = 0;
            if (ny < 0) ny = state.maze.length - 1;
            if (ny >= state.maze.length) ny = 0;

            let key = `${nx},${ny}`;

            let isWall = state.maze[ny][nx] === 1 || (state.walls && state.walls.some(w => w.x === nx && w.y === ny));

            if (!isWall && !visited.has(key)) {
                visited.add(key);
                queue.push({
                    x: nx,
                    y: ny,
                    path: [...current.path, { x: nx, y: ny }]
                });
            }
        }
    }
    // If we can't perfectly reach it, return path towards it if we accumulated any
    return null;
}

function getCenterOfMass(state, players) {
    if (players.length === 0) return { x: 1, y: 1 };
    let sumX = 0, sumY = 0;
    for (let p of players) {
        sumX += p.x;
        sumY += p.y;
    }
    let avgX = Math.round(sumX / players.length);
    let avgY = Math.round(sumY / players.length);

    // Fallback to nearest open tile if CoM is in a wall
    if (state.maze[avgY] && state.maze[avgY][avgX] === 1) {
        const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
        for (let dir of dirs) {
            if (state.maze[avgY + dir.dy] && state.maze[avgY + dir.dy][avgX + dir.dx] === 0) {
                return { x: avgX + dir.dx, y: avgY + dir.dy };
            }
        }
    }
    return { x: avgX, y: avgY };
}

function movePacman(state) {
    if (!state.pacman || !state.pacman.isAlive) return;

    const players = Object.entries(state.players)
        .filter(([id, p]) => p.isAlive && !p.ghostMode)
        .map(([id, p]) => ({ id, ...p }));

    const isEnraged = state.gameTicks >= 1200; // 2 minutes (1200 ticks)
    let targetX = null;
    let targetY = null;

    if (isEnraged && players.length > 0) {
        // Sort players by distance
        let sortedPlayers = [...players].sort((a, b) => {
            let distA = Math.abs(a.x - state.pacman.x) + Math.abs(a.y - state.pacman.y);
            let distB = Math.abs(b.x - state.pacman.x) + Math.abs(b.y - state.pacman.y);
            return distA - distB;
        });

        // Find the closest player with a valid path
        let validPathFound = false;
        for (let closest of sortedPlayers) {
            let tX = closest.x + (closest.dx || 0) * 3;
            let tY = closest.y + (closest.dy || 0) * 3;
            tX = Math.max(0, Math.min(state.maze[0].length - 1, tX));
            tY = Math.max(0, Math.min(state.maze.length - 1, tY));

            let pathTest = getNextStepBFS(state, state.pacman.x, state.pacman.y, tX, tY);
            if (pathTest) {
                targetX = tX;
                targetY = tY;
                validPathFound = true;
                break;
            } else {
                // If predicting fails, try direct path to player
                pathTest = getNextStepBFS(state, state.pacman.x, state.pacman.y, closest.x, closest.y);
                if (pathTest) {
                    targetX = closest.x;
                    targetY = closest.y;
                    validPathFound = true;
                    break;
                }
            }
        }

        // If NO players have a valid path, default to nearest player anyway to try and wait them out
        if (!validPathFound) {
            let closest = sortedPlayers[0];
            targetX = closest.x;
            targetY = closest.y;
        }
    } else {
        // Normal Hunt
        let canSeeSomeone = false;
        if (players.length > 0) {
            for (let p of players) {
                if (hasLineOfSight(state, state.pacman.x, state.pacman.y, p.x, p.y)) {
                    state.pacman.targetPlayerId = p.id;
                    state.pacman.lastSeen = { x: p.x, y: p.y };
                    canSeeSomeone = true;
                    break;
                }
            }
        }

        if (canSeeSomeone || state.pacman.lastSeen) {
            // Chase last seen
            targetX = state.pacman.lastSeen.x;
            targetY = state.pacman.lastSeen.y;
            // Clear if reached
            if (state.pacman.x === targetX && state.pacman.y === targetY) {
                state.pacman.lastSeen = null;
                state.pacman.targetPlayerId = null;
                targetX = null;
            }
        }

        if (targetX === null) {
            // Wander to Center of Mass
            const com = getCenterOfMass(state, players);
            targetX = com.x;
            targetY = com.y;
        }
    }

    // Default to random if completely stuck without target
    if (targetX === null) {
        const moves = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
        const m = moves[Math.floor(Math.random() * moves.length)];
        targetX = state.pacman.x + m.dx;
        targetY = state.pacman.y + m.dy;
    }

    const nextStep = getNextStepBFS(state, state.pacman.x, state.pacman.y, targetX, targetY);
    if (nextStep) {
        state.pacman.x = nextStep.x;
        state.pacman.y = nextStep.y;
    } else {
        // Fallback random move
        const possibleMoves = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }].filter(dir => {
            let nx = state.pacman.x + dir.dx; let ny = state.pacman.y + dir.dy;
            if (nx < 0) nx = state.maze[0].length - 1; if (nx >= state.maze[0].length) nx = 0;
            if (ny < 0) ny = state.maze.length - 1; if (ny >= state.maze.length) ny = 0;

            let isWall = state.maze[ny][nx] === 1 || (state.walls && state.walls.some(w => w.x === nx && w.y === ny));
            return !isWall;
        });
        if (possibleMoves.length > 0) {
            const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            state.pacman.x += move.dx; state.pacman.y += move.dy;
        }
    }

    // Wrap-around bounds 
    if (state.pacman.x < 0) state.pacman.x = state.maze[0].length - 1;
    if (state.pacman.x >= state.maze[0].length) state.pacman.x = 0;
    if (state.pacman.y < 0) state.pacman.y = state.maze.length - 1;
    if (state.pacman.y >= state.maze.length) state.pacman.y = 0;

    // Check collision
    for (let id in state.players) {
        let p = state.players[id];
        if (p.isAlive && !p.ghostMode && p.x === state.pacman.x && p.y === state.pacman.y) {
            p.isAlive = false;
        }
    }
}

module.exports = { hasLineOfSight, movePacman, spawnPacman };
