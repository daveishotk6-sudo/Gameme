import * as THREE from "three";
import { ATLAS_COLS, ATLAS_ROWS, AIR, T, TILE, block } from "./blocks";
import { CS, WH, World, ck, cidx } from "./world";

// ------------------------------------------------------------ atlas

type RGBA = [number, number, number, number];

function nse(x: number, y: number, salt: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex: string, amt: number, x: number, y: number, salt: number): RGBA {
  const [r, g, b] = rgb(hex);
  const j = 1 + (nse(x, y, salt) - 0.5) * amt;
  return [Math.min(255, r * j), Math.min(255, g * j), Math.min(255, b * j), 255];
}

const painters: Record<number, (x: number, y: number) => RGBA> = {
  [T.GRASS_TOP]: (x, y) => shade(nse(x, y, 3) > 0.8 ? "#76bf55" : "#5aa845", 0.22, x, y, 1),
  [T.GRASS_SIDE]: (x, y) => {
    const edge = 4 + (((x * 7 + 3) % 5) % 3);
    if (y < edge) return shade(nse(x, y, 5) > 0.7 ? "#76bf55" : "#5aa845", 0.2, x, y, 2);
    return shade(nse(x, y, 8) > 0.78 ? "#a47a56" : "#8a5f3f", 0.2, x, y, 4);
  },
  [T.DIRT]: (x, y) => shade(nse(x, y, 9) > 0.8 ? "#a47a56" : nse(x, y, 19) > 0.85 ? "#6d4a30" : "#8a5f3f", 0.2, x, y, 6),
  [T.STONE]: (x, y) => shade(nse(x, y, 7) > 0.82 ? "#6e6e73" : nse(x, y, 17) > 0.8 ? "#a0a0a5" : "#8c8c90", 0.14, x, y, 7),
  [T.LOG_SIDE]: (x, y) => shade(x % 4 === 0 ? "#4f3720" : x % 4 === 2 ? "#7a5632" : "#6b4a2b", 0.14, x, y, 8),
  [T.LOG_TOP]: (x, y) => {
    const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return shade(ring > 6 ? "#5b3f24" : ring % 3 < 1.5 ? "#c19a62" : "#a8814c", 0.1, x, y, 9);
  },
  [T.LEAVES]: (x, y) => shade(nse(x, y, 11) > 0.6 ? "#4fa64a" : nse(x, y, 12) > 0.5 ? "#357d33" : "#2a6a2a", 0.16, x, y, 10),
  [T.SAND]: (x, y) => shade(nse(x, y, 11) > 0.7 ? "#efe2b4" : "#e2d29c", 0.1, x, y, 11),
  [T.COBBLE]: (x, y) => {
    const row = Math.floor(y / 4);
    const off = row % 2 ? 4 : 0;
    const cx = Math.floor((x + off) / 8);
    const edge = y % 4 === 0 || (x + off) % 8 === 0;
    const base = nse(cx, row, 4) > 0.5 ? "#7d7d82" : "#6a6a6f";
    return edge ? shade("#4a4a4e", 0.1, x, y, 12) : shade(base, 0.18, x, y, 13);
  },
  [T.WATER]: (x, y) => {
    const c = shade(nse(Math.floor(x / 3), Math.floor(y / 3), 3) > 0.7 ? "#4c8af0" : "#2f6fd8", 0.1, x, y, 14);
    c[3] = 185;
    return c;
  },
  [T.PLANKS]: (x, y) => {
    const row = Math.floor(y / 4);
    if (y % 4 === 3) return shade("#7d5a31", 0.1, x, y, 15);
    const joint = (x + row * 5) % 16 === 0;
    return joint ? shade("#7d5a31", 0.1, x, y, 15) : shade(nse(x, row, 2) > 0.5 ? "#b88b52" : "#c19760", 0.1, x, y, 16);
  },
  [T.GLASS]: (x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (edge) return [210, 235, 245, 255];
    if ((x === y || x === y + 1) && x > 2 && x < 8) return [255, 255, 255, 150];
    return [190, 225, 240, 36];
  },
  [T.BRICK]: (x, y) => {
    const row = Math.floor(y / 4);
    const off = row % 2 ? 4 : 0;
    const mortar = y % 4 === 3 || (x + off) % 8 === 7;
    return mortar ? shade("#5a5a5f", 0.08, x, y, 17) : shade("#8e8e93", 0.14, x, y, 18);
  },
  [T.SNOW]: (x, y) => shade(nse(x, y, 20) > 0.8 ? "#dfeaf3" : "#f4f9fc", 0.06, x, y, 19),
  [T.SNOW_SIDE]: (x, y) => {
    const edge = 4 + (((x * 5 + 1) % 4) % 3);
    if (y < edge) return shade("#f4f9fc", 0.06, x, y, 21);
    return shade(nse(x, y, 8) > 0.78 ? "#a47a56" : "#8a5f3f", 0.2, x, y, 4);
  },
  [T.BASALT]: (x, y) => shade(nse(x, y, 30) > 0.85 ? "#464955" : "#2d2f36", 0.2, x, y, 31),
  [T.LANTERN]: (x, y) => {
    const edge = x < 2 || y < 2 || x > 13 || y > 13;
    if (edge) return shade("#5b3d1f", 0.2, x, y, 32);
    const d = Math.hypot(x - 7.5, y - 7.5);
    return d < 4 ? [255, 246, 190, 255] : shade("#ffbf47", 0.12, x, y, 33);
  },
  [T.WOOL]: (x, y) => shade((x + y) % 2 ? "#ececec" : "#dcdcdc", 0.06, x, y, 34),
  [T.CACTUS_SIDE]: (x, y) => {
    if (x === 0 || x === 15) return shade("#1f6b2c", 0.1, x, y, 35);
    if (x % 4 === 2 && y % 4 === 1) return [236, 240, 190, 255];
    return shade(x % 5 === 0 ? "#277a35" : "#2f8f3d", 0.1, x, y, 36);
  },
  [T.CACTUS_TOP]: (x, y) => {
    const e = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return shade(e > 6 ? "#1f6b2c" : e > 3 ? "#2f8f3d" : "#4aa857", 0.08, x, y, 37);
  },
  [T.GOLD_BLOCK]: (x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (edge) return shade("#b8902a", 0.1, x, y, 38);
    return shade(x + y < 9 ? "#fbe27a" : "#f2c744", 0.1, x, y, 39);
  },
  [T.PINE_LEAVES]: (x, y) => shade(nse(x, y, 40) > 0.6 ? "#357a4a" : "#1f5330", 0.18, x, y, 41),
  [T.FURNACE]: (x, y) => {
    // Stone body with a dark mouth in the middle and a top plate.
    if (y <= 2) return shade("#5a5a60", 0.12, x, y, 80);
    if (y >= 13) return shade("#7a7a82", 0.1, x, y, 81);
    const mouth = x >= 4 && x <= 11 && y >= 5 && y <= 11;
    if (mouth) {
      // Glowing embers in the lower mouth.
      if (y >= 9 && nse(x, y, 82) > 0.55) return shade("#e07030", 0.2, x, y, 83);
      return shade("#1a1a1e", 0.15, x, y, 84);
    }
    // Frame / corners a bit darker.
    if (x <= 1 || x >= 14) return shade("#4a4a50", 0.12, x, y, 85);
    return shade(nse(x, y, 86) > 0.7 ? "#6e6e76" : "#5c5c64", 0.12, x, y, 87);
  },
};

