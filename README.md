# 🕹️ Reverse Pacman

**Reverse Pacman** is a multiplayer, real-time web game where the classic roles are flipped. Players control the **ghosts** and must survive against an AI-controlled Pacman that hunts them down.

![Gameplay Preview](public/assets/gameplay.gif)

## 🌟 Key Features

-   **Multiplayer Survival**: Compete with friends in real-time to see who can stay alive the longest.
-   **Unique Ghost Classes**: Choose between Blinky, Pinky, Inky, and Clyde, each with their own specialized abilities and stats.
-   **Aggressive AI Pacman**: A custom-built AI that hunts ghosts using BFS pathfinding and line-of-sight logic, becoming faster and more dangerous over time.
-   **Procedural Maze Generation**: Every match features a randomly generated maze with unique corridors, open areas, and "Warrens."
-   **Energy Mechanics**: Collect pellets to sustain your energy. If your energy hits zero, you're out!

## 🧪 Technologies Used

-   **Backend**: Node.js, Express, Socket.io
-   **Frontend**: HTML5 Canvas, Vanilla JavaScript, CSS
-   **Logic**: Custom BFS pathfinding and procedural generation algorithms.

## 🚀 Getting Started

### Prerequisites
-   [Node.js](https://nodejs.org/) (v14 or higher recommended)
-   `npm` (comes with Node.js)

### Installation
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/dtwoodall/reverse-pacman.git
    cd reverse-pacman
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Start the server**:
    ```bash
    npm start
    ```
    *Windows users can also use the helper script:* `./start-dev.ps1`

4.  **Play**: Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🎮 Gameplay Guide

### The Ghost Classes
| Ghost | Ability | Passive |
| :--- | :--- | :--- |
| **Blinky** | **Ghost Mode**: Become intangible to avoid Pacman (uses energy). | Standard balanced stats. |
| **Pinky** | **Wall Trap**: Place a temporary wall behind you to block Pacman's path. | Slightly faster movement. |
| **Inky** | **EMP**: Stun other ghosts and hinder visibility (long cooldown). | Lower energy drain rate. |
| **Clyde** | **Siphon**: Drain energy from nearby ghosts to replenish your own. | Higher base energy capacity. |

### Power-Ups
Special rooms (Atriums) contain Super Pellets that grant temporary buffs:
-   **Speed**: Faster movement for a short duration.
-   **Pac-Sense**: Improved visibility of Pacman's location.
-   **Invisibility**: Pacman cannot target or see you.
-   **Stun**: Briefly freezes other players.

## 🤝 Contributing
Contributions are welcome! Feel free to open an issue or submit a pull request for new ghost classes, power-ups, or map features.
