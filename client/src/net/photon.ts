import Photon from "./photon-sdk.js";
import { DAY_MS, DAY_START } from "../game/daycycle";

/** Must match the Photon Realtime App ID entered in PlayFab's Photon add-on. */
export const PUN_APP_ID = "d24bf2c0-bee9-42ea-91de-7c431ba4ccb0";
const REGION = "us";

const EV_POS = 1;
const EV_BLOCK = 2;
const EV_SIGN = 3;
/** Full (or partial) world edit dump for late joiners / offline catch-up. */
const EV_WORLD = 4;

/** Max block edits kept in the shared room property / local backup. */
const MAX_EDITS = 2500;
/** Keep empty Photon rooms alive so builds survive while nobody is online. */
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes (Photon cloud limit-friendly)

export type Ghost = { x: number; y: number; z: number; yaw: number; t: number };
export type Ghosts = Record<string, Ghost>;
/** `pitch` (where they are looking) is optional so older clients that don't send it still work. */
export type RemotePos = { x: number; y: number; z: number; yaw: number; name: string; pitch?: number; mine?: boolean };

export type WorldEdit = { x: number; y: number; z: number; id: number };

type Handlers = {
  onStatus: (text: string) => void;
  onCount: (count: number) => void;
  onPos: (actor: number, pos: RemotePos) => void;
  onLeave: (actor: number) => void;
  onBlock: (x: number, y: number, z: number, id: number) => void;
  onSign: (s: { x: number; y: number; z: number; yaw: number; text: string }) => void;
  /** Players who left the room, keyed by name, with where they were last seen. */
  onGhosts: (ghosts: Ghosts) => void;
  /** Apply a batch of persisted world edits (join / room property / peer snapshot). */
  onWorld?: (edits: WorldEdit[]) => void;
};

/** Proof of identity for Photon's custom authentication (see playfab.ts). */
export type PhotonAuth = { playFabId: string; token: string };

export type ConnectOptions = {
  /**
   * Fetch a fresh identity token. Called before every connect and reconnect, because the token is
   * single-use. Throw an error with `expired: true` if the login is over; any other error makes the
   * game connect without a verified identity (which the Photon dashboard can forbid).
   */
  auth?: () => Promise<PhotonAuth>;
  /** The login is no longer valid: send the player back to the login screen. */
  onAuthLost?: () => void;
};