function ore(base: number, hex: string, salt: number) {
  painters[base] = (x, y) => {
    const blob = nse(Math.floor(x / 2), Math.floor(y / 2), salt) > 0.72;
    return blob ? shade(hex, 0.16, x, y, salt) : painters[T.STONE]!(x, y);
  };
}
ore(T.COAL, "#222226", 50);
ore(T.IRON, "#d9b9a0", 51);
ore(T.GOLD, "#f5d442", 52);

function plant(tile: number, paint: (x: number, y: number) => RGBA | null) {
  painters[tile] = (x, y) => paint(x, y) ?? [0, 0, 0, 0];
}
function flower(petal: string) {
  return (x: number, y: number): RGBA | null => {
    if ((x === 7 || x === 8) && y >= 7) return shade("#3a8a35", 0.1, x, y, 60);
    if (y >= 11 && ((x === 5 && y === 12) || (x === 10 && y === 11))) return shade("#3a8a35", 0.1, x, y, 61);
    if (x >= 5 && x <= 10 && y >= 3 && y <= 8 && !(x % 5 === 0 && (y === 3 || y === 8))) {
      return x >= 7 && x <= 8 && y >= 5 && y <= 6 ? [250, 220, 90, 255] : shade(petal, 0.15, x, y, 62);
    }
    return null;
  };
}
plant(T.FLOWER_RED, flower("#d63a3a"));
plant(T.FLOWER_YELLOW, flower("#f0c93a"));
plant(T.TALL_GRASS, (x, y) => {
  const blade = nse(x, 0, 70);
  if (blade < 0.35) return null;
  const hgt = 4 + Math.floor(blade * 11);
  if (y < 16 - hgt) return null;
  return shade(y < 16 - hgt + 3 ? "#7bc45a" : "#4f9a3a", 0.2, x, y, 71);
});

