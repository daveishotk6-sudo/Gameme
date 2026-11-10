export const CS = 16;
export const WH = 32;
export const RD = 2;
export const VOID_Y = -200;

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const WOOD = 4;
export const LEAVES = 5;
export const SAND = 6;
export const COBBLE = 7;
export const PLANKS = 8;
export const GLASS = 9;
export const WATER = 10;
export const SEA = 12;

export const BLOCKS = [
  { id: AIR, name: "Air", color: "#000000", solid: false },
  { id: GRASS, name: "Grass", color: "#4caf50", colorSide: "#8d6e63", solid: true },
  { id: DIRT, name: "Dirt", color: "#8d6e63", solid: true },
  { id: STONE, name: "Stone", color: "#9e9e9e", solid: true },
  { id: WOOD, name: "Wood", color: "#a1887f", solid: true },
  { id: LEAVES, name: "Leaves", color: "#2e7d32", solid: true },
  { id: SAND, name: "Sand", color: "#e6d3a1", solid: true },
  { id: COBBLE, name: "Cobble", color: "#757575", solid: true },
  { id: PLANKS, name: "Planks", color: "#c4a574", solid: true },
  { id: GLASS, name: "Glass", color: "#b3e5fc", solid: true },
  { id: WATER, name: "Water", color: "#1565c0", solid: false },
] as const;

export const HOTBAR = [GRASS, DIRT, STONE, WOOD, PLANKS, COBBLE, SAND, GLASS];

export const RECIPES = [
  { name: "Planks", out: PLANKS, n: 4, need: [{ id: WOOD, n: 1 }] },
  { name: "Wood", out: WOOD, n: 1, need: [{ id: PLANKS, n: 4 }] },
  { name: "Glass", out: GLASS, n: 1, need: [{ id: SAND, n: 2 }] },
  { name: "Cobble", out: COBBLE, n: 1, need: [{ id: STONE, n: 1 }] },
] as const;

const STRIDE = CS * CS * WH;

export type Chunk = Uint8Array;

function key(cx: number, cz: number) {
  return `${cx},${cz}`;
}

function idx(x: number, y: number, z: number) {
  return x + z * CS + y * CS * CS;
}

function baseHeight(x: number, z: number, seed: number) {
  const sx = x + seed * 0.13;
  const sz = z + seed * 0.17;
  const v =
    Math.sin(sx * 0.07) * 3.2 +
    Math.cos(sz * 0.065) * 3.2 +
    Math.sin((sx + sz) * 0.03) * 2.4;
  return Math.max(4, Math.min(WH - 8, Math.floor(v + 14)));
}

export function riverHere(x: number, z: number, seed: number) {
  const center = Math.sin(z * 0.04 + seed * 0.01) * 26 + Math.sin(z * 0.012) * 5;
  return Math.abs(x - center) < 2.3;
}

export function lakeHere(x: number, z: number, seed: number) {
  const v = Math.sin(x * 0.085 + seed * 0.02) + Math.cos(z * 0.085) + Math.sin((x - z) * 0.055);
  return v > 1.72;
}

export function heightAt(x: number, z: number, seed: number) {
  let h = baseHeight(x, z, seed);
  if (lakeHere(x, z, seed)) h = Math.min(h, SEA - 2);
  if (riverHere(x, z, seed)) h = Math.min(h, SEA - 1);
  return h;
}

function caveAt(x: number, y: number, z: number, seed: number) {
  if (y < 2) return false;
  const a = Math.sin(x * 0.34 + seed) * Math.sin(z * 0.31 + 1.7) * Math.sin(y * 0.46);
  const b = Math.cos((x + z) * 0.19) * Math.sin(y * 0.28 + seed * 0.1);
  return a + b > 1.08;
}

function fillChunk(cx: number, cz: number, seed: number): Chunk {
  const data = new Uint8Array(STRIDE);
  for (let x = 0; x < CS; x++) {
    for (let z = 0; z < CS; z++) {
      const wx = cx * CS + x;
      const wz = cz * CS + z;
      const h = heightAt(wx, wz, seed);
      const desert = Math.sin(wx * 0.02 + seed) + Math.cos(wz * 0.02) < -0.85;
      const beach = h <= SEA + 1;
      for (let y = 0; y <= h; y++) {
        let id = STONE;
        if (y === h) id = beach || desert ? SAND : GRASS;
        else if (y > h - 3) id = beach || desert ? SAND : DIRT;
        else if (caveAt(wx, y, wz, seed) && y < h - 2) id = AIR;
        data[idx(x, y, z)] = id;
      }
      if (h < SEA) {
        for (let y = h + 1; y <= SEA && y < WH; y++) data[idx(x, y, z)] = WATER;
      }
    }
  }
  for (let x = 2; x < CS - 2; x++) {
    for (let z = 2; z < CS - 2; z++) {
      const wx = cx * CS + x;
      const wz = cz * CS + z;
      if ((wx * 17 + wz * 31 + seed * 3) % 47 !== 0) continue;
      const h = heightAt(wx, wz, seed);
      if (h <= SEA || data[idx(x, h, z)] !== GRASS) continue;
      for (let t = 1; t <= 4; t++) data[idx(x, h + t, z)] = WOOD;
      for (let lx = -2; lx <= 2; lx++) {
        for (let lz = -2; lz <= 2; lz++) {
          for (let ly = 3; ly <= 5; ly++) {
            if (Math.abs(lx) === 2 && Math.abs(lz) === 2 && ly === 5) continue;
            const nx = x + lx;
            const nz = z + lz;
            const ny = h + ly;
            if (nx < 0 || nx >= CS || nz < 0 || nz >= CS || ny >= WH) continue;
            if (data[idx(nx, ny, nz)] === AIR) data[idx(nx, ny, nz)] = LEAVES;
          }
        }
      }
    }
  }
  return data;
}

