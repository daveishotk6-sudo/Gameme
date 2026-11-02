import * as THREE from "three";
import { AIR, BLOCKS, CS, WH, type Chunk, type World } from "./world";

const FACES = [
  { d: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], s: 0.78 },
  { d: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], s: 0.78 },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1 },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.5 },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.88 },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.88 },
] as const;

function solidAt(world: World, chunk: Chunk, cx: number, cz: number, x: number, y: number, z: number) {
  if (y < 0 || y >= WH) return false;
  if (x >= 0 && x < CS && z >= 0 && z < CS) {
    const id = chunk[x + z * CS + y * CS * CS] ?? AIR;
    return id !== AIR && !!BLOCKS[id]?.solid;
  }
  return world.solid(cx * CS + x, y, cz * CS + z);
}

export function buildChunkGeometry(world: World, cx: number, cz: number, chunk: Chunk) {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let v = 0;
  const ox = cx * CS;
  const oz = cz * CS;

  for (let x = 0; x < CS; x++) {
    for (let z = 0; z < CS; z++) {
      for (let y = 0; y < WH; y++) {
        const id = chunk[x + z * CS + y * CS * CS] ?? AIR;
        if (id === AIR) continue;
        const def = BLOCKS[id];
        if (!def) continue;
        for (const face of FACES) {
          if (solidAt(world, chunk, cx, cz, x + face.d[0], y + face.d[1], z + face.d[2])) continue;
          const hex =
            id === 1 && face.d[1] !== 1 && "colorSide" in def ? def.colorSide : def.color;
          const color = new THREE.Color(hex);
          for (const c of face.c) {
            pos.push(ox + x + c[0], y + c[1], oz + z + c[2]);
            col.push(color.r * face.s, color.g * face.s, color.b * face.s);
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
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