export type PhotonLink = {
  block: (x: number, y: number, z: number, id: number) => void;
  move: (pos: RemotePos) => void;
  /** Share a sign's text and direction; the room keeps it for players who join later. */
  sign: (s: { x: number; y: number; z: number; yaw: number; text: string }) => void;
  /** Mark a player as offline at a position (or clear them with null). Shared through the room. */
  setGhost: (name: string, ghost: Ghost | null) => void;
  /** Push the local world's edit list into the shared room (call after load / big changes). */
  pushWorld: (flat: number[]) => void;
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

function keyOf(x: number, y: number, z: number) {
  return `${x | 0},${y | 0},${z | 0}`;
}

function flatToMap(flat: number[]): Map<string, WorldEdit> {
  const m = new Map<string, WorldEdit>();
  for (let i = 0; i + 3 < flat.length; i += 4) {
    const x = flat[i]!, y = flat[i + 1]!, z = flat[i + 2]!, id = flat[i + 3]!;
    m.set(keyOf(x, y, z), { x, y, z, id });
  }
  return m;
}

function mapToFlat(m: Map<string, WorldEdit>): number[] {
  const out: number[] = [];
  for (const e of m.values()) out.push(e.x, e.y, e.z, e.id);
  return out;
}

function parseEdits(raw: unknown): Map<string, WorldEdit> {
  try {
    if (typeof raw === "string") raw = JSON.parse(raw);
    if (!Array.isArray(raw)) return new Map();
    return flatToMap(raw as number[]);
  } catch {
    return new Map();
  }
}

function trimMap(m: Map<string, WorldEdit>, max = MAX_EDITS) {
  if (m.size <= max) return m;
  // Drop oldest insertion order entries (Map preserves order).
  const drop = m.size - max;
  let i = 0;
  for (const k of m.keys()) {
    if (i++ >= drop) break;
    m.delete(k);
  }
  return m;
}

export function connectPhoton(room: string, name: string, h: Handlers, opts: ConnectOptions = {}): PhotonLink {
  if (!Photon?.LoadBalancing?.LoadBalancingClient) {
    throw new Error("Photon SDK failed to load");
  }
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
  else client.setLogLevel(Photon.LogLevel.ERROR);

  // Used only when there is no PlayFab identity (stable per session: changing it every retry causes flaps).
  const sessionUserId = newUserId();
  let activeRegion = REGION;
  let authFailures = 0;
  const CUSTOM_AUTH = Photon.LoadBalancing.Constants.CustomAuthenticationType;
  const connectRoom = (): boolean => {
    void (async () => {
      try {
        if (closed) return;
        h.onStatus(`Connecting (${activeRegion})`);
        let verified = false;
        if (opts.auth) {
          try {
            const a = await opts.auth();
            if (closed) return;
            // Photon forwards this query string to PlayFab, which checks the token. Don't also send a
            // userId: with custom auth, the verified PlayFab ID becomes the userId.
            client.setUserId("");
            client.setCustomAuthentication(`username=${encodeURIComponent(a.playFabId)}&token=${encodeURIComponent(a.token)}`, CUSTOM_AUTH.Custom);
            verified = true;
          } catch (err) {
            if ((err as { expired?: boolean })?.expired) {
              h.onStatus("Login expired");
              opts.onAuthLost?.();
              return;
            }
            console.warn("[photon] PlayFab identity unavailable, connecting without it:", err);
          }
        }
        if (!verified) {
          client.setCustomAuthentication("", CUSTOM_AUTH.None);
          client.setUserId(sessionUserId);
        }
        if (closed) return;
        if (!client.connectToRegionMaster(activeRegion)) roomRetry.schedule();
      } catch (err) {
        h.onStatus(String((err as Error)?.message || err));
        roomRetry.schedule();
      }
    })();
    return true;
  };
  const roomRetry = makeRetry(connectRoom, isClosed);
  let clockSeen = false;
  let joinedOnce = false;
  let connectFailCount = 0;

  // ------------------------------------------------------------ ghosts (offline players)
  const GH = "gh";
  const ED = "ed"; // world edits room property
  const MAX_GHOSTS = 24;
  const WEEK = 7 * 24 * 3600 * 1000;
  const storeKey = "gameme:ghosts:" + safe;
  const editsKey = "gameme:edits:" + safe;

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
    if (write) {
      try {
        client.myRoom().setCustomProperty(GH, JSON.stringify(ghosts));
      } catch {
        /* not joined yet */
      }
    }
  };

  // ------------------------------------------------------------ shared world edits
  let edits = new Map<string, WorldEdit>();
  try {
    edits = parseEdits(localStorage.getItem(editsKey));
  } catch {
    edits = new Map();
  }
  let editWriteTimer = 0;
  
  const persistEditsLocal = () => {
    try {
      localStorage.setItem(editsKey, JSON.stringify(mapToFlat(edits)));
    } catch {
      /* full */
    }
  };

  const readRoomEdits = (): Map<string, WorldEdit> => {
    try {
      return parseEdits(client.myRoom().getCustomProperties()[ED]);
    } catch {
      return new Map();
    }
  };

  // Photon room custom properties have a small size limit. Writing the full world
  // there was kicking clients (connect → disconnect loop). Holder + live events
  // are the real sync path; we only keep edits in memory/localStorage here.
  const writeRoomEdits = () => {
    /* intentionally no-op — do not setCustomProperty(ED, ...) */
  };

  const scheduleRoomWrite = () => {
    persistEditsLocal();
  };

  const mergeEdits = (incoming: Map<string, WorldEdit>, apply: boolean) => {
    let changed = false;
    for (const [k, e] of incoming) {
      const prev = edits.get(k);
      if (!prev || prev.id !== e.id) {
        edits.set(k, e);
        changed = true;
        if (apply) h.onBlock(e.x, e.y, e.z, e.id);
      }
    }
    if (changed) {
      trimMap(edits);
      persistEditsLocal();
    }
    return changed;
  };

  const applyAllToGame = () => {
    if (!h.onWorld) {
      for (const e of edits.values()) h.onBlock(e.x, e.y, e.z, e.id);
      return;
    }
    h.onWorld([...edits.values()]);
  };

  const rememberBlock = (x: number, y: number, z: number, id: number) => {
    edits.set(keyOf(x, y, z), { x: x | 0, y: y | 0, z: z | 0, id: id | 0 });
    trimMap(edits);
    scheduleRoomWrite();
  };

  client.onStateChange = (state: number) => {
    const label = LBC.StateToName(state);
    if (state !== LBC.State.Joined) clockSeen = false;
    if (state === LBC.State.JoinedLobby) {
      client.myActor().setName(name.slice(0, 16));
      // Keep the room around after the last player leaves so builds/cache survive.
      client.joinRoom(safe, { createIfNotExists: true }, { maxPlayers: 16 });
    }
    if (state === LBC.State.Joined) {
      authFailures = 0;
      roomRetry.reset();
      h.onCount(client.myRoomActorCount());
      client.syncServerTime();
      publish({ ...ghosts, ...readRoom() }, true);

      // Apply any room-property leftovers (older clients), then local memory.
      const roomEd = readRoomEdits();
      mergeEdits(roomEd, false);
      applyAllToGame();
      connectFailCount = 0;
      activeRegion = REGION; // stick with working region

      // Ask others for a fresh snapshot (they reply with EV_WORLD).
      try {
        client.raiseEvent(EV_WORLD, { req: 1 }, { receivers: others });
      } catch {
        /* ignore */
      }
      joinedOnce = true;
    }
    if (state === LBC.State.Joined) {
      h.onStatus("");
    } else if (state === LBC.State.Error || state === LBC.State.Disconnected) {
      if (closed) {
        h.onStatus(label);
      } else {
        connectFailCount++;
        h.onStatus("Reconnecting…");
        // Only hop region after several failures in a row.
        if (connectFailCount > 0 && connectFailCount % 3 === 0) {
          const REGIONS = ["us", "eu", "asia", "sa", "jp", "au"];
          activeRegion = REGIONS[Math.floor(connectFailCount / 3) % REGIONS.length]!;
        }
        roomRetry.schedule();
      }
    } else {
      const pretty = LBC.StateToName?.(state) || "Connecting";
      if (pretty !== "Joined") h.onStatus(pretty);
    }
  };
  client.onError = (code: number, msg: string) => {
    const textMsg = msg || `Photon error ${code}`;
    h.onStatus(textMsg);
    // 32755 / 32753: Photon (via PlayFab) refused our identity token. Twice in a row means the login is no good.
    if (opts.auth && (/32755|32753/.test(String(code) + " " + textMsg) || /custom authentication/i.test(textMsg))) {
      if (++authFailures >= 2) {
        h.onStatus("Login rejected");
        opts.onAuthLost?.();
      }
    }
    if (debug) console.warn("[photon]", code, msg);
    // Don't force an extra reconnect here — onStateChange(Disconnected) already does.
  };
  client.onActorJoin = (actor?: { actorNr: number }) => {
    h.onCount(client.myRoomActorCount());
    // When someone new arrives, send them our known world (room cache alone is not enough
    // after the room was empty, and event cache has a size limit).
    if (joinedOnce && edits.size > 0 && actor && actor.actorNr !== client.myActor().actorNr) {
      try {
        client.raiseEvent(EV_WORLD, { flat: mapToFlat(edits) }, { receivers: others });
      } catch {
        /* ignore */
      }
    }
  };
  client.onActorLeave = (actor: { actorNr: number }) => {
    h.onLeave(actor.actorNr);
    h.onCount(client.myRoomActorCount());
  };
  client.onMyRoomPropertiesChange = () => {
    publish(readRoom(), false);
    const roomEd = readRoomEdits();
    if (mergeEdits(roomEd, true)) {
      /* applied new blocks from room property */
    }
  };
  client.onEvent = (code: number, data: any, actorNr: number) => {
    if (!data) return;
    if (code === EV_POS) {
      if (actorNr === client.myActor().actorNr) return;
      h.onPos(actorNr, data);
    } else if (code === EV_BLOCK && data.id != null) {
      if (actorNr === client.myActor().actorNr) return;
      rememberBlock(data.x, data.y, data.z, data.id);
      h.onBlock(data.x, data.y, data.z, data.id);
    } else if (code === EV_SIGN && typeof data.text === "string") {
      if (actorNr === client.myActor().actorNr) return;
      h.onSign(data as { x: number; y: number; z: number; yaw: number; text: string });
    } else if (code === EV_WORLD) {
      // Peer asked for a dump, or sent one.
      if (data.req) {
        if (edits.size > 0) {
          try {
            client.raiseEvent(EV_WORLD, { flat: mapToFlat(edits) }, { receivers: others });
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (Array.isArray(data.flat)) {
        const incoming = flatToMap(data.flat as number[]);
        mergeEdits(incoming, true);
        // Share merged result back into the room property.
        scheduleRoomWrite();
      }
    }
  };

  // ------------------------------------------------------------ go
  h.onGhosts(ghosts);
  // Apply any locally remembered edits immediately (before Photon connects).
  if (edits.size > 0) {
    // Defer one tick so the engine has finished constructing.
    window.setTimeout(() => applyAllToGame(), 0);
  }
  roomRetry.reset();
  connectRoom();
  const resync = window.setInterval(() => client.syncServerTime(), 60000);

  return {
    block(x, y, z, id) {
      rememberBlock(x, y, z, id);
      try {
        client.raiseEvent(EV_BLOCK, { x, y, z, id }, { receivers: others, cache });
      } catch {
        /* offline — still stored locally + will push on rejoin */
      }
    },
    sign(s) {
      try {
        client.raiseEvent(EV_SIGN, s, { receivers: others, cache });
      } catch {
        /* offline */
      }
    },
    move(pos) {
      try {
        client.raiseEvent(EV_POS, pos, { receivers: others });
      } catch {
        /* offline */
      }
    },
    setGhost(who, g) {
      const base = client.state() === LBC.State.Joined ? { ...ghosts, ...readRoom() } : { ...ghosts };
      if (g) base[who.slice(0, 16)] = g;
      else delete base[who.slice(0, 16)];
      publish(base, true);
    },
    pushWorld(flat) {
      mergeEdits(flatToMap(flat), false);
      scheduleRoomWrite();
      if (client.state() === LBC.State.Joined) {
        try {
          client.raiseEvent(EV_WORLD, { flat: mapToFlat(edits) }, { receivers: others });
        } catch {
          /* ignore */
        }
      }
    },
    time() {
      if (client.state() !== LBC.State.Joined) return null;
      if (!clockSeen) {
        if (!client.gamePeer?.serverTimeBaseLock) return null;
        clockSeen = true;
      }
      const ms = client.getServerTimeMs() >>> 0;
      return ((ms % DAY_MS) / DAY_MS + DAY_START) % 1;
    },
    close() {
      closed = true;
      roomRetry.cancel();
      window.clearInterval(resync);
      if (editWriteTimer) {
        window.clearTimeout(editWriteTimer);
        editWriteTimer = 0;
      }
      persistEditsLocal();
      writeRoomEdits();
      try {
        client.disconnect();
      } catch {
        /* already closed */
      }
    },
  };
}
