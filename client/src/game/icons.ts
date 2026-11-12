import { ATLAS_COLS, TILE, block, itemInfo } from "./blocks";
import { getAtlasCanvas } from "./mesh";

const cache = new Map<number, string>();
const S = 32;

function tileSrc(tile: number) {
  return { sx: (tile % ATLAS_COLS) * TILE, sy: Math.floor(tile / ATLAS_COLS) * TILE };
}

function shadeFace(g: CanvasRenderingContext2D, pts: [number, number][], alpha: number) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = `rgba(0,0,0,${alpha})`;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.restore();
}

function blockIcon(g: CanvasRenderingContext2D, id: number) {
  const d = block(id);
  const atlas = getAtlasCanvas();
  if (d.cross || d.liquid) {
    const { sx, sy } = tileSrc(d.side);
    g.drawImage(atlas, sx, sy, TILE, TILE, 2, 2, S - 4, S - 4);
    return;
  }
  const top = tileSrc(d.top);
  const side = tileSrc(d.side);
  const draw = (t: { sx: number; sy: number }, m: [number, number, number, number, number, number]) => {
    g.save();
    g.setTransform(...m);
    g.drawImage(atlas, t.sx, t.sy, TILE, TILE, 0, 0, TILE, TILE);
    g.restore();
  };
  // Isometric cube: top, left, right faces.
  draw(top, [14 / 16, 7 / 16, -14 / 16, 7 / 16, 16, 2]);
  draw(side, [14 / 16, 7 / 16, 0, 14 / 16, 2, 9]);
  draw(side, [14 / 16, -7 / 16, 0, 14 / 16, 16, 16]);
  shadeFace(g, [[2, 9], [16, 16], [16, 30], [2, 23]], 0.28);
  shadeFace(g, [[16, 16], [30, 9], [30, 23], [16, 30]], 0.12);
  if (d.transparent) return;
}

function itemIcon(g: CanvasRenderingContext2D, id: number) {
  const it = itemInfo(id);
  const px = (x: number, y: number, c: string, w = 2) => {
    g.fillStyle = c;
    g.fillRect(x * 2, y * 2, w, w);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  };
  const dark = "#00000066";
  const wood = "#8a6a3c";
  if (it.kind === "pick") {
    line(3, 14, 12, 5, wood);
    line(4, 14, 13, 5, "#6d5129");
    for (let k = 0; k <= 7; k++) {
      px(5 + k, 3 + k, it.color);
      px(6 + k, 3 + k, it.color);
    }
    px(4, 3, it.color); px(13, 10, it.color); px(5, 4, dark); px(14, 11, dark);
  } else if (it.kind === "sword") {
    for (let k = 0; k <= 9; k++) { px(5 + k, 11 - k, it.color); px(6 + k, 11 - k, it.color); }
    px(14, 2, "#ffffff88"); px(13, 3, "#ffffff55");
    line(3, 9, 8, 14, "#5b3d1f");
    line(2, 14, 5, 11, wood);
    line(2, 15, 4, 13, wood);
  } else if (id === 103) {
    line(3, 14, 12, 4, wood);
    line(4, 14, 13, 4, "#6d5129");
  } else if (id === 104) {
    g.fillStyle = it.color;
    g.fillRect(8, 10, 16, 14);
    g.fillRect(6, 14, 4, 8);
    g.fillStyle = "#f2d6c4";
    g.fillRect(20, 6, 8, 6);
    g.fillRect(22, 4, 6, 4);
    g.fillStyle = "#00000033";
    g.fillRect(8, 20, 16, 4);
  } else {
    // Coal / iron / gold lumps and ingots.
    const rows = [[6, 12], [4, 14], [3, 15], [3, 15], [4, 14], [6, 12]];
    rows.forEach(([a, b], r) => {
      for (let x = a!; x < b!; x++) px(x, 5 + r + 1, x < a! + 3 && r < 3 ? "#ffffff44" : it.color);
    });
    g.fillStyle = "#00000044";
    g.fillRect(8, 24, 18, 2);
    g.fillStyle = "#ffffff55";
    g.fillRect(10, 12, 4, 2);
  }
}

/** PNG data URL for a block or item, ready for an <img src>. */
export function iconURL(id: number): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  if (id < 100) blockIcon(g, id);
  else itemIcon(g, id);
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
