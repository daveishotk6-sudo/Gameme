import Photon from "./photon-sdk.js";
import { DAY_MS, DAY_START } from "../game/daycycle";

const PUN_APP_ID = "d24bf2c0-bee9-42ea-91de-7c431ba4ccb0";
const REGION = "us";

const EV_POS = 1;
const EV_BLOCK = 2;

export type Ghost = { x: number; y: number; z: number; yaw: number; t: number };
export type Ghosts = Record<string, Ghost>;
/** `pitch` (where they are looking) is optional so older clients that don't send it still work. */
export type RemotePos = { x: number; y: number; z: number; yaw: number; name: string; pitch?: number };

type Handlers = {
  onStatus: (text: string) => void;
  onCount: (count: number) => void;
  onPos: (actor: number, pos: RemotePos) => void;
  onLeave: (actor: number) => void;
  onBlock: (x: number, y: number, z: number, id: number) => void;
  /** Players who left the room, keyed by name, with where they were last seen. */
  onGhosts: (ghosts: Ghosts) => void;
};

export type PhotonLink = {
  block: (x: number, y: number, z: number, id: number) => void;
  move: (pos: RemotePos) => void;
  /** Mark a player as offline at a position (or clear them with null). Shared through the room. */
  setGhost: (name: string, ghost: Ghost | null) => void;
  /** Shared time of day (0..1) from the room's server clock, or null until it is synced. */
  time: () => number | null;
  close: () => void;
};

/** Retry helper: 1s, 2s, 4s ... capped at 15s. Does nothing once closed. */
function makeRetry(connect: () => boolean, isClosed: () => boolean) {
  let tries = 0;
  let timer = 0;
  const retry = {
    schedule() {
      if (isClosed() || timer) return;
      const wait = Math.min(15000, 1000 * 2 ** tries++);
      timer = window.setTimeout(() => {
        timer = 0;
        if (isClosed()) return;
        if (!connect()) retry.schedule();
      }, wait);
    },
    reset() {
      tries = 0;
    },
    cancel() {
      window.clearTimeout(timer);
      timer = 0;
    },
  };
  return retry;
}

