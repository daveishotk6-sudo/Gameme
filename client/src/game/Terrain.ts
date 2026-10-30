import { BlockType } from './BlockTypes'
import { CHUNK_SIZE, WORLD_HEIGHT } from './Constants'
import { getHeight, getBiome } from './Noise'

export type ChunkData = number[][][]

export function generateChunk(chunkX: number, chunkZ: number, seed = 0): ChunkData {
  const blocks: ChunkData = []

  for (let x = 0; x < CHUNK_SIZE; x++) {
    blocks[x] = []
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      blocks[x][y] = new Array(CHUNK_SIZE).fill(BlockType.Air)
    }
  }

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = chunkX * CHUNK_SIZE + x
      const wz = chunkZ * CHUNK_SIZE + z
      const h = Math.min(Math.max(getHeight(wx, wz, seed), 4), WORLD_HEIGHT - 6)
      const biome = getBiome(wx, wz, seed)

      for (let y = 0; y <= h; y++) {
        if (y === 0) {
          blocks[x][y][z] = BlockType.Bedrock
        } else if (y === h) {
          blocks[x][y][z] = biome === 'desert' ? BlockType.Sand : BlockType.Grass
        } else if (y > h - 3) {
          blocks[x][y][z] = biome === 'desert' ? BlockType.Sand : BlockType.Dirt
        } else {
          blocks[x][y][z] = BlockType.Stone
        }
      }
    }
  }

  // Trees — full leaves canopy
  for (let x = 2; x < CHUNK_SIZE - 2; x++) {
    for (let z = 2; z < CHUNK_SIZE - 2; z++) {
      const wx = chunkX * CHUNK_SIZE + x
      const wz = chunkZ * CHUNK_SIZE + z
      if ((wx * 17 + wz * 31 + seed * 7) % 53 !== 0) continue
      if (getBiome(wx, wz, seed) === 'desert') continue

      const h = Math.min(getHeight(wx, wz, seed), WORLD_HEIGHT - 8)
      if (h < 5) continue

      // Trunk
      for (let ty = 1; ty <= 4; ty++) {
        if (h + ty < WORLD_HEIGHT) blocks[x][h + ty][z] = BlockType.Wood
      }

      // Leaves (3x3x3 blob on top)
      for (let lx = -2; lx <= 2; lx++) {
        for (let lz = -2; lz <= 2; lz++) {
          for (let ly = 3; ly <= 5; ly++) {
            if (Math.abs(lx) === 2 && Math.abs(lz) === 2) continue
            const nx = x + lx
            const nz = z + lz
            const ny = h + ly
            if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) continue
            if (ny < 0 || ny >= WORLD_HEIGHT) continue
            if (blocks[nx][ny][nz] === BlockType.Air) {
              blocks[nx][ny][nz] = BlockType.Leaves
            }
          }
        }
      }
    }
  }

  return blocks
}
