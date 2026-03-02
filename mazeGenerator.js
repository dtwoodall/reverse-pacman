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

    const specialRooms = [];

    // 1. The Warrens (Dense 11x11 block of many small walls)
    let warrenX = Math.floor(Math.random() * (width - 15)) + 2;
    let warrenY = Math.floor(Math.random() * (height - 15)) + 2;
    if (warrenX % 2 === 0) warrenX++;
    if (warrenY % 2 === 0) warrenY++;

    for (let y = warrenY; y < warrenY + 11; y++) {
        for (let x = warrenX; x < warrenX + 11; x++) {
            // Chessboard pattern creates highly dense zigzag paths
            if (x % 2 !== 0 && y % 2 !== 0) {
                grid[y][x] = 0;
            } else if (Math.random() < 0.7) {
                grid[y][x] = 1;
            } else {
                grid[y][x] = 0;
            }
        }
    }
    specialRooms.push({ type: 'warren', x: warrenX + 5, y: warrenY + 5 });

    // 2. The Long Hall (12-tile straightaway)
    const isHorizontal = Math.random() < 0.5;
    let hallX, hallY;
    if (isHorizontal) {
        hallX = Math.floor(Math.random() * (width - 16)) + 2;
        hallY = Math.floor(Math.random() * (height - 4)) + 2;
        if (hallX % 2 === 0) hallX++;
        if (hallY % 2 === 0) hallY++;
        for (let i = 0; i < 12; i++) {
            grid[hallY][hallX + i] = 0; // The hall itself
            grid[hallY - 1][hallX + i] = 1; // Solid wall top
            grid[hallY + 1][hallX + i] = 1; // Solid wall bottom
        }
        specialRooms.push({ type: 'long_hall', x: hallX + 6, y: hallY });
    } else {
        hallX = Math.floor(Math.random() * (width - 4)) + 2;
        hallY = Math.floor(Math.random() * (height - 16)) + 2;
        if (hallX % 2 === 0) hallX++;
        if (hallY % 2 === 0) hallY++;
        for (let i = 0; i < 12; i++) {
            grid[hallY + i][hallX] = 0; // The hall itself
            grid[hallY + i][hallX - 1] = 1; // Solid wall left
            grid[hallY + i][hallX + 1] = 1; // Solid wall right
        }
        specialRooms.push({ type: 'long_hall', x: hallX, y: hallY + 6 });
    }

    //3. The Atrium (7x7 open area)
    let atriumX = Math.floor(Math.random() * (width - 15)) + 4;
    let atriumY = Math.floor(Math.random() * (height - 15)) + 4;
    // ensure odd coordinates to align with DFS grid
    if (atriumX % 2 === 0) atriumX++;
    if (atriumY % 2 === 0) atriumY++;

    for (let y = atriumY; y < atriumY + 7; y++) {
        for (let x = atriumX; x < atriumX + 7; x++) {
            grid[y][x] = 0;
        }
    }
    specialRooms.push({ type: 'atrium', x: atriumX + 3, y: atriumY + 3 }); // Center

    // Add generic loops by knocking down some walls
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

    // Ensure outer border remains solid just in case mutations touched edge
    for (let x = 0; x < width; x++) { grid[0][x] = 1; grid[height - 1][x] = 1; }
    for (let y = 0; y < height; y++) { grid[y][0] = 1; grid[y][width - 1] = 1; }

    return { grid, specialRooms };
}

module.exports = generateMaze;