export function connectPhoton(room: string, name: string, h: Handlers): PhotonLink {
  const safe = room.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "world";
  const debug = /[?&]debug\b/.test(window.location.search);
  let closed = false;
  const isClosed = () => closed;
  // The "-xxxxx" suffix keeps userIds unique per connection; the UI strips it for display.
  const newUserId = () => name.slice(0, 12) + "-" + (Math.random().toString(36) + "00000").slice(2, 7);

  // ------------------------------------------------------------ rooms (movement, blocks, clock)
  const LBC = Photon.LoadBalancing.LoadBalancingClient;
  const others = Photon.LoadBalancing.Constants.ReceiverGroup.Others;
  const cache = Photon.LoadBalancing.Constants.EventCaching.AddToRoomCache;
  const client = new LBC(Photon.ConnectionProtocol.Wss, PUN_APP_ID, "1.0");
  if (debug) client.setLogLevel(Photon.LogLevel.INFO);

  const connectRoom = (): boolean => {
    client.setUserId(newUserId());
    return !!client.connectToRegionMaster(REGION);
  };
  const roomRetry = makeRetry(connectRoom, isClosed);
  let clockSeen = false;

  // ------------------------------------------------------------ ghosts (offline players)
  const GH = "gh";
  const MAX_GHOSTS = 24;
  const WEEK = 7 * 24 * 3600 * 1000;
  const storeKey = "gameme:ghosts:" + safe;
  const clean = (o: unknown): Ghosts => {
    const out: Ghosts = {};
    if (!o || typeof o !== "object") return out;
    for (const [k, v] of Object.entries(o as Record<string, Ghost>)) {
      if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) && Date.now() - (v.t || 0) < WEEK) out[k.slice(0, 16)] = v;
    }
    return out;
  };
  const loadLocal = (): Ghosts => {
    try {
      return clean(JSON.parse(localStorage.getItem(storeKey) || "{}"));
    } catch {
      return {};
    }
  };
  const readRoom = (): Ghosts => {
    try {
      const raw = client.myRoom().getCustomProperties()[GH];
      return clean(typeof raw === "string" ? JSON.parse(raw) : {});
    } catch {
      return {};
    }
  };
  let ghosts: Ghosts = loadLocal();
  const trim = (g: Ghosts) => {
    const keys = Object.keys(g).sort((a, b) => (g[b]!.t || 0) - (g[a]!.t || 0));
    for (const k of keys.slice(MAX_GHOSTS)) delete g[k];
    return g;
  };
  const publish = (g: Ghosts, write: boolean) => {
    ghosts = trim(g);
    h.onGhosts(ghosts);
    try {
      localStorage.setItem(storeKey, JSON.stringify(ghosts));
    } catch {
      /* storage unavailable */
    }
    if (write && client.state() === LBC.State.Joined) {
      try {
        client.myRoom().setCustomProperty(GH, JSON.stringify(ghosts));
      } catch {
        /* not joined yet */
      }
    }
  };

  client.onStateChange = (state: number) => {
    const label = LBC.StateToName(state);
    if (state !== LBC.State.Joined) clockSeen = false;
    if (state === LBC.State.JoinedLobby) {
      client.myActor().setName(name.slice(0, 16));
      client.joinRoom(safe, { createIfNotExists: true }, { maxPlayers: 16 });
    }
    if (state === LBC.State.Joined) {
      roomRetry.reset();
      h.onCount(client.myRoomActorCount());
      client.syncServerTime(); // refresh the shared clock now that we're in the room
      // Room knowledge wins; anything only we remember is shared back to the room.
      publish({ ...ghosts, ...readRoom() }, true);
    }
    if (state === LBC.State.Error || state === LBC.State.Disconnected) {
      h.onStatus(closed ? label : "Reconnecting");
      roomRetry.schedule();
    } else if (state !== LBC.State.Joined) h.onStatus("Connecting");
    else h.onStatus("");
  };
  client.onError = (_code: number, msg: string) => h.onStatus(msg || "Photon error");
  client.onActorJoin = () => h.onCount(client.myRoomActorCount());
  client.onActorLeave = (actor: { actorNr: number }) => {
    h.onLeave(actor.actorNr);
    h.onCount(client.myRoomActorCount());
  };
  client.onMyRoomPropertiesChange = () => publish(readRoom(), false);
  client.onEvent = (code: number, data: RemotePos & { id?: number }, actorNr: number) => {
    if (!data || actorNr === client.myActor().actorNr) return;
    if (code === EV_POS) h.onPos(actorNr, data);
    else if (code === EV_BLOCK && data.id != null) h.onBlock(data.x, data.y, data.z, data.id);
  };

  // ------------------------------------------------------------ go
  h.onGhosts(ghosts);
  roomRetry.reset();
  connectRoom();
  const resync = window.setInterval(() => client.syncServerTime(), 60000);

  return {
    block(x, y, z, id) {
      client.raiseEvent(EV_BLOCK, { x, y, z, id }, { receivers: others, cache });
    },
    move(pos) {
      client.raiseEvent(EV_POS, pos, { receivers: others });
    },
    setGhost(who, g) {
      const base = client.state() === LBC.State.Joined ? { ...ghosts, ...readRoom() } : { ...ghosts };
      if (g) base[who.slice(0, 16)] = g;
      else delete base[who.slice(0, 16)];
      publish(base, true);
    },
    time() {
      if (client.state() !== LBC.State.Joined) return null;
      if (!clockSeen) {
        if (!client.gamePeer?.serverTimeBaseLock) return null; // first ping hasn't answered yet
        clockSeen = true;
      }
      // Photon's server clock is the same for everyone in a room.
      const ms = client.getServerTimeMs() >>> 0;
      return ((ms % DAY_MS) / DAY_MS + DAY_START) % 1;
    },
    close() {
      closed = true;
      roomRetry.cancel();
      window.clearInterval(resync);
      try {
        client.disconnect();
      } catch {
        /* already closed */
      }
    },
  };
}
