import {
  AIR, BASALT, CACTUS, COAL_ORE, DIRT, FLOWER_RED, FLOWER_YELLOW, GOLD_ORE, GRASS, IRON_ORE, LEAVES, LOG,
  PINE_LEAVES, SAND, SNOW, STONE, TALL_GRASS, WATER, LANTERN, block,
} from "./blocks";
import { fbm2, hash2, hash3, vnoise3 } from "./noise";

export const CS = 16;
export const WH = 64;
export const SEA = 20;
export const VOID_Y = -60;
const LAYER = CS * CS;

export type Chunk = Uint8Array;

export const ck = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
export const ckX = (k: number) => Math.floor(k / 65536) - 32768;
export const ckZ = (k: number) => (k % 65536) - 32768;
export const cidx = (x: number, y: number, z: number) => x + z * CS + y * LAYER;

export const PLAINS = 0;
export const DESERT = 1;
export const TUNDRA = 2;

export function heightAt(x: number, z: number, seed: number) {
  const e = fbm2(x * 0.0055, z * 0.0055, seed, 4);
  const m = fbm2(x * 0.02 + 97, z * 0.02 - 31, seed + 17, 3);
  let h = 26 + (e - 0.5) * 58 + (m - 0.5) * 14;
  if (e > 0.58) h += (e - 0.58) * 70;
  return Math.max(3, Math.min(WH - 6, Math.floor(h)));
}

export function biomeAt(x: number, z: number, seed: number) {
  const t = fbm2(x * 0.0042 + 300, z * 0.0042 - 120, seed + 29, 3);
  if (t < 0.4) return TUNDRA;
  if (t > 0.6) return DESERT;
  return PLAINS;
}

/** Find dry land near the origin for the first spawn. */
export function findSpawn(seed: number) {
  for (let r = 0; r < 400; r += 6) {
    for (let a = 0; a < 12; a++) {
      const x = Math.round(Math.cos((a / 12) * Math.PI * 2) * r) + 8;
      const z = Math.round(Math.sin((a / 12) * Math.PI * 2) * r) + 8;
      const h = heightAt(x, z, seed);
      if (h > SEA + 2 && h < 40 && biomeAt(x, z, seed) === PLAINS) return { x: x + 0.5, y: h + 1.05, z: z + 0.5 };
    }
  }
  const h = heightAt(8, 8, seed);
  return { x: 8.5, y: Math.max(h, SEA) + 1.05, z: 8.5 };
}

const M = 3;
const HW = CS + M * 2;

