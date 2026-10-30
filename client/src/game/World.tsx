import { useEffect, useState, useCallback } from 'react'
import { generateChunk, type ChunkData } from './Terrain'
import Chunk from './Chunk'
import { CHUNK_SIZE, RENDER_DISTANCE, UNLOAD_DISTANCE } from './Constants'
import Player from './Player'

interface WorldProps {
  seed: number
}

export default function World({ seed }: WorldProps) {
  const [chunks, setChunks] = useState<Map<string, ChunkData>>(new Map())
  const [playerChunk, setPlayerChunk] = useState({ x: 0, z: 0 })

  const key = (cx: number, cz: number) => `${cx},${cz}`

  const loadAround = useCallback((cx: number, cz: number) => {
    setChunks((prev) => {
      const next = new Map(prev)
      let changed = false

      // Load
      for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
        for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
          const nx = cx + dx
          const nz = cz + dz
          const k = key(nx, nz)
          if (!next.has(k)) {
            next.set(k, generateChunk(nx, nz, seed))
            changed = true
          }
        }
      }

      // Unload far chunks
      for (const k of next.keys()) {
        const [x, z] = k.split(',').map(Number)
        if (Math.abs(x - cx) > UNLOAD_DISTANCE || Math.abs(z - cz) > UNLOAD_DISTANCE) {
          next.delete(k)
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [seed])

  useEffect(() => {
    loadAround(0, 0)
  }, [loadAround])

  const onPlayerMove = useCallback((px: number, pz: number) => {
    const cx = Math.floor(px / CHUNK_SIZE)
    const cz = Math.floor(pz / CHUNK_SIZE)
    if (cx !== playerChunk.x || cz !== playerChunk.z) {
      setPlayerChunk({ x: cx, z: cz })
      loadAround(cx, cz)
    }
  }, [playerChunk, loadAround])

  return (
    <>
      {Array.from(chunks.entries()).map(([k, data]) => {
        const [cx, cz] = k.split(',').map(Number)
        return <Chunk key={k} chunkX={cx} chunkZ={cz} data={data} />
      })}
      <Player onMove={onPlayerMove} />
    </>
  )
}
