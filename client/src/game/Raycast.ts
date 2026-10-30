import * as THREE from 'three'
import { MAX_BUILD_DISTANCE } from './Constants'
import { BlockType } from './BlockTypes'
import type { ChunkData } from './Terrain'
import { CHUNK_SIZE, WORLD_HEIGHT } from './Constants'

export interface RayHit {
  x: number
  y: number
  z: number
  face: THREE.Vector3 // normal of the face hit
  distance: number
}

function getBlock(
  chunks: Map<string, ChunkData>,
  edits: Map<string, BlockType>,
  wx: number,
  wy: number,
  wz: number
): BlockType {
  const edit = edits.get(`${wx},${wy},${wz}`)
  if (edit !== undefined) return edit

  if (wy < 0 || wy >= WORLD_HEIGHT) return BlockType.Air
  const cx = Math.floor(wx / CHUNK_SIZE)
  const cz = Math.floor(wz / CHUNK_SIZE)
  const data = chunks.get(`${cx},${cz}`)
  if (!data) return BlockType.Air
  const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
  const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
  return data[lx][wy][lz] as BlockType
}

/** DDA voxel raycast */
export function raycastVoxel(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  chunks: Map<string, ChunkData>,
  edits: Map<string, BlockType>,
  maxDist = MAX_BUILD_DISTANCE
): RayHit | null {
  const dir = direction.clone().normalize()
  let t = 0

  let x = Math.floor(origin.x)
  let y = Math.floor(origin.y)
  let z = Math.floor(origin.z)

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0
  const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity

  let tMaxX = stepX > 0 ? (Math.floor(origin.x) + 1 - origin.x) * tDeltaX : stepX < 0 ? (origin.x - Math.floor(origin.x)) * tDeltaX : Infinity
  let tMaxY = stepY > 0 ? (Math.floor(origin.y) + 1 - origin.y) * tDeltaY : stepY < 0 ? (origin.y - Math.floor(origin.y)) * tDeltaY : Infinity
  let tMaxZ = stepZ > 0 ? (Math.floor(origin.z) + 1 - origin.z) * tDeltaZ : stepZ < 0 ? (origin.z - Math.floor(origin.z)) * tDeltaZ : Infinity

  let face = new THREE.Vector3(0, 0, 0)

  while (t <= maxDist) {
    const block = getBlock(chunks, edits, x, y, z)
    if (block !== BlockType.Air && block !== BlockType.Water) {
      return { x, y, z, face: face.clone(), distance: t }
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX
        t = tMaxX
        tMaxX += tDeltaX
        face.set(-stepX, 0, 0)
      } else {
        z += stepZ
        t = tMaxZ
        tMaxZ += tDeltaZ
        face.set(0, 0, -stepZ)
      }
    } else {
      if (tMaxY < tMaxZ) {
        y += stepY
        t = tMaxY
        tMaxY += tDeltaY
        face.set(0, -stepY, 0)
      } else {
        z += stepZ
        t = tMaxZ
        tMaxZ += tDeltaZ
        face.set(0, 0, -stepZ)
      }
    }
  }
  return null
}