let atlasCanvas: HTMLCanvasElement | null = null;
export function getAtlasCanvas() {
  if (atlasCanvas) return atlasCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = TILE * ATLAS_COLS;
  canvas.height = TILE * ATLAS_ROWS;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (const key of Object.keys(painters)) {
    const tile = Number(key);
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const c = painters[tile]!(x, y);
        const o = ((row * TILE + y) * canvas.width + col * TILE + x) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = c[3];
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  atlasCanvas = canvas;
  return canvas;
}

// -------------------------------------------------------- materials

const VERT = /* glsl */ `
attribute vec3 light;
varying vec2 vUv;
varying vec3 vL;
varying float vDepth;
void main() {
  vUv = uv;
  vL = light;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uSun;
uniform float uCut;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying vec3 vL;
varying float vDepth;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < uCut) discard;
  float sky = vL.y * uSun;
  float l = max(max(sky, vL.z), 0.1);
  vec3 warm = mix(vec3(1.0), vec3(1.0, 0.84, 0.6), step(sky, vL.z) * vL.z);
  vec3 c = t.rgb * vL.x * l * warm;
  c = mix(c, fogColor, smoothstep(fogNear, fogFar, vDepth));
  gl_FragColor = vec4(c, t.a);
  #include <colorspace_fragment>
}`;

export interface TerrainMaterials {
  opaque: THREE.ShaderMaterial;
  trans: THREE.ShaderMaterial;
  setSun(v: number): void;
  setFog(color: THREE.Color, near: number, far: number): void;
  dispose(): void;
}

export function createTerrainMaterials(): TerrainMaterials {
  const tex = new THREE.CanvasTexture(getAtlasCanvas());
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const shared = {
    map: { value: tex },
    uSun: { value: 1 },
    fogColor: { value: new THREE.Color(0x9ec8ea) },
    fogNear: { value: 30 },
    fogFar: { value: 80 },
  };
  const opaque = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { ...shared, uCut: { value: 0.5 } },
  });
  const trans = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { ...shared, uCut: { value: 0.02 } },
    transparent: true, depthWrite: false,
  });
  return {
    opaque, trans,
    setSun(v) { shared.uSun.value = v; },
    setFog(color, near, far) {
      shared.fogColor.value.copy(color);
      shared.fogNear.value = near;
      shared.fogFar.value = far;
    },
    dispose() { tex.dispose(); opaque.dispose(); trans.dispose(); },
  };
}

// ---------------------------------------------------------- meshing

type Vec = readonly [number, number, number];
interface Face { d: Vec; c: readonly Vec[]; s: number; uv: (p: Vec) => [number, number] }

const FACES: Face[] = [
  { d: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], s: 0.8, uv: (p) => [p[2], p[1]] },
  { d: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], s: 0.8, uv: (p) => [1 - p[2], p[1]] },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1, uv: (p) => [p[0], 1 - p[2]] },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.5, uv: (p) => [p[0], p[2]] },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.9, uv: (p) => [p[0], p[1]] },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.9, uv: (p) => [1 - p[0], p[1]] },
];
const AO = [0.5, 0.68, 0.84, 1];
const OPQ = new Uint8Array(256);
for (let i = 0; i < 256; i++) OPQ[i] = block(i).opaque ? 1 : 0;
const PAD = 2;
const PW = CS + PAD * 2;