function fillChunk(cx: number, cz: number, seed: number): Chunk {
  const data = new Uint8Array(LAYER * WH);
  const hs = new Int16Array(HW * HW);
  const bs = new Uint8Array(HW * HW);
  for (let i = 0; i < HW; i++) {
    for (let j = 0; j < HW; j++) {
      const wx = cx * CS + i - M;
      const wz = cz * CS + j - M;
      hs[i + j * HW] = heightAt(wx, wz, seed);
      bs[i + j * HW] = biomeAt(wx, wz, seed);
    }
  }
  const H = (x: number, z: number) => hs[x + M + (z + M) * HW]!;
  const B = (x: number, z: number) => bs[x + M + (z + M) * HW]!;

  for (let x = 0; x < CS; x++) {
    for (let z = 0; z < CS; z++) {
      const wx = cx * CS + x;
      const wz = cz * CS + z;
      const h = H(x, z);
      const biome = B(x, z);
      let top = GRASS;
      let sub = DIRT;
      let depth = 3;
      if (h > 44) { top = SNOW; sub = STONE; }
      else if (h <= SEA + 1) { top = h > SEA - 5 ? SAND : DIRT; sub = top === SAND ? SAND : DIRT; }
      else if (biome === DESERT) { top = SAND; sub = SAND; depth = 4; }
      else if (biome === TUNDRA) { top = SNOW; sub = DIRT; }

      for (let y = 0; y <= h; y++) {
        let id: number;
        if (y === 0) id = BASALT;
        else if (y === 1) id = hash2(wx, wz, seed) < 0.5 ? BASALT : STONE;
        else if (y === h) id = top;
        else if (y > h - depth - 1) id = sub;
        else {
          id = STONE;
          if (y >= 3 && y <= h - 3) {
            const n1 = vnoise3(wx * 0.045, y * 0.06, wz * 0.045, seed + 71);
            const n2 = vnoise3(wx * 0.045 + 40, y * 0.06, wz * 0.045 + 40, seed + 72);
            let carve = Math.abs(n1 - 0.5) < 0.055 && Math.abs(n2 - 0.5) < 0.055;
            if (!carve && y < 16) carve = vnoise3(wx * 0.03, y * 0.05, wz * 0.03, seed + 73) > 0.74;
            if (carve) continue;
          }
          if (y < 48 && vnoise3(wx * 0.22, y * 0.22, wz * 0.22, seed + 81) > 0.86) id = COAL_ORE;
          else if (y < 30 && vnoise3(wx * 0.22, y * 0.22, wz * 0.22, seed + 82) > 0.89) id = IRON_ORE;
          else if (y < 16 && vnoise3(wx * 0.22, y * 0.22, wz * 0.22, seed + 83) > 0.91) id = GOLD_ORE;
        }
        data[cidx(x, y, z)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) data[cidx(x, y, z)] = WATER;

      if (top === GRASS && h > SEA && h + 1 < WH) {
        const r = hash2(wx, wz, seed + 5);
        if (r < 0.07) data[cidx(x, h + 1, z)] = TALL_GRASS;
        else if (r < 0.082) data[cidx(x, h + 1, z)] = FLOWER_RED;
        else if (r < 0.094) data[cidx(x, h + 1, z)] = FLOWER_YELLOW;
      }
    }
  }

  const put = (wx: number, y: number, wz: number, id: number, onlyAir: boolean) => {
    const lx = wx - cx * CS;
    const lz = wz - cz * CS;
    if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y < 0 || y >= WH) return;
    const i = cidx(lx, y, lz);
    if (onlyAir) {
      const cur = data[i]!;
      if (cur !== AIR && !block(cur).cross) return;
    }
    data[i] = id;
  };

  const CELL = 5;
  const x0 = Math.floor((cx * CS - M) / CELL);
  const x1 = Math.floor((cx * CS + CS + M - 1) / CELL);
  const z0 = Math.floor((cz * CS - M) / CELL);
  const z1 = Math.floor((cz * CS + CS + M - 1) / CELL);
  for (let gx = x0; gx <= x1; gx++) {
    for (let gz = z0; gz <= z1; gz++) {
      const rx = gx * CELL + Math.floor(hash2(gx, gz, seed + 91) * CELL);
      const rz = gz * CELL + Math.floor(hash2(gx, gz, seed + 92) * CELL);
      const lx = rx - cx * CS;
      const lz = rz - cz * CS;
      if (lx < -M || lx >= CS + M || lz < -M || lz >= CS + M) continue;
      const h = H(lx, lz);
      if (h <= SEA + 1 || h > 42) continue;
      const biome = B(lx, lz);
      const roll = hash2(gx, gz, seed + 93);
      const pick = hash2(gx, gz, seed + 94);
      if (biome === PLAINS) {
        const dense = fbm2(rx * 0.012, rz * 0.012, seed + 41, 2) > 0.52;
        if (roll > (dense ? 0.85 : 0.22)) continue;
        const th = 4 + Math.floor(pick * 3);
        for (let t = 1; t <= th; t++) put(rx, h + t, rz, LOG, false);
        for (let ly = th - 2; ly <= th + 1; ly++) {
          const r = ly >= th ? 1 : 2;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && (r === 1 || hash3(rx + dx, ly, rz + dz, seed) < 0.5)) continue;
              if (dx === 0 && dz === 0 && ly < th) continue;
              put(rx + dx, h + ly, rz + dz, LEAVES, true);
            }
          }
        }
      } else if (biome === TUNDRA) {
        if (roll > 0.4) continue;
        const th = 5 + Math.floor(pick * 3);
        for (let t = 1; t <= th; t++) put(rx, h + t, rz, LOG, false);
        const radii = [0, 1, 1, 2, 2];
        for (let k = 0; k < radii.length; k++) {
          const r = radii[k]!;
          const ly = th + 1 - k;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
              if (dx === 0 && dz === 0 && ly <= th) continue;
              put(rx + dx, h + ly, rz + dz, PINE_LEAVES, true);
            }
          }
        }
      } else if (biome === DESERT) {
        if (roll > 0.3) continue;
        const th = 1 + Math.floor(pick * 3);
        for (let t = 1; t <= th; t++) put(rx, h + t, rz, CACTUS, false);
      }
    }
  }
  return data;
}

