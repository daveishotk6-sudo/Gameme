export enum BlockType {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Wood = 4,
  Leaves = 5,
  Sand = 6,
  Water = 7,
  Cobblestone = 8,
  Bedrock = 9,
}

export interface BlockDef {
  id: BlockType
  name: string
  solid: boolean
  transparent: boolean
  color: string
  hardness: number
}

export const BLOCKS: Record<BlockType, BlockDef> = {
  [BlockType.Air]: { id: BlockType.Air, name: 'Air', solid: false, transparent: true, color: '#000000', hardness: 0 },
  [BlockType.Grass]: { id: BlockType.Grass, name: 'Grass', solid: true, transparent: false, color: '#4caf50', hardness: 0.6 },
  [BlockType.Dirt]: { id: BlockType.Dirt, name: 'Dirt', solid: true, transparent: false, color: '#8d6e63', hardness: 0.5 },
  [BlockType.Stone]: { id: BlockType.Stone, name: 'Stone', solid: true, transparent: false, color: '#9e9e9e', hardness: 1.5 },
  [BlockType.Wood]: { id: BlockType.Wood, name: 'Wood', solid: true, transparent: false, color: '#a1887f', hardness: 1.0 },
  [BlockType.Leaves]: { id: BlockType.Leaves, name: 'Leaves', solid: true, transparent: true, color: '#2e7d32', hardness: 0.2 },
  [BlockType.Sand]: { id: BlockType.Sand, name: 'Sand', solid: true, transparent: false, color: '#f0e68c', hardness: 0.5 },
  [BlockType.Water]: { id: BlockType.Water, name: 'Water', solid: false, transparent: true, color: '#2196f3', hardness: 0 },
  [BlockType.Cobblestone]: { id: BlockType.Cobblestone, name: 'Cobblestone', solid: true, transparent: false, color: '#757575', hardness: 2.0 },
  [BlockType.Bedrock]: { id: BlockType.Bedrock, name: 'Bedrock', solid: true, transparent: false, color: '#424242', hardness: 999 },
}

// Backward compatible color map
export const BlockColors: Record<number, string> = Object.fromEntries(
  Object.values(BLOCKS).map((b) => [b.id, b.color])
)