export class World {
  chunks = new Map<string, Chunk>();
  seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  ensure(cx: number, cz: number) {
    const k = key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = fillChunk(cx, cz, this.seed);
      this.chunks.set(k, c);
    }
    return c;
  }

  get(wx: number, wy: number, wz: number) {
    if (wy < 0 || wy >= WH) return AIR;
    const cx = Math.floor(wx / CS);
    const cz = Math.floor(wz / CS);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return AIR;
    const lx = ((wx % CS) + CS) % CS;
    const lz = ((wz % CS) + CS) % CS;
    return c[idx(lx, wy, lz)] ?? AIR;
  }

  solid(wx: number, wy: number, wz: number) {
    const id = this.get(wx, wy, wz);
    return id !== AIR && BLOCKS[id]?.solid;
  }

  set(wx: number, wy: number, wz: number, id: number) {
    if (wy < 0 || wy >= WH) return;
    const cx = Math.floor(wx / CS);
    const cz = Math.floor(wz / CS);
    const c = this.ensure(cx, cz);
    const lx = ((wx % CS) + CS) % CS;
    const lz = ((wz % CS) + CS) % CS;
    c[idx(lx, wy, lz)] = id;
  }

  stream(px: number, pz: number) {
    const cx = Math.floor(px / CS);
    const cz = Math.floor(pz / CS);
    const keep = new Set<string>();
    for (let dx = -RD; dx <= RD; dx++) {
      for (let dz = -RD; dz <= RD; dz++) {
        const nx = cx + dx;
        const nz = cz + dz;
        this.ensure(nx, nz);
        keep.add(key(nx, nz));
      }
    }
    for (const k of this.chunks.keys()) {
      if (!keep.has(k)) this.chunks.delete(k);
    }
    return { cx, cz };
  }
}

export const HALF_W = 0.28;
export const HEIGHT = 1.72;
export const EYE = 1.55;

export function overlaps(world: World, x: number, y: number, z: number) {
  const minX = Math.floor(x - HALF_W);
  const maxX = Math.floor(x + HALF_W);
  const minY = Math.floor(y + 0.001);
  const maxY = Math.floor(y + HEIGHT - 0.01);
  const minZ = Math.floor(z - HALF_W);
  const maxZ = Math.floor(z + HALF_W);
  for (let bx = minX; bx <= maxX; bx++) {
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (world.solid(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

/** Axis-separated AABB with substeps so fast falls cannot tunnel into the hill. */
export function moveBody(
  world: World,
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  dt: number,
) {
  const travel = Math.max(Math.abs(vel.x), Math.abs(vel.y), Math.abs(vel.z)) * dt;
  const steps = Math.max(1, Math.min(8, Math.ceil(travel / 0.25)));
  const sdt = dt / steps;
  let grounded = false;
  for (let i = 0; i < steps; i++) {
    if (stepAxis(world, pos, vel, sdt)) grounded = true;
  }
  return grounded;
}
function stepAxis(
  world: World,
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  dt: number,
) {
  let grounded = false;

  pos.x += vel.x * dt;
  if (overlaps(world, pos.x, pos.y, pos.z)) {
    if (vel.x > 0) pos.x = Math.floor(pos.x + HALF_W) - HALF_W - 0.001;
    else pos.x = Math.ceil(pos.x - HALF_W) + HALF_W + 0.001;
    vel.x = 0;
  }

  pos.z += vel.z * dt;
  if (overlaps(world, pos.x, pos.y, pos.z)) {
    if (vel.z > 0) pos.z = Math.floor(pos.z + HALF_W) - HALF_W - 0.001;
    else pos.z = Math.ceil(pos.z - HALF_W) + HALF_W + 0.001;
    vel.z = 0;
  }

  const y0 = pos.y;
  pos.y += vel.y * dt;
  if (overlaps(world, pos.x, pos.y, pos.z)) {
    if (vel.y <= 0) {
      let top = -1;
      const minX = Math.floor(pos.x - HALF_W);
      const maxX = Math.floor(pos.x + HALF_W);
      const minZ = Math.floor(pos.z - HALF_W);
      const maxZ = Math.floor(pos.z + HALF_W);
      const minY = Math.floor(Math.min(y0, pos.y)) - 1;
      const maxY = Math.floor(Math.max(y0, pos.y) + HEIGHT);
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
      pos.y = Math.ceil(pos.y + HEIGHT) - HEIGHT - 0.001;
    }
    vel.y = 0;
  }

  return grounded;
}

export function raycast(
  world: World,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  max = 6,
) {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX =
    stepX > 0 ? (Math.floor(ox) + 1 - ox) * tDeltaX : stepX < 0 ? (ox - Math.floor(ox)) * tDeltaX : Infinity;
  let tMaxY =
    stepY > 0 ? (Math.floor(oy) + 1 - oy) * tDeltaY : stepY < 0 ? (oy - Math.floor(oy)) * tDeltaY : Infinity;
  let tMaxZ =
    stepZ > 0 ? (Math.floor(oz) + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - Math.floor(oz)) * tDeltaZ : Infinity;
  let faceX = 0;
  let faceY = 0;
  let faceZ = 0;
  let t = 0;
  for (let i = 0; i < 48 && t <= max; i++) {
    if (world.solid(x, y, z)) return { x, y, z, faceX, faceY, faceZ };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      faceX = -stepX;
      faceY = 0;
      faceZ = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      faceX = 0;
      faceY = -stepY;
      faceZ = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      faceX = 0;
      faceY = 0;
      faceZ = -stepZ;
    }
  }
  return null;
}