function computeTops(chunk: Chunk) {
  const tops = new Uint8Array(LAYER);
  for (let x = 0; x < CS; x++) {
    for (let z = 0; z < CS; z++) {
      let t = 0;
      for (let y = WH - 1; y >= 0; y--) {
        if (block(chunk[cidx(x, y, z)]!).opaque) { t = y + 1; break; }
      }
      tops[x + z * CS] = t;
    }
  }
  return tops;
}

export class World {
  chunks = new Map<number, Chunk>();
  tops = new Map<number, Uint8Array>();
  edits = new Map<number, Map<number, number>>();
  lights = new Map<string, [number, number, number]>();
  seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  ensure(cx: number, cz: number) {
    const k = ck(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = fillChunk(cx, cz, this.seed);
      const e = this.edits.get(k);
      if (e) for (const [i, id] of e) c[i] = id;
      this.chunks.set(k, c);
      this.tops.set(k, computeTops(c));
    }
    return c;
  }

  get(wx: number, wy: number, wz: number) {
    if (wy < 0 || wy >= WH) return AIR;
    const c = this.chunks.get(ck(Math.floor(wx / CS), Math.floor(wz / CS)));
    if (!c) return AIR;
    return c[cidx(((wx % CS) + CS) % CS, wy, ((wz % CS) + CS) % CS)] ?? AIR;
  }

  solid(wx: number, wy: number, wz: number) {
    return block(this.get(wx, wy, wz)).solid;
  }

  set(wx: number, wy: number, wz: number, id: number) {
    if (wy < 0 || wy >= WH) return;
    const cx = Math.floor(wx / CS);
    const cz = Math.floor(wz / CS);
    const k = ck(cx, cz);
    const c = this.ensure(cx, cz);
    const lx = ((wx % CS) + CS) % CS;
    const lz = ((wz % CS) + CS) % CS;
    const i = cidx(lx, wy, lz);
    if (c[i] === id) return;
    c[i] = id;
    let e = this.edits.get(k);
    if (!e) this.edits.set(k, (e = new Map()));
    e.set(i, id);
    this.trackLight(wx, wy, wz, id);
    const tops = this.tops.get(k)!;
    let t = 0;
    for (let y = WH - 1; y >= 0; y--) {
      if (block(c[cidx(lx, y, lz)]!).opaque) { t = y + 1; break; }
    }
    tops[lx + lz * CS] = t;
  }

  private trackLight(wx: number, wy: number, wz: number, id: number) {
    const key = `${wx},${wy},${wz}`;
    if (id === LANTERN) this.lights.set(key, [wx, wy, wz]);
    else this.lights.delete(key);
  }

  loadEdits(flat: number[]) {
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const wx = flat[i]!;
      const wy = flat[i + 1]!;
      const wz = flat[i + 2]!;
      const id = flat[i + 3]!;
      const cx = Math.floor(wx / CS);
      const cz = Math.floor(wz / CS);
      const k = ck(cx, cz);
      let e = this.edits.get(k);
      if (!e) this.edits.set(k, (e = new Map()));
      e.set(cidx(((wx % CS) + CS) % CS, wy, ((wz % CS) + CS) % CS), id);
      this.trackLight(wx, wy, wz, id);
    }
  }

  dumpEdits() {
    const out: number[] = [];
    for (const [k, e] of this.edits) {
      const cx = ckX(k);
      const cz = ckZ(k);
      for (const [i, id] of e) {
        out.push(cx * CS + (i % CS), Math.floor(i / LAYER), cz * CS + (Math.floor(i / CS) % CS), id);
      }
    }
    return out;
  }

  /** Keep data for a ring around the player; edits survive in `edits`. */
  stream(px: number, pz: number, radius: number) {
    const cx = Math.floor(px / CS);
    const cz = Math.floor(pz / CS);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) this.ensure(cx + dx, cz + dz);
    }
    const drop = radius + 2;
    for (const k of this.chunks.keys()) {
      if (Math.abs(ckX(k) - cx) > drop || Math.abs(ckZ(k) - cz) > drop) {
        this.chunks.delete(k);
        this.tops.delete(k);
      }
    }
    return { cx, cz };
  }

  /** 1 = open sky, falling to 0 a few blocks under a roof. */
  exposure(wx: number, wy: number, wz: number) {
    const t = this.tops.get(ck(Math.floor(wx / CS), Math.floor(wz / CS)));
    if (!t) return 1;
    const top = t[(((wx % CS) + CS) % CS) + (((wz % CS) + CS) % CS) * CS]!;
    if (wy >= top) return 1;
    return Math.max(0, 1 - (top - wy) * 0.22);
  }
}

