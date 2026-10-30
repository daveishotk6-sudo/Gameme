import { BlockType } from './BlockTypes'
import { CHUNK_SIZE, WORLD_HEIGHT } from './Constants'
import { getHeight, getBiome } from './Noise'

export type ChunkData = number[][][] // [x][y][z]

export function generateChunk(chunkX: number, chunkZ: number, seed = 0): ChunkData {
  const blocks: ChunkData = []

  for (let x = 0; x < CHUNK_SIZE; x++) {
    blocks[x] = []
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      blocks[x][y] = []
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = chunkX * CHUNK_SIZE + x
        const wz = chunkZ * CHUNK_SIZE + z
        const h = getHeight(wx, wz, seed)
        const biome = getBiome(wx, wz, seed)

        if (y === 0) {
          blocks[x][y][z] = BlockType.Bedrock
        } else if (y > h) {
          blocks[x][y][z] = BlockType.Air
        } else if (y === h) {
          blocks[x][y][z] = biome === 'desert' ? BlockType.Sand : BlockType.Grass
        } else if (y > h - 4) {
          blocks[x][y][z] = biome === 'desert' ? BlockType.Sand : BlockType.Dirt
        } else {
          blocks[x][y][z] = BlockType.Stone
        }
      }
    }
  }

  // Simple tree generation
  for (let x = 2; x < CHUNK_SIZE - 2; x++) {
    for (let z = 2; z < CHUNK_SIZE - 2; z++) {
      const wx = chunkX * CHUNK_SIZE + x
      const wz = chunkZ * CHUNK_SIZE + z
      if ((wx * 17 + wz * 31 + seed) % 47 === 0) {
        const h = getHeight(wx, wz, seed)
        if (h + 5 < WORLD_HEIGHT && getBiome(wx, wz, seed) !== 'desert') {
          // Trunk
          for (let ty = 1; ty <= 4; ty++) {
            blocks[x][h + ty][z] = BlockType.Wood
          }
          // Leaves
          for (let lx = -2; lx <= 2; lx++) {
            for (let lz = -2; lz <= 2; lz++) {
              for (let ly = 3; ly <= 5; ly++) {
                if (Math.abs(lx) + Math.abs(lz) + (ly === 5 ? 1 : 0) < 4) {
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
  }

  return blocks
}
