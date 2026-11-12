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

## Accounts (player locking)

Players must create an account before they can play. A name can be claimed **once, ever**: names are
compared in a canonical form, so `Mike1`, `MikeI` and `mike_` all count as the same name. There is no
password reset, so a lost password means a permanently locked name (delete the entry from `users.json` to free it).

The account database is a single JSON file, `users.json`, kept in `DATA_DIR` (default `server/data/`).
Passwords are stored only as salted scrypt hashes, and IP addresses only as hashes. The file is written
atomically and the previous version is kept as `users.json.bak`. If the file exists but can't be read, the
server refuses to start rather than quietly starting empty (which would free every name).

### Hosting

The same Node server serves the game and the account API (`npm run install:all && npm run build`, then `npm start`).

* **Render:** free web services have an *ephemeral filesystem*: `users.json` is erased on every redeploy,
  restart and idle spin-down. Use a paid instance with a persistent disk. `render.yaml` sets this up
  (disk mounted at `/var/data`, `DATA_DIR=/var/data`).
* **Self-hosting:** run `npm start` on your machine and put it behind a tunnel/reverse proxy. Set
  `TRUST_PROXY_HOPS=0` if players connect directly with no proxy in front, so the per-IP limit can't be spoofed.
* **Website on a different host (e.g. Vercel):** build the client with `VITE_API_URL=https://your-api-host`
  and set `ALLOWED_ORIGINS=https://your-site` on the server.

### Settings (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATA_DIR` | `server/data` | Folder holding `users.json` (point at the persistent disk) |
| `MAX_ACCOUNTS_PER_IP` | `1` | Accounts one connection may create per window |
| `ACCOUNT_LIMIT_WINDOW_HOURS` | `24` | Length of that window |
| `TRUST_PROXY_HOPS` | `1` | Number of proxies in front of the server (`0` if none) |
| `ALLOWED_ORIGINS` | `*` | Comma-separated website origins allowed to call the API |
| `ADMIN_TOKEN` | unset | Long random value; enables `GET /api/admin/export` and `POST /api/admin/import` |
| `AUTH_SECRET` | stored in `users.json` | Optional signing secret for login tokens |

### Backups

Set `ADMIN_TOKEN`, then download the database any time:

    curl -H "x-admin-token: YOUR_TOKEN" https://your-host/api/admin/export -o users.json

and restore it with `POST /api/admin/import` (same header, the file as the body). `users.json` contains password
hashes: keep it private and never commit it (`server/data/` is git-ignored).
