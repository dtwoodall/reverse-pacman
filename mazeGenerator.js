function generateMaze(width, height) {
    // Requires odd width and height
    const grid = [];
    for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
            row.push(1); // 1 is wall
        }
        grid.push(row);
    }

    // Depth-first search maze generation
    const stack = [];
    const startX = 1;
    const startY = 1;
    grid[startY][startX] = 0; // 0 is path
    stack.push({ x: startX, y: startY });

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = [];

        // Check valid neighbors (distance 2)
        const dirs = [
            { dx: 0, dy: -2 }, // up
            { dx: 2, dy: 0 },  // right
            { dx: 0, dy: 2 },  // down
            { dx: -2, dy: 0 }  // left
        ];

        for (const dir of dirs) {
            const nx = current.x + dir.dx;
            const ny = current.y + dir.dy;

            if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && grid[ny][nx] === 1) {
                neighbors.push({ x: nx, y: ny, dx: dir.dx, dy: dir.dy });
            }
        }

        if (neighbors.length > 0) {
            // Choose random neighbor
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];

            // Carve path
            grid[next.y - next.dy / 2][next.x - next.dx / 2] = 0;
            grid[next.y][next.x] = 0;

            stack.push({ x: next.x, y: next.y });
        } else {
            stack.pop();
        }
    }

    // Add loops by knocking down some walls
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            if (grid[y][x] === 1 && Math.random() < 0.1) {
                // Check if knocking this wall connects two paths cleanly
                const left = grid[y][x - 1] === 0;
                const right = grid[y][x + 1] === 0;
                const up = grid[y - 1][x] === 0;
                const down = grid[y + 1][x] === 0;

                // Ensure we don't create wide open 2x2 spaces too much, just loops
                if ((left && right && !up && !down) || (!left && !right && up && down)) {
                    grid[y][x] = 0;
                }
            }
        }
    }

    // Create a spawn box in center? We can do this later.
    return grid;
}

module.exports = generateMaze;
