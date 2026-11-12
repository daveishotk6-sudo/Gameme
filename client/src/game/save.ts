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
  edits: number[];
}
const KEY = (slot: string) => `gameme:save:v1:${slot}`;
export function loadSave(slot: string): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY(slot));
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d && d.v === 1 && typeof d.seed === "number" ? d : null;
  } catch {
    return null;
  }
}
export function writeSave(d: SaveData, slot: string) {
  try {
    localStorage.setItem(KEY(slot), JSON.stringify(d));
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
