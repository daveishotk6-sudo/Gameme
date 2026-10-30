import { useMemo } from 'react'
import * as THREE from 'three'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { BlockType, BLOCKS } from './BlockTypes'
import { CHUNK_SIZE, WORLD_HEIGHT } from './Constants'
import type { ChunkData } from './Terrain'

interface ChunkProps {
  chunkX: number
  chunkZ: number
  data: ChunkData
}

const FACE_DIRS = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
]

function isSolid(data: ChunkData, x: number, y: number, z: number): boolean {
  if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return false
  const t = data[x][y][z]
  return t !== BlockType.Air && !!BLOCKS[t as BlockType]?.solid
}

export default function Chunk({ chunkX, chunkZ, data }: ChunkProps) {
  const { geometry, colliders } = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    let vertexCount = 0
    const cols: { x: number; y: number; z: number }[] = []

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        let topY = -1
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          if (isSolid(data, x, y, z)) {
            topY = y
            break
          }
        }
        // Only every other block as collider — still walkable, much cheaper
        if (topY >= 0 && (x + z) % 2 === 0) {
          cols.push({ x, y: topY, z })
        }

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const type = data[x][y][z]
          if (type === BlockType.Air) continue
          const def = BLOCKS[type as BlockType]
          if (!def) continue

          // Skip hidden blocks completely (surrounded on all 6 sides)
          let exposed = false
          for (const face of FACE_DIRS) {
            const [dx, dy, dz] = face.dir
            if (!isSolid(data, x + dx, y + dy, z + dz)) {
              exposed = true
              break
            }
          }
          if (!exposed) continue

          const color = new THREE.Color(def.color)

          for (const face of FACE_DIRS) {
            const [dx, dy, dz] = face.dir
            if (isSolid(data, x + dx, y + dy, z + dz)) continue

            for (const corner of face.corners) {
              positions.push(
                x + corner[0] + chunkX * CHUNK_SIZE,
                y + corner[1],
                z + corner[2] + chunkZ * CHUNK_SIZE
              )
              colors.push(color.r, color.g, color.b)
            }

            indices.push(
              vertexCount,
              vertexCount + 1,
              vertexCount + 2,
              vertexCount,
              vertexCount + 2,
              vertexCount + 3
            )
            vertexCount += 4
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    return { geometry: geo, colliders: cols }
  }, [data, chunkX, chunkZ])

  const ox = chunkX * CHUNK_SIZE
  const oz = chunkZ * CHUNK_SIZE

  return (
    <>
      <mesh geometry={geometry} frustumCulled>
        <meshBasicMaterial vertexColors />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        {colliders.map((c, i) => (
          <CuboidCollider
            key={i}
            args={[0.55, 0.5, 0.55]}
            position={[ox + c.x + 0.5, c.y + 0.5, oz + c.z + 0.5]}
          />
        ))}
      </RigidBody>
    </>
  )
}