class Buf {
  pos: number[] = [];
  light: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  n = 0;
  build() {
    if (this.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("light", new THREE.Float32BufferAttribute(this.light, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

function tileRect(tile: number) {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const inset = 0.2 / (TILE * ATLAS_COLS);
  return {
    u0: col / ATLAS_COLS + inset,
    u1: (col + 1) / ATLAS_COLS - inset,
    v0: 1 - (row + 1) / ATLAS_ROWS + inset,
    v1: 1 - row / ATLAS_ROWS - inset,
  };
}

export interface ChunkGeo {
  opaque: THREE.BufferGeometry | null;
  trans: THREE.BufferGeometry | null;
}

export function buildChunk(world: World, cx: number, cz: number): ChunkGeo {
  const chunk = world.chunks.get(ck(cx, cz));
  if (!chunk) return { opaque: null, trans: null };

  // Padded copy of ids and sky tops so neighbour lookups are plain array reads.
  const P = new Uint8Array(PW * PW * WH);
  const TP = new Uint8Array(PW * PW);
  const grid: (Uint8Array | undefined)[] = [];
  const tgrid: (Uint8Array | undefined)[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      grid.push(world.chunks.get(ck(cx + dx, cz + dz)));
      tgrid.push(world.tops.get(ck(cx + dx, cz + dz)));
    }
  }
  for (let pz = 0; pz < PW; pz++) {
    for (let px = 0; px < PW; px++) {
      const lx = px - PAD;
      const lz = pz - PAD;
      const ncx = lx < 0 ? -1 : lx >= CS ? 1 : 0;
      const ncz = lz < 0 ? -1 : lz >= CS ? 1 : 0;
      const gi = (ncz + 1) * 3 + ncx + 1;
      const arr = grid[gi];
      const ix = lx - ncx * CS;
      const iz = lz - ncz * CS;
      const t = tgrid[gi];
      TP[px + pz * PW] = t ? t[ix + iz * CS]! : 0;
      if (arr) for (let y = 0; y < WH; y++) P[px + pz * PW + y * PW * PW] = arr[ix + iz * CS + y * CS * CS]!;
    }
  }
  const pid = (x: number, y: number, z: number) => {
    if (y < 0) return 3; // below the world reads as stone so no bottom faces
    if (y >= WH) return AIR;
    return P[x + PAD + (z + PAD) * PW + y * PW * PW]!;
  };
  const occ = (x: number, y: number, z: number) => (block(pid(x, y, z)).opaque ? 1 : 0);
  const sky = (x: number, y: number, z: number) => {
    if (y >= WH) return 1;
    const top = TP[x + PAD + (z + PAD) * PW]!;
    if (y >= top) return 1;
    return Math.max(0, 1 - (top - y) * 0.22);
  };

  const ox = cx * CS;
  const oz = cz * CS;
  const near: [number, number, number][] = [];
  for (const l of world.lights.values()) {
    if (l[0] > ox - 8 && l[0] < ox + CS + 8 && l[2] > oz - 8 && l[2] < oz + CS + 8) near.push(l);
  }
  const glow = (x: number, y: number, z: number) => {
    let b = 0;
    for (const l of near) {
      const d = Math.hypot(l[0] - (ox + x), l[1] - y, l[2] - (oz + z));
      if (d < 8) b = Math.max(b, Math.pow(1 - d / 8, 1.6));
    }
    return b;
  };

  const op = new Buf();
  const tr = new Buf();

  let maxY = 0;
  for (let i = 0; i < chunk.length; i++) {
    if (chunk[i] !== AIR) {
      const y = Math.floor(i / (CS * CS));
      if (y > maxY) maxY = y;
    }
  }
  const SY = PW * PW;
  for (let x = 0; x < CS; x++) {
    for (let z = 0; z < CS; z++) {
      for (let y = 0; y <= maxY; y++) {
        const id = chunk[cidx(x, y, z)]!;
        if (id === AIR) continue;
        if (OPQ[id] && y > 0 && y < WH - 1) {
          const pi = x + PAD + (z + PAD) * PW + y * SY;
          if (OPQ[P[pi + 1]!] && OPQ[P[pi - 1]!] && OPQ[P[pi + PW]!] && OPQ[P[pi - PW]!] && OPQ[P[pi + SY]!] && OPQ[P[pi - SY]!]) continue;
        }
        const def = block(id);
        if (def.invisible) continue;

        if (def.cross) {
          const r = tileRect(def.side);
          const s = sky(x, y, z);
          const g = near.length ? glow(x, y, z) : 0;
          const quads: Vec[][] = [
            [[0.1, 0, 0.1], [0.9, 0, 0.9], [0.9, 1, 0.9], [0.1, 1, 0.1]],
            [[0.9, 0, 0.9], [0.1, 0, 0.1], [0.1, 1, 0.1], [0.9, 1, 0.9]],
            [[0.1, 0, 0.9], [0.9, 0, 0.1], [0.9, 1, 0.1], [0.1, 1, 0.9]],
            [[0.9, 0, 0.1], [0.1, 0, 0.9], [0.1, 1, 0.9], [0.9, 1, 0.1]],
          ];
          for (const q of quads) {
            const uvs = [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
            for (let k = 0; k < 4; k++) {
              op.pos.push(ox + x + q[k]![0], y + q[k]![1], oz + z + q[k]![2]);
              op.light.push(0.95, s, g);
              op.uv.push(uvs[k]![0]!, uvs[k]![1]!);
            }
            op.idx.push(op.n, op.n + 1, op.n + 2, op.n, op.n + 2, op.n + 3);
            op.n += 4;
          }
          continue;
        }

        const buf = def.transparent ? tr : op;
        for (const f of FACES) {
          const nid = pid(x + f.d[0], y + f.d[1], z + f.d[2]);
          const nd = block(nid);
          if (def.liquid) {
            if (nd.opaque || nd.liquid || nd.transparent) continue;
          } else if (def.transparent) {
            if (nid === id || nd.opaque) continue;
          } else if (nd.opaque) continue;

          const tile = f.d[1] === 1 ? def.top : f.d[1] === -1 ? def.bottom : def.side;
          const r = tileRect(tile);
          const s = sky(x + f.d[0], y + f.d[1], z + f.d[2]);
          const g = def.light ? 1 : near.length ? glow(x + f.d[0] + 0.5, y + f.d[1] + 0.5, z + f.d[2] + 0.5) : 0;
          const ao: number[] = [];
          const lowerTop = def.liquid && f.d[1] !== -1 && pid(x, y + 1, z) !== id;
          for (let k = 0; k < 4; k++) {
            const c = f.c[k]!;
            buf.pos.push(ox + x + c[0], y + (lowerTop && c[1] === 1 ? 0.88 : c[1]), oz + z + c[2]);
            let a = 3;
            if (!def.liquid && !def.transparent) {
              const nAxis = f.d[0] !== 0 ? 0 : f.d[1] !== 0 ? 1 : 2;
              const t1 = nAxis === 0 ? 1 : 0;
              const t2 = nAxis === 2 ? 1 : 2;
              const o1 = c[t1]! * 2 - 1;
              const o2 = c[t2]! * 2 - 1;
              const bx = x + f.d[0];
              const by = y + f.d[1];
              const bz = z + f.d[2];
              const p1: [number, number, number] = [bx, by, bz];
              const p2: [number, number, number] = [bx, by, bz];
              const p3: [number, number, number] = [bx, by, bz];
              p1[t1] += o1;
              p2[t2] += o2;
              p3[t1] += o1;
              p3[t2] += o2;
              const s1 = occ(p1[0], p1[1], p1[2]);
              const s2 = occ(p2[0], p2[1], p2[2]);
              const co = occ(p3[0], p3[1], p3[2]);
              a = s1 && s2 ? 0 : 3 - (s1 + s2 + co);
            }
            ao.push(a);
            buf.light.push(f.s * AO[a]!, s, g);
            const [uu, vv] = f.uv(c);
            buf.uv.push(r.u0 + uu * (r.u1 - r.u0), r.v0 + vv * (r.v1 - r.v0));
          }
          const n = buf.n;
          if (ao[0]! + ao[2]! < ao[1]! + ao[3]!) buf.idx.push(n + 1, n + 2, n + 3, n + 1, n + 3, n);
          else buf.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
          buf.n += 4;
        }
      }
    }
  }
  return { opaque: op.build(), trans: tr.build() };
}
