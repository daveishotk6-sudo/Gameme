# Gameme — Browser 3D Voxel Sandbox

Playable in any browser (including iPad Safari). No local install required when deployed on Railway.

## Deploy on Railway (recommended for iPad)

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → select `daveishotk6-sudo/Gameme`.
3. Railway will automatically detect the config and run:
   - `npm run install:all`
   - `npm run build` (builds client + server)
   - `npm start` (serves the game)
4. When the deploy finishes, open the public URL Railway gives you on your iPad.

That’s it — the game runs fully in the browser.

### Optional: custom domain
In the Railway service settings you can attach a custom domain.

## What works right now
- Procedural voxel world + trees + biomes
- Place / break blocks
- Inventory + hotbar
- First-person + mobile touch controls (joystick + look)
- Day / night cycle
- Menus, pause, chat UI
- Multiplayer server ready (Colyseus)

## Controls (iPad)
- **Left side of screen** → move (virtual stick)
- **Right side** → look around (drag)
- **Tap** → break / place (depending on mode)
- Use the on-screen hotbar at the bottom
- Menu button (top right) to pause / exit

## Local development (only if you have a computer later)
```bash
npm run install:all
npm run dev:client   # or dev:server
```

## Project structure
```
/
├── client/     # React + R3F game (builds to client/dist)
├── server/     # Express + Colyseus (serves client/dist in production)
├── shared/     # Shared types
├── railway.toml
└── package.json
```
