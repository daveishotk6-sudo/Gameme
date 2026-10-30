import { create } from 'zustand'
import { BlockType } from './BlockTypes'

interface InventorySlot {
  type: BlockType
  count: number
}

interface GameStore {
  // Inventory
  hotbar: InventorySlot[]
  selectedSlot: number
  setSelectedSlot: (i: number) => void
  addItem: (type: BlockType, count?: number) => void
  removeItem: (type: BlockType, count?: number) => boolean

  // World edits (for client-side authority for now)
  edits: Map<string, BlockType>
  setBlock: (x: number, y: number, z: number, type: BlockType) => void
  getEdit: (x: number, y: number, z: number) => BlockType | undefined

  // UI
  isPaused: boolean
  setPaused: (v: boolean) => void
  showInventory: boolean
  toggleInventory: () => void

  // Time
  timeOfDay: number // 0-1
  setTimeOfDay: (t: number) => void
}

const defaultHotbar: InventorySlot[] = [
  { type: BlockType.Grass, count: 64 },
  { type: BlockType.Dirt, count: 64 },
  { type: BlockType.Stone, count: 64 },
  { type: BlockType.Wood, count: 32 },
  { type: BlockType.Cobblestone, count: 32 },
  { type: BlockType.Sand, count: 32 },
  { type: BlockType.Leaves, count: 16 },
  { type: BlockType.Air, count: 0 },
  { type: BlockType.Air, count: 0 },
]

export const useGameStore = create<GameStore>((set, get) => ({
  hotbar: defaultHotbar,
  selectedSlot: 0,
  setSelectedSlot: (i) => set({ selectedSlot: Math.max(0, Math.min(8, i)) }),

  addItem: (type, count = 1) => {
    set((state) => {
      const hotbar = [...state.hotbar]
      const idx = hotbar.findIndex((s) => s.type === type && s.count > 0)
      if (idx >= 0) {
        hotbar[idx] = { ...hotbar[idx], count: hotbar[idx].count + count }
      } else {
        const empty = hotbar.findIndex((s) => s.count === 0 || s.type === BlockType.Air)
        if (empty >= 0) hotbar[empty] = { type, count }
      }
      return { hotbar }
    })
  },

  removeItem: (type, count = 1) => {
    const state = get()
    const hotbar = [...state.hotbar]
    const idx = hotbar.findIndex((s) => s.type === type && s.count >= count)
    if (idx < 0) return false
    hotbar[idx] = { ...hotbar[idx], count: hotbar[idx].count - count }
    if (hotbar[idx].count <= 0) hotbar[idx] = { type: BlockType.Air, count: 0 }
    set({ hotbar })
    return true
  },

  edits: new Map(),
  setBlock: (x, y, z, type) => {
    set((state) => {
      const edits = new Map(state.edits)
      edits.set(`${x},${y},${z}`, type)
      return { edits }
    })
  },
  getEdit: (x, y, z) => get().edits.get(`${x},${y},${z}`),

  isPaused: false,
  setPaused: (v) => set({ isPaused: v }),
  showInventory: false,
  toggleInventory: () => set((s) => ({ showInventory: !s.showInventory })),

  timeOfDay: 0.3,
  setTimeOfDay: (t) => set({ timeOfDay: t }),
}))
