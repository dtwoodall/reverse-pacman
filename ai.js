function getPacmanTarget(state) {
    const players = Object.values(state.players).filter(p => p.isAlive);
    if (players.length === 0) return null;

    const rand = Math.random();
    if (rand < 0.20) {
        return "random";
    } else if (rand < 0.50) {
        let best = players[0];
        for (let p of players) {
            if (p.score > best.score) best = p;
        }
        return { x: best.x, y: best.y };
    } else {
        let closest = players[0];
        let minDist = Infinity;
        for (let p of players) {
            let dist = Math.abs(p.x - state.pacman.x) + Math.abs(p.y - state.pacman.y);
            if (dist < minDist) {
                minDist = dist;
                closest = p;
            }
        }
        return { x: closest.x, y: closest.y };
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
        if (iterations > 1000) return null; // Safe guard
        const current = queue.shift();

        if (current.x === tx && current.y === ty) {
            return current.path[0];
        }

        const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
        for (let dir of dirs) {
            let nx = current.x + dir.dx;
            let ny = current.y + dir.dy;
            let key = `${nx},${ny}`;

            if (nx >= 0 && nx < state.maze[0].length && ny >= 0 && ny < state.maze.length && state.maze[ny][nx] === 0 && !visited.has(key)) {
                visited.add(key);
                queue.push({
                    x: nx,
                    y: ny,
                    path: [...current.path, { x: nx, y: ny }]
                });
            }
        }
    }
    return null;
}

function movePacman(state) {
    if (!state.pacman || !state.pacman.isAlive) return;
    const target = getPacmanTarget(state);
    if (!target) return;

    const possibleMoves = [
        { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
    ].filter(dir => {
        let nx = state.pacman.x + dir.dx;
        let ny = state.pacman.y + dir.dy;
        return nx >= 0 && nx < state.maze[0].length && ny >= 0 && ny < state.maze.length && state.maze[ny][nx] === 0;
    });

    if (possibleMoves.length === 0) return;

    if (target === "random") {
        const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        state.pacman.x += move.dx;
        state.pacman.y += move.dy;
    } else {
        const nextStep = getNextStepBFS(state, state.pacman.x, state.pacman.y, target.x, target.y);
        if (nextStep) {
            state.pacman.x = nextStep.x;
            state.pacman.y = nextStep.y;
        } else {
            const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            state.pacman.x += move.dx;
            state.pacman.y += move.dy;
        }
    }

    // Check collision with players
    for (let id in state.players) {
        let p = state.players[id];
        if (p.isAlive && p.x === state.pacman.x && p.y === state.pacman.y) {
            p.isAlive = false;
        }
    }
}

module.exports = { movePacman };