// ------------------------------------------------------------- physics

export const HALF_W = 0.3;
export const HEIGHT = 1.78;
export const EYE = 1.6;

export function overlaps(world: World, x: number, y: number, z: number, hw = HALF_W, h = HEIGHT) {
  const minX = Math.floor(x - hw);
  const maxX = Math.floor(x + hw);
  const minY = Math.floor(y + 0.001);
  const maxY = Math.floor(y + h - 0.01);
  const minZ = Math.floor(z - hw);
  const maxZ = Math.floor(z + hw);
  for (let bx = minX; bx <= maxX; bx++) {
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (world.solid(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

type V3 = { x: number; y: number; z: number };

export function moveBody(world: World, pos: V3, vel: V3, dt: number, hw = HALF_W, h = HEIGHT) {
  const travel = Math.max(Math.abs(vel.x), Math.abs(vel.y), Math.abs(vel.z)) * dt;
  const steps = Math.max(1, Math.min(8, Math.ceil(travel / 0.25)));
  const sdt = dt / steps;
  let grounded = false;
  for (let i = 0; i < steps; i++) if (stepBody(world, pos, vel, sdt, hw, h)) grounded = true;
  return grounded;
}

function stepBody(world: World, pos: V3, vel: V3, dt: number, hw: number, h: number) {
  let grounded = false;
  pos.x += vel.x * dt;
  if (overlaps(world, pos.x, pos.y, pos.z, hw, h)) {
    if (vel.x > 0) pos.x = Math.floor(pos.x + hw) - hw - 0.001;
    else pos.x = Math.ceil(pos.x - hw) + hw + 0.001;
    vel.x = 0;
  }
  pos.z += vel.z * dt;
  if (overlaps(world, pos.x, pos.y, pos.z, hw, h)) {
    if (vel.z > 0) pos.z = Math.floor(pos.z + hw) - hw - 0.001;
    else pos.z = Math.ceil(pos.z - hw) + hw + 0.001;
    vel.z = 0;
  }
  const y0 = pos.y;
  pos.y += vel.y * dt;
  if (overlaps(world, pos.x, pos.y, pos.z, hw, h)) {
    if (vel.y <= 0) {
      let top = -1;
      const minX = Math.floor(pos.x - hw);
      const maxX = Math.floor(pos.x + hw);
      const minZ = Math.floor(pos.z - hw);
      const maxZ = Math.floor(pos.z + hw);
      const minY = Math.floor(Math.min(y0, pos.y)) - 1;
      const maxY = Math.floor(Math.max(y0, pos.y) + h);
      for (let bx = minX; bx <= maxX; bx++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          for (let by = maxY; by >= minY; by--) {
            if (world.solid(bx, by, bz) && by + 1 <= y0 + 0.05) {
              top = Math.max(top, by + 1);
              break;
            }
          }
        }
      }
      if (top < 0) top = Math.floor(pos.y) + 1;
      pos.y = top + 0.001;
      grounded = true;
    } else {
      pos.y = Math.ceil(pos.y + h) - h - 0.001;
    }
    vel.y = 0;
  }
  return grounded;
}

export interface Hit {
  x: number; y: number; z: number;
  faceX: number; faceY: number; faceZ: number;
  t: number;
}

/** Voxel DDA. Hits anything that is not air or liquid (so plants can be broken). */
export function raycast(world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max = 5): Hit | null {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tdx = sx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = sy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = sz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = sx > 0 ? (x + 1 - ox) * tdx : sx < 0 ? (ox - x) * tdx : Infinity;
  let tmy = sy > 0 ? (y + 1 - oy) * tdy : sy < 0 ? (oy - y) * tdy : Infinity;
  let tmz = sz > 0 ? (z + 1 - oz) * tdz : sz < 0 ? (oz - z) * tdz : Infinity;
  let fx = 0, fy = 0, fz = 0, t = 0;
  for (let i = 0; i < 64 && t <= max; i++) {
    const id = world.get(x, y, z);
    if (id !== AIR && id !== WATER) return { x, y, z, faceX: fx, faceY: fy, faceZ: fz, t };
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; fx = -sx; fy = 0; fz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; fx = 0; fy = -sy; fz = 0; }
    else { z += sz; t = tmz; tmz += tdz; fx = 0; fy = 0; fz = -sz; }
  }
  return null;
}
