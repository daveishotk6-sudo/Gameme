import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BlockType, BLOCKS } from './BlockTypes'
import { CHUNK_SIZE, WORLD_HEIGHT } from './Constants'
import type { ChunkData } from './Terrain'

interface ChunkProps {
  chunkX: number
  chunkZ: number
  data: ChunkData
}

const FACE_DIRS = [
  { dir: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] }, // +X
  { dir: [-1,0,0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] }, // -X
  { dir: [0,1,0], corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] }, // +Y
  { dir: [0,-1,0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] }, // -Y
  { dir: [0,0,1], corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] }, // +Z
  { dir: [0,0,-1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] }, // -Z
]

function isSolid(data: ChunkData, x: number, y: number, z: number): boolean {
  if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return false
  const t = data[x][y][z]
  return t !== BlockType.Air && BLOCKS[t as BlockType]?.solid
}

export default function Chunk({ chunkX, chunkZ, data }: ChunkProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  const geometry = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    let vertexCount = 0

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const type = data[x][y][z]
          if (type === BlockType.Air) continue

          const def = BLOCKS[type as BlockType]
          if (!def) continue

          const color = new THREE.Color(def.color)

          for (const face of FACE_DIRS) {
            const [dx, dy, dz] = face.dir
            if (isSolid(data, x + dx, y + dy, z + dz)) continue

            // Add face
            for (const corner of face.corners) {
              positions.push(
                x + corner[0] + chunkX * CHUNK_SIZE,
                y + corner[1],
                z + corner[2] + chunkZ * CHUNK_SIZE
              )
              // Slight variation for better look
              const shade = 0.85 + Math.random() * 0.15
              colors.push(color.r * shade, color.g * shade, color.b * shade)
            }

            indices.push(
              vertexCount, vertexCount + 1, vertexCount + 2,
              vertexCount, vertexCount + 2, vertexCount + 3
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
    return geo
  }, [data, chunkX, chunkZ])

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshLambertMaterial vertexColors flatShading />
    </mesh>
  )
}
