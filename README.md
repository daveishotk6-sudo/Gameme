# Gameme

Browser voxel sandbox. Open the Railway URL on an iPad. No app install.

## Railway

The repo already has `railway.toml`. After this commit, Railway should redeploy on its own.

- Build: `npm run install:all && npm run build`
- Start: `npm start` (serves `client/dist`)

If the service still crashes, set the start command in Railway to `npm start` and redeploy.

## Play

- Desktop: click the world to look, WASD, Space jump, left click mine, right click place
- iPad: left side moves, right side looks, green Jump, Mine, Place
