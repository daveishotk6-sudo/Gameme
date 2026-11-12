/** Permanent world storage on Railway (Holder service). */

export const HOLDER_URL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_HOLDER_URL) ||
  "https://holder-production.up.railway.app";

export type HolderWorld = {
  room: string;
  updatedAt: string | null;
  edits: number[];
  signs: [number, number, number, number, string][];
};

function roomPath(room: string) {
  const safe = room.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "world";
  return `${HOLDER_URL.replace(/\/$/, "")}/api/worlds/${encodeURIComponent(safe)}`;
}

export async function fetchWorld(room: string): Promise<HolderWorld | null> {
  try {
    const r = await fetch(roomPath(room), { method: "GET", cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as HolderWorld;
  } catch {
    return null;
  }
}

/** Merge this client's edits/signs into the permanent store. */
export async function pushWorld(
  room: string,
  edits: number[],
  signs: [number, number, number, number, string][] = [],
): Promise<HolderWorld | null> {
  try {
    const r = await fetch(roomPath(room), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits, signs }),
    });
    if (!r.ok) return null;
    return (await r.json()) as HolderWorld;
  } catch {
    return null;
  }
}

/** Debounced pusher so we don't POST on every single block. */
export function makeHolderSync(room: string) {
  let timer = 0;
  let pendingEdits: number[] = [];
  let pendingSigns: [number, number, number, number, string][] = [];
  let closed = false;

  const flush = () => {
    timer = 0;
    if (closed) return;
    const edits = pendingEdits;
    const signs = pendingSigns;
    pendingEdits = [];
    pendingSigns = [];
    if (!edits.length && !signs.length) return;
    void pushWorld(room, edits, signs);
  };

  return {
    /** Queue a full dump (from engine.world.dumpEdits + signs). */
    queue(edits: number[], signs: [number, number, number, number, string][] = []) {
      if (closed) return;
      pendingEdits = edits;
      pendingSigns = signs;
      if (timer) return;
      timer = window.setTimeout(flush, 900);
    },
    /** Immediate flush (e.g. on leave). */
    flushNow() {
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      flush();
    },
    close() {
      closed = true;
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      // best-effort final save
      if (pendingEdits.length || pendingSigns.length) {
        void pushWorld(room, pendingEdits, pendingSigns);
      }
    },
  };
}
