export interface SaveData {
  v: 1;
  seed: number;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  selected: number;
  clock: number;
  health?: number;
  /** [x, y, z, yaw, text] per sign. */
  signs?: [number, number, number, number, string][];
  /** Deprecated: world blocks live on Holder only. Always empty when writing. */
  edits: number[];
}

const KEY = (slot: string) => `gameme:save:v1:${slot}`;

export function loadSave(slot: string): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY(slot));
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (!d || d.v !== 1 || typeof d.seed !== "number") return null;
    // Never restore local world blocks — Holder is the source of truth.
    d.edits = [];
    d.signs = [];
    return d;
  } catch {
    return null;
  }
}

/** Player position / hotbar only — no world edits (those go to Holder). */
export function writeSave(d: SaveData, slot: string) {
  try {
    const slim: SaveData = {
      ...d,
      edits: [],
      signs: [],
    };
    localStorage.setItem(KEY(slot), JSON.stringify(slim));
  } catch {
    /* storage full or unavailable: skip silently */
  }
}

export function clearSave(slot: string) {
  try {
    localStorage.removeItem(KEY(slot));
  } catch {
    /* ignore */
  }
}

/** Wipe all local world-related keys for a room code. */
export function clearRoomLocal(room: string) {
  const safe = room.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "world";
  const keys = [
    KEY(`room-${safe}`),
    KEY(safe),
    `gameme:edits:${safe}`,
    `gameme:ghosts:${safe}`,
  ];
  try {
    for (const k of keys) localStorage.removeItem(k);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.includes(safe) && (k.startsWith("gameme:save:") || k.startsWith("gameme:edits:") || k.startsWith("gameme:ghosts:"))) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}
