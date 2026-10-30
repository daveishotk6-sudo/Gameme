import { useEffect, useState, useCallback, useRef } from 'react'
import { generateChunk, type ChunkData } from './Terrain'
import Chunk from './Chunk'
import { CHUNK_SIZE, RENDER_DISTANCE, UNLOAD_DISTANCE } from './Constants'
import Player from './Player'
import { useGameStore } from './store'
import { BlockType } from './BlockTypes'

interface WorldProps {
  seed: number
}

export default function World({ seed }: WorldProps) {
  const [chunks, setChunks] = useState<Map<string, ChunkData>>(new Map())
  const chunksRef = useRef(chunks)
  chunksRef.current = chunks
  const [playerChunk, setPlayerChunk] = useState({ x: 0, z: 0 })
  const edits = useGameStore((s) => s.edits)

  const key = (cx: number, cz: number) => `${cx},${cz}`

  const loadAround = useCallback((cx: number, cz: number) => {
    setChunks((prev) => {
      const next = new Map(prev)
      let changed = false

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

      for (const k of Array.from(next.keys())) {
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

  // Apply edits on top of generated data for rendering
  const getChunkWithEdits = (cx: number, cz: number, data: ChunkData): ChunkData => {
    // Shallow copy only if edits exist in this chunk
    let copy: ChunkData | null = null
    for (const [k, type] of edits) {
      const [wx, wy, wz] = k.split(',').map(Number)
      const ecx = Math.floor(wx / CHUNK_SIZE)
      const ecz = Math.floor(wz / CHUNK_SIZE)
      if (ecx === cx && ecz === cz) {
        if (!copy) {
          copy = data.map((yz) => yz.map((z) => [...z]))
        }
        const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
        const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
        if (wy >= 0 && wy < copy[0].length) {
          copy[lx][wy][lz] = type
        }
      }
    }
    return copy ?? data
  }

  return (
    <>
      {Array.from(chunks.entries()).map(([k, data]) => {
        const [cx, cz] = k.split(',').map(Number)
        const withEdits = getChunkWithEdits(cx, cz, data)
        return <Chunk key={k + edits.size} chunkX={cx} chunkZ={cz} data={withEdits} />
      })}
      <Player onMove={onPlayerMove} chunksRef={chunksRef} />
    </>
  )
}
