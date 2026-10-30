# Gameme - Browser 3D Voxel Sandbox

Complete browser-based 3D sandbox game built with React + TypeScript + Three.js (React Three Fiber), Colyseus multiplayer, Node.js backend, and PostgreSQL.

## Features
- Procedural voxel terrain with chunk loading/unloading
- Place & break blocks
- First-person controls (keyboard + mouse / mobile touch)
- Inventory + hotbar
- Day/night cycle & weather
- Multiplayer with friend invites and host permissions
- Sandbox + Adventure modes
- Save/load worlds

## Tech Stack
- **Client**: React 18, TypeScript, Vite, React Three Fiber, Drei, Rapier physics
- **Server**: Node.js, Colyseus, Express
- **Database**: PostgreSQL
- **Deploy**: Railway

## Getting Started

### Client
```bash
cd client
npm install
npm run dev
```

### Server
```bash
cd server
npm install
npm run dev
```

Open http://localhost:5173

## Project Structure
```
/
├── client/          # React + R3F frontend
│   └── src/
│       ├── game/    # Voxel engine, player, world, UI
│       └── ...
├── server/          # Colyseus multiplayer + API
└── shared/          # Shared types & constants
```

## Development Roadmap
1. ✅ Voxel engine + terrain generation
2. Player controls + block interaction
3. Inventory / hotbar / menus
4. Multiplayer (Colyseus)
5. Persistence (PostgreSQL)
6. Polish (weather, day/night, adventure mode)
