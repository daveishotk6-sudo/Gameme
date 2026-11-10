import * as THREE from "three";
import { AIR, BLOCKS, COBBLE, CS, DIRT, GLASS, GRASS, LEAVES, PLANKS, SAND, STONE, WATER, WH, WOOD, type Chunk, type World } from "./world";

const TILE = 16;
const COLS = 12;

const FACES = [
  { d: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], s: 0.78, uv: (p: readonly number[]) => [p[2], p[1]] },
  { d: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], s: 0.78, uv: (p: readonly number[]) => [1 - p[2], p[1]] },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1, uv: (p: readonly number[]) => [p[0], 1 - p[2]] },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.55, uv: (p: readonly number[]) => [p[0], p[2]] },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.9, uv: (p: readonly number[]) => [p[0], p[1]] },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.9, uv: (p: readonly number[]) => [1 - p[0], p[1]] },
] as const;

function nse(x: number, y: number, salt: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function mix(hex: string, amount: number, salt: number, x: number, y: number) {
  const c = new THREE.Color(hex);
  const j = (nse(x, y, salt) - 0.5) * amount;
  c.offsetHSL(0, 0, j);
  return c;
}

function paintTile(ctx: CanvasRenderingContext2D, col: number, painter: (x: number, y: number) => string) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = painter(x, y);
      ctx.fillRect(col * TILE + x, y, 1, 1);
    }
  }
}

function drawAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = TILE * COLS;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  paintTile(ctx, 0, (x, y) => mix(nse(x, y, 3) > 0.82 ? "#7cb342" : "#43a047", 0.16, 1, x, y).getStyle());
  paintTile(ctx, 1, (x, y) => {
    const edge = 4 + ((x * 3 + y) % 3 === 0 ? 1 : 0);
    if (y < edge) return mix(nse(x, y, 5) > 0.7 ? "#7cb342" : "#388e3c", 0.12, 2, x, y).getStyle();
    return mix(nse(x, y, 8) > 0.75 ? "#a1887f" : "#6d4c41", 0.14, 4, x, y).getStyle();
  });
  paintTile(ctx, 2, (x, y) => mix(nse(x, y, 9) > 0.8 ? "#a1887f" : "#6d4c41", 0.16, 6, x, y).getStyle());
  paintTile(ctx, 3, (x, y) => mix((x + y) % 5 === 0 ? "#bdbdbd" : "#757575", 0.1, 7, x, y).getStyle());
  paintTile(ctx, 4, (x, y) => mix(x % 4 === 0 ? "#8d6e63" : "#a1887f", 0.08, 8, x, y).getStyle());
  paintTile(ctx, 5, (x, y) => {
    const ring = Math.abs(x - 8) + Math.abs(y - 8);
    return mix(ring > 6 ? "#8d6e63" : "#bcaaa4", 0.08, 9, x, y).getStyle();
  });
  paintTile(ctx, 6, (x, y) => mix(nse(x, y, 11) > 0.55 ? "#2e7d32" : "#1b5e20", 0.12, 10, x, y).getStyle());
  paintTile(ctx, 7, (x, y) => mix(nse(x, y, 12) > 0.7 ? "#fff3c4" : "#e6d3a1", 0.1, 11, x, y).getStyle());
  paintTile(ctx, 8, (x, y) => {
    const mortar = x % 8 === 0 || y % 8 === 0;
    return mix(mortar ? "#9e9e9e" : "#616161", 0.08, 13, x, y).getStyle();
  });
  paintTile(ctx, 9, (x, y) => mix(y % 4 === 0 ? "#a67c52" : "#c4a574", 0.08, 14, x, y).getStyle());
  paintTile(ctx, 10, (x, y) => mix(x === 2 || y === 12 ? "#e1f5fe" : "#81d4fa", 0.06, 15, x, y).getStyle());
  paintTile(ctx, 11, (x, y) => mix(nse(x, y, 16) > 0.72 ? "#42a5f5" : "#1565c0", 0.12, 17, x, y).getStyle());
  return canvas;
}

let atlas: THREE.CanvasTexture | null = null;

export function terrainMaterial() {
  if (!atlas) {
    atlas = new THREE.CanvasTexture(drawAtlas());
    atlas.magFilter = THREE.NearestFilter;
    atlas.minFilter = THREE.NearestFilter;
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.needsUpdate = true;
  }
  return new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
}

function tileOf(id: number, dy: number) {
  if (id === GRASS) return dy === 1 ? 0 : dy === -1 ? 2 : 1;
  if (id === DIRT) return 2;
  if (id === STONE) return 3;
  if (id === WOOD) return dy === 0 ? 4 : 5;
  if (id === LEAVES) return 6;
  if (id === SAND) return 7;
  if (id === COBBLE) return 8;
  if (id === PLANKS) return 9;
  if (id === GLASS) return 10;
  if (id === WATER) return 11;
  return 3;
}

function solidAt(world: World, chunk: Chunk, cx: number, cz: number, x: number, y: number, z: number) {
  if (y < 0 || y >= WH) return false;
  if (x >= 0 && x < CS && z >= 0 && z < CS) {
    const id = chunk[x + z * CS + y * CS * CS] ?? AIR;
    return id !== AIR;
  }
  const outside = world.get(cx * CS + x, y, cz * CS + z);
  return outside !== AIR;
}

export function buildChunkGeometry(world: World, cx: number, cz: number, chunk: Chunk) {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let v = 0;
  const ox = cx * CS;
  const oz = cz * CS;
  const inset = 0.5 / (TILE * COLS);

  for (let x = 0; x < CS; x++) {
    for (let z = 0; z < CS; z++) {
      for (let y = 0; y < WH; y++) {
        const id = chunk[x + z * CS + y * CS * CS] ?? AIR;
        if (id === AIR) continue;
        if (!BLOCKS[id]) continue;
        for (const face of FACES) {
          if (solidAt(world, chunk, cx, cz, x + face.d[0], y + face.d[1], z + face.d[2])) continue;
          const tile = tileOf(id, face.d[1]);
          const u0 = tile / COLS + inset;
          const u1 = (tile + 1) / COLS - inset;
          for (const c of face.c) {
            pos.push(ox + x + c[0], y + c[1], oz + z + c[2]);
            col.push(face.s, face.s, face.s);
            const [uu, vv] = face.uv(c);
            uv.push(u0 + uu * (u1 - u0), 0.02 + vv * 0.96);
          }
          idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
          v += 4;
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
