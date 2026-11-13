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

## Accounts (PlayFab, title `15169B`)

Players must log in with a PlayFab account (username + email + password) to play. The username is stored
lowercase, so `Dave` and `dave` can't both exist, and each email can only be used once. The game then asks
PlayFab for a one-time Photon token, and Photon checks it with PlayFab, so the room knows each player by their
verified PlayFab ID and a modified client can't pretend to be another account.

Only the public Title ID is in the code. **Never put the PlayFab Secret Key in this repo.**

### Setup (do these in order)

1. **PlayFab → Settings → API Features:** tick the box that prevents new accounts being created through
   anonymous login APIs (`LoginWithCustomID` etc.), so accounts can only be made with a username + email.
2. **PlayFab → Add-ons → Multiplayer → Photon:** add the Photon *Realtime* App ID
   `d24bf2c0-bee9-42ea-91de-7c431ba4ccb0` (the same one as `PUN_APP_ID` in `client/src/net/photon.ts`).
3. **Photon dashboard → your Realtime app → Manage → Authentication → Custom Server:** set the Authentication
   URL to `https://15169B.playfabapi.com/photon/authenticate` and click Create. Leave "Allow anonymous clients"
   ticked for now.
4. **Test it:** deploy, log in on two devices, join the same room and check you can see each other.
5. **Then lock it:** back in the Photon dashboard, *untick* "Allow anonymous clients to connect". From now on
   only players with a valid PlayFab token can join; old or modified clients are refused. Do this last: doing it
   before steps 2 and 3 would stop everyone joining.
6. *(Optional)* **PlayFab → Settings → Client Profile Options:** allow the display name, so names keep their
   capital letters in game (otherwise they show in lowercase).

Until step 2 is done the game still works: it logs the PlayFab login in the console and connects without a
verified identity (which step 5 later forbids).

### Password resets

"Forgot your password?" uses PlayFab's default recovery email, which needs no setup. Try it with your own
account first and check spam. For branded emails, configure an SMTP add-on and an Account Recovery template in
PlayFab → Content → Email Templates.

### What this does and doesn't stop

* One account per email, one name per account, no impersonating another account, and banned players can't log
  back in.
* The game limits one new account per device per 24 hours. That is only a speed bump: clearing site data resets it.
* PlayFab itself does **not** limit how many accounts one person can create, and it doesn't check that an email is
  real. Someone writing a script could still create many accounts. Stopping that needs a small signup server in
  front of PlayFab (rate limit per IP + CAPTCHA) and a PlayFab title policy that blocks direct
  `Client/RegisterPlayFabUser`.
* In-game name tags come from the player's client. A modified client could still *display* another player's
  name above its own head (it still can't act as that account).
