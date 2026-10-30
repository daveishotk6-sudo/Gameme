# Gameme — Browser 3D Voxel Sandbox

Full browser-based 3D sandbox with procedural voxels, multiplayer-ready architecture, and mobile support.

## Current Features
- Procedural voxel terrain (biomes, trees, bedrock)
- Chunk streaming (load / unload)
- First-person controls (keyboard + mouse)
- Mobile touch: virtual joystick + look drag
- Place & break blocks (raycast)
- Inventory + hotbar (1-9 keys)
- Day / night cycle
- Pause menu + main menu + loading screen
- Chat UI (ready for multiplayer)
- Colyseus multiplayer server + client stub
- Host build-permission system on server

## Tech
- **Client**: React 18, TypeScript, Vite, React Three Fiber, Drei, Rapier, Zustand
- **Server**: Node.js, Colyseus, Express
- **Database**: PostgreSQL (ready)
- **Deploy target**: Railway

## Quick Start

### Client
```bash
cd client
npm install
npm run dev
```
Open http://localhost:5173

### Server
```bash
cd server
npm install
npm run dev
```
Server runs on :2567

## Controls
| Action | Desktop | Mobile |
|--------|---------|--------|
| Move | WASD | Left stick |
| Look | Mouse | Right drag |
| Jump | Space | — |
| Sprint | Shift | — |
| Break | LMB | Tap |
| Place | RMB | — |
| Hotbar | 1-9 | Tap slots |
| Pause | Esc | Menu button |

## Project Layout
```
/
├── client/src/
│   ├── game/          # Voxel engine, player, world, store
│   ├── ui/            # Menus, HUD, chat, mobile
│   └── network/       # Colyseus client
├── server/src/
│   └── rooms/         # GameRoom
└── shared/            # Shared types
```

## Roadmap remaining
- Full multiplayer sync of blocks & players
- PostgreSQL world save/load
- Adventure objectives
- Weather particles
- Friend invite links
- Railway deployment config
