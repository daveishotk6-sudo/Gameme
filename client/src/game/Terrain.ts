import { BlockType } from './BlockTypes'
import { CHUNK_SIZE, WORLD_HEIGHT } from './Constants'
import { getHeight, getBiome } from './Noise'

export type ChunkData = number[][][]

export function generateChunk(chunkX: number, chunkZ: number, seed = 0): ChunkData {
  const blocks: ChunkData = []

  for (let x = 0; x < CHUNK_SIZE; x++) {
    blocks[x] = []
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      blocks[x][y] = []
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = chunkX * CHUNK_SIZE + x
        const wz = chunkZ * CHUNK_SIZE + z
        const h = Math.min(getHeight(wx, wz, seed), WORLD_HEIGHT - 2)
        const biome = getBiome(wx, wz, seed)

        if (y === 0) {
          blocks[x][y][z] = BlockType.Bedrock
        } else if (y > h) {
          blocks[x][y][z] = BlockType.Air
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

  // Fewer trees for performance
  for (let x = 3; x < CHUNK_SIZE - 3; x += 2) {
    for (let z = 3; z < CHUNK_SIZE - 3; z += 2) {
      const wx = chunkX * CHUNK_SIZE + x
      const wz = chunkZ * CHUNK_SIZE + z
      if ((wx * 13 + wz * 29 + seed) % 61 === 0) {
        const h = Math.min(getHeight(wx, wz, seed), WORLD_HEIGHT - 7)
        if (getBiome(wx, wz, seed) !== 'desert') {
          for (let ty = 1; ty <= 3; ty++) {
            blocks[x][h + ty][z] = BlockType.Wood
          }
          for (let lx = -1; lx <= 1; lx++) {
            for (let lz = -1; lz <= 1; lz++) {
              for (let ly = 3; ly <= 4; ly++) {
                const nx = x + lx
                const nz = z + lz
                if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
                  if (blocks[nx][h + ly][nz] === BlockType.Air) {
                    blocks[nx][h + ly][nz] = BlockType.Leaves
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return blocks
}
