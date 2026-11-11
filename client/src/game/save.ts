export interface SaveData {
  v: 1;
  seed: number;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  selected: number;
  clock: number;
  edits: number[];
}
const KEY = "gameme:save:v1";
export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d && d.v === 1 && typeof d.seed === "number" ? d : null;
  } catch {
    return null;
  }
}
export function writeSave(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage full or unavailable: skip silently */
  }
}
export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
