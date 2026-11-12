# Gameme

Browser voxel sandbox. Open the Railway URL on an iPad. No app install.

## Railway

The repo already has `railway.toml`. After this commit, Railway should redeploy on its own.

- Build: `npm run install:all && npm run build`
- Start: `npm start` (serves `client/dist`)

If the service still crashes, set the start command in Railway to `npm start` and redeploy.

## Play

- Desktop: click the world to look, WASD, Space jump, left click mine/hit, right click place
- iPad: left side moves, right side looks, green Jump, Mine, Place

## Mobs & cooking

- Pigs, cows, and chickens spawn near you.
- Hit them (left click / Mine) to damage; they drop raw pork, beef, or chicken.
- Place a **Furnace** (from the creative picker, or craft with 8 cobble).
- Put **coal** in any hotbar slot, select the raw meat, look at the furnace, and **hold right-click / Place** for ~2.5s to cook it:
  - Raw pork → Cooked pork
  - Raw beef → Cooked beef
  - Raw chicken → Cooked chicken

## Permanent worlds (Holder)

Builds are saved to the Railway **Holder** service so they remain after everyone leaves:

`https://holder-production.up.railway.app`

Each room code becomes `data/{room}.json` on that server. Live multiplayer still uses Photon; Holder is the long-term store.
