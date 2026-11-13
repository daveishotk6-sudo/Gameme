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

Players must log in with a PlayFab account (just a name and a password, no email) to play. The username is
stored lowercase, so `Dave` and `dave` can't both exist. PlayFab is only the account. Photon rooms do not
ask PlayFab to check a token.

Only the public Title ID is in the code. **Never put the PlayFab Secret Key in this repo.**

### Setup

1. **PlayFab → Settings → API Features:** tick the box that prevents new accounts being created through
   anonymous login APIs (`LoginWithCustomID` etc.), so accounts can only be made through the game's signup
   (name + password).
2. **Photon dashboard → your Realtime app → Manage → Authentication:** leave custom authentication off, and
   leave "Allow anonymous clients to connect" ticked. If a PlayFab Photon add-on or the URL
   `https://15169B.playfabapi.com/photon/authenticate` is still set, remove it. Otherwise Photon will refuse
   every join.
3. **PlayFab → Settings → API Features:** tick **Allow client to view ban reason and duration**. Without it
   a banned player still gets the ban screen, but it says "No reason given" and "Time Till Expire: Unknown".
4. *(Optional)* **PlayFab → Settings → Client Profile Options:** allow the display name, so names keep their
   capital letters in game (otherwise they show in lowercase).

### Banning a player

In PlayFab: **Players →** find the player **→ Bans →** add a ban. Enter a reason (up to 140 characters) and either
a duration in hours or leave it blank for a permanent ban. The player then sees:

    You have been banned

    Reason: <your reason>
    Time Till Expire: 2d 3h 5m 12s      (or "Never (permanent ban)")

* Trying to log in while banned shows that screen, and the countdown ticks live. When it reaches zero it offers
  "Log in again".
* A player who is **already playing** is checked every 60 seconds and thrown out to the ban screen. Players are
  not kicked the instant you ban them, and this check runs in the player's browser, so a modified client could
  skip it. It stops normal players, not someone determined.
* If you ban several times, the screen shows the ban that lasts longest. Banning by IP address can affect more
  than one player.

### Lost passwords

There is no email on an account, so there is no password reset. If someone forgets their password, open
PlayFab → Players, find them, and delete the player. That frees the name so they can sign up again (their old
progress on that account is gone).

### What this does and doesn't stop

* One name per account, and banned players can't log back in until their ban ends.
* The game limits one new account per device per 24 hours. That is only a speed bump: clearing site data resets it.
* PlayFab itself does **not** limit how many accounts one person can create, and with no email required there is
  nothing at all tying an account to a real person. Someone writing a script could easily create many accounts. Stopping that needs a small signup server in
  front of PlayFab (rate limit per IP + CAPTCHA) and a PlayFab title policy that blocks direct
  `Client/RegisterPlayFabUser`.
* In-game name tags come from the player's client. Photon does not check them against the PlayFab account.
