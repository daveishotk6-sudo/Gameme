export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const LOG = 4;
export const LEAVES = 5;
export const SAND = 6;
export const COBBLE = 7;
export const WATER = 8;
export const PLANKS = 9;
export const GLASS = 10;
export const BRICK = 11;
export const SNOW = 12;
export const COAL_ORE = 13;
export const IRON_ORE = 14;
export const GOLD_ORE = 15;
export const BASALT = 16;
export const LANTERN = 17;
export const WOOL = 18;
export const CACTUS = 19;
export const FLOWER_RED = 20;
export const FLOWER_YELLOW = 21;
export const TALL_GRASS = 22;
export const GOLD_BLOCK = 23;
export const PINE_LEAVES = 24;
export const SIGN = 25;
export const FURNACE = 26;
export const OBSIDIAN = 27;
export const NETHERRACK = 28;
export const SOUL_SAND = 29;
export const GLOWSTONE = 30;
export const NETHER_BRICK = 31;
export const MAGMA = 32;
export const NETHER_PORTAL = 33;
export const BLACKSTONE = 34;
export const QUARTZ_BLOCK = 35;
export const GRAVEL = 36;
export const CLAY = 37;
export const ICE = 38;
export const PUMPKIN = 39;
export const TNT = 40;
export const LAST_BLOCK = 39;

// Non-block items
export const COAL = 100;
export const IRON = 101;
export const GOLD = 102;
export const STICK = 103;
export const MEAT = 104; // legacy generic raw meat (treated as beef)
export const RAW_PORK = 105;
export const COOKED_PORK = 106;
export const RAW_BEEF = 107;
export const COOKED_BEEF = 108;
export const RAW_CHICKEN = 109;
export const COOKED_CHICKEN = 116;
export const ROTTEN_FLESH = 140;
export const BONE = 141;
export const STRING = 142;
export const PICK_WOOD = 110;
export const PICK_STONE = 111;
export const PICK_IRON = 112;
export const SWORD_WOOD = 113;
export const SWORD_STONE = 114;
export const SWORD_IRON = 115;
export const PICK_GOLD = 117;
export const SWORD_GOLD = 118;
export const PICK_OBSIDIAN = 119;
export const SWORD_OBSIDIAN = 120;
export const AXE_WOOD = 121;
export const AXE_STONE = 122;
export const AXE_IRON = 123;
export const SHOVEL_WOOD = 124;
export const SHOVEL_STONE = 125;
export const SHOVEL_IRON = 126;
export const BOW = 127;

export const TILE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 6;

export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, LOG_SIDE: 4, LOG_TOP: 5, LEAVES: 6, SAND: 7,
  COBBLE: 8, WATER: 9, PLANKS: 10, GLASS: 11, BRICK: 12, SNOW: 13, SNOW_SIDE: 14, COAL: 15,
  IRON: 16, GOLD: 17, BASALT: 18, LANTERN: 19, WOOL: 20, CACTUS_SIDE: 21, CACTUS_TOP: 22,
  FLOWER_RED: 23, FLOWER_YELLOW: 24, TALL_GRASS: 25, GOLD_BLOCK: 26, PINE_LEAVES: 27, FURNACE: 28,
  OBSIDIAN: 29, NETHERRACK: 30, SOUL_SAND: 31, GLOWSTONE: 32, NETHER_BRICK: 33, MAGMA: 34,
  NETHER_PORTAL: 35, BLACKSTONE: 36, QUARTZ: 37, GRAVEL: 38, CLAY: 39, ICE: 40, PUMPKIN_SIDE: 41, PUMPKIN_TOP: 42, TNT: 43,
} as const;

export interface BlockDef {
  id: number;
  name: string;
  color: string;
  top: number;
  bottom: number;
  side: number;
  solid: boolean; // collides
  opaque: boolean; // hides neighbouring faces and blocks sky light
  liquid: boolean;
  cross: boolean; // plant drawn as two crossed quads
  transparent: boolean; // drawn in the see-through pass
  hardness: number; // seconds to break by hand
  drop: number | null;
  pick: boolean; // pickaxes speed this up
  light: boolean;
  /** Drawn by the engine rather than the terrain mesher (signs). */
  invisible: boolean;
}

const DEFS: BlockDef[] = [];

function reg(id: number, name: string, color: string, tiles: number | [number, number, number], o: Partial<BlockDef> = {}) {
  const [top, bottom, side] = typeof tiles === "number" ? [tiles, tiles, tiles] : tiles;
  DEFS[id] = {
    id, name, color, top, bottom, side,
    solid: true, opaque: true, liquid: false, cross: false, transparent: false,
    hardness: 1, drop: id, pick: false, light: false, invisible: false,
    ...o,
  };
}

reg(AIR, "Air", "#000000", 0, { solid: false, opaque: false, hardness: 0, drop: null });
reg(GRASS, "Grass", "#5aa845", [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE], { hardness: 0.7, drop: DIRT });
reg(DIRT, "Dirt", "#8a5f3f", T.DIRT, { hardness: 0.6 });
reg(STONE, "Stone", "#8c8c90", T.STONE, { hardness: 2.2, drop: COBBLE, pick: true });
reg(LOG, "Log", "#6b4a2b", [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE], { hardness: 1.4 });
reg(LEAVES, "Leaves", "#3e8e3a", T.LEAVES, { hardness: 0.25, drop: null });
reg(SAND, "Sand", "#e2d29c", T.SAND, { hardness: 0.5 });
reg(COBBLE, "Cobble", "#757579", T.COBBLE, { hardness: 2.2, pick: true });
reg(WATER, "Water", "#2f6fd8", T.WATER, { solid: false, opaque: false, liquid: true, transparent: true, hardness: Infinity, drop: null });
reg(PLANKS, "Planks", "#b88b52", T.PLANKS, { hardness: 1.1 });
reg(GLASS, "Glass", "#bfe3ee", T.GLASS, { opaque: false, transparent: true, hardness: 0.35 });
reg(BRICK, "Stone Brick", "#8a8a8e", T.BRICK, { hardness: 2.6, pick: true });
reg(SNOW, "Snow", "#f2f7fb", [T.SNOW, T.DIRT, T.SNOW_SIDE], { hardness: 0.3 });
reg(COAL_ORE, "Coal Ore", "#55555a", T.COAL, { hardness: 2.8, drop: COAL, pick: true });
reg(IRON_ORE, "Iron Ore", "#b8977f", T.IRON, { hardness: 3.4, drop: IRON, pick: true });
reg(GOLD_ORE, "Gold Ore", "#d9b83f", T.GOLD, { hardness: 3.6, drop: GOLD, pick: true });
reg(BASALT, "Basalt", "#2d2f36", T.BASALT, { hardness: Infinity, drop: null });
reg(LANTERN, "Lantern", "#ffd873", T.LANTERN, { hardness: 0.3, light: true });
reg(WOOL, "Wool", "#ececec", T.WOOL, { hardness: 0.6 });
reg(CACTUS, "Cactus", "#2f8f3d", [T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE], { hardness: 0.5 });
reg(FLOWER_RED, "Red Flower", "#d63a3a", T.FLOWER_RED, { solid: false, opaque: false, cross: true, hardness: 0 });
reg(FLOWER_YELLOW, "Yellow Flower", "#f0c93a", T.FLOWER_YELLOW, { solid: false, opaque: false, cross: true, hardness: 0 });
reg(TALL_GRASS, "Tall Grass", "#4f9a3a", T.TALL_GRASS, { solid: false, opaque: false, cross: true, hardness: 0 });
reg(GOLD_BLOCK, "Gold Block", "#f2c744", T.GOLD_BLOCK, { hardness: 3, pick: true });
reg(SIGN, "Sign", "#b88b52", T.PLANKS, { solid: false, opaque: false, invisible: true, hardness: 0.3 });
reg(PINE_LEAVES, "Pine Needles", "#27603a", T.PINE_LEAVES, { hardness: 0.25, drop: null });
reg(FURNACE, "Furnace", "#6a6a70", T.FURNACE, { hardness: 3.0, pick: true });
reg(OBSIDIAN, "Obsidian", "#1a0a2e", T.OBSIDIAN, { hardness: 12, pick: true });
reg(NETHERRACK, "Netherrack", "#6b2b2b", T.NETHERRACK, { hardness: 0.5 });
reg(SOUL_SAND, "Soul Sand", "#4a3a2a", T.SOUL_SAND, { hardness: 0.6 });
reg(GLOWSTONE, "Glowstone", "#f5d76e", T.GLOWSTONE, { hardness: 0.4, light: true });
reg(NETHER_BRICK, "Nether Brick", "#3a1a1a", T.NETHER_BRICK, { hardness: 2.8, pick: true });
reg(MAGMA, "Magma", "#c44a12", T.MAGMA, { hardness: 1.2, pick: true, light: true });
reg(NETHER_PORTAL, "Nether Portal", "#7b2cff", T.NETHER_PORTAL, {
  solid: false, opaque: false, transparent: true, hardness: Infinity, drop: null,
});
reg(BLACKSTONE, "Blackstone", "#2a2a30", T.BLACKSTONE, { hardness: 2.4, pick: true });
reg(QUARTZ_BLOCK, "Quartz", "#e8e4dc", T.QUARTZ, { hardness: 1.4, pick: true });
reg(GRAVEL, "Gravel", "#8a8580", T.GRAVEL, { hardness: 0.6 });
reg(CLAY, "Clay", "#9aa4b0", T.CLAY, { hardness: 0.6 });
reg(ICE, "Ice", "#a8d8f0", T.ICE, { opaque: false, transparent: true, hardness: 0.5 });
reg(PUMPKIN, "Pumpkin", "#e09030", [T.PUMPKIN_TOP, T.PUMPKIN_TOP, T.PUMPKIN_SIDE], { hardness: 0.9 });
reg(TNT, "TNT", "#c43030", T.TNT, { hardness: 0.2 });

export const BLOCKS = DEFS;
export function block(id: number): BlockDef {
  return DEFS[id] ?? DEFS[AIR]!;
}
export const isReplaceable = (id: number) => id === AIR || id === WATER || block(id).cross;

// ---------------------------------------------------------------- items

export interface ItemDef {
  id: number;
  name: string;
  color: string;
  kind: "block" | "material" | "pick" | "sword" | "axe" | "shovel" | "bow" | "food";
  speed?: number;
  dmg?: number;
  heal?: number;
}

const ITEMS: Record<number, ItemDef> = {
  [COAL]: { id: COAL, name: "Coal", color: "#2b2b2f", kind: "material" },
  [IRON]: { id: IRON, name: "Iron", color: "#d9b9a0", kind: "material" },
  [GOLD]: { id: GOLD, name: "Gold", color: "#f5d442", kind: "material" },
  [STICK]: { id: STICK, name: "Stick", color: "#8a6a3c", kind: "material" },
  [MEAT]: { id: MEAT, name: "Raw Beef", color: "#c9574a", kind: "food", heal: 3 },
  [RAW_PORK]: { id: RAW_PORK, name: "Raw Pork", color: "#e08a8a", kind: "food", heal: 3 },
  [COOKED_PORK]: { id: COOKED_PORK, name: "Cooked Pork", color: "#c46a3a", kind: "food", heal: 8 },
  [RAW_BEEF]: { id: RAW_BEEF, name: "Raw Beef", color: "#b83c3c", kind: "food", heal: 3 },
  [COOKED_BEEF]: { id: COOKED_BEEF, name: "Cooked Beef", color: "#8a3a20", kind: "food", heal: 8 },
  [RAW_CHICKEN]: { id: RAW_CHICKEN, name: "Raw Chicken", color: "#e8c9a0", kind: "food", heal: 2 },
  [COOKED_CHICKEN]: { id: COOKED_CHICKEN, name: "Cooked Chicken", color: "#d4a05a", kind: "food", heal: 6 },
  [ROTTEN_FLESH]: { id: ROTTEN_FLESH, name: "Rotten Flesh", color: "#7a8f4a", kind: "material" },
  [BONE]: { id: BONE, name: "Bone", color: "#e8e6da", kind: "material" },
  [STRING]: { id: STRING, name: "String", color: "#dcdcdc", kind: "material" },
  [PICK_WOOD]: { id: PICK_WOOD, name: "Wood Pickaxe", color: "#b88b52", kind: "pick", speed: 2.2 },
  [PICK_STONE]: { id: PICK_STONE, name: "Stone Pickaxe", color: "#9a9aa0", kind: "pick", speed: 3.6 },
  [PICK_IRON]: { id: PICK_IRON, name: "Iron Pickaxe", color: "#e6cdbb", kind: "pick", speed: 5.8 },
  [SWORD_WOOD]: { id: SWORD_WOOD, name: "Wood Sword", color: "#b88b52", kind: "sword", dmg: 4 },
  [SWORD_STONE]: { id: SWORD_STONE, name: "Stone Sword", color: "#9a9aa0", kind: "sword", dmg: 5 },
  [SWORD_IRON]: { id: SWORD_IRON, name: "Iron Sword", color: "#e6cdbb", kind: "sword", dmg: 7 },
  [PICK_GOLD]: { id: PICK_GOLD, name: "Gold Pickaxe", color: "#f5d442", kind: "pick", speed: 7.5 },
  [SWORD_GOLD]: { id: SWORD_GOLD, name: "Gold Sword", color: "#f5d442", kind: "sword", dmg: 5 },
  [PICK_OBSIDIAN]: { id: PICK_OBSIDIAN, name: "Obsidian Pickaxe", color: "#4a2080", kind: "pick", speed: 9.0 },
  [SWORD_OBSIDIAN]: { id: SWORD_OBSIDIAN, name: "Obsidian Sword", color: "#4a2080", kind: "sword", dmg: 10 },
  [AXE_WOOD]: { id: AXE_WOOD, name: "Wood Axe", color: "#b88b52", kind: "axe", speed: 2.5, dmg: 3 },
  [AXE_STONE]: { id: AXE_STONE, name: "Stone Axe", color: "#9a9aa0", kind: "axe", speed: 4.0, dmg: 4 },
  [AXE_IRON]: { id: AXE_IRON, name: "Iron Axe", color: "#e6cdbb", kind: "axe", speed: 6.0, dmg: 6 },
  [SHOVEL_WOOD]: { id: SHOVEL_WOOD, name: "Wood Shovel", color: "#b88b52", kind: "shovel", speed: 2.5 },
  [SHOVEL_STONE]: { id: SHOVEL_STONE, name: "Stone Shovel", color: "#9a9aa0", kind: "shovel", speed: 4.0 },
  [SHOVEL_IRON]: { id: SHOVEL_IRON, name: "Iron Shovel", color: "#e6cdbb", kind: "shovel", speed: 6.0 },
  [BOW]: { id: BOW, name: "Bow", color: "#8a6a3c", kind: "bow", dmg: 6 },
};

/** Raw food that a furnace can cook, and what it becomes. */
export const SMELT: Record<number, number> = {
  [MEAT]: COOKED_BEEF,
  [RAW_PORK]: COOKED_PORK,
  [RAW_BEEF]: COOKED_BEEF,
  [RAW_CHICKEN]: COOKED_CHICKEN,
};

export function itemInfo(id: number): ItemDef {
  const it = ITEMS[id];
  if (it) return it;
  const b = block(id);
  return { id, name: b.name, color: b.color, kind: "block" };
}

export const CREATIVE_PALETTE: number[] = [];
for (let i = 1; i <= LAST_BLOCK; i++) if (i !== WATER && i !== BASALT) CREATIVE_PALETTE.push(i);
CREATIVE_PALETTE.push(
  COAL, IRON, GOLD, STICK,
  MEAT, RAW_PORK, COOKED_PORK, RAW_BEEF, COOKED_BEEF, RAW_CHICKEN, COOKED_CHICKEN,
  ROTTEN_FLESH, BONE, STRING,
  PICK_WOOD, PICK_STONE, PICK_IRON, PICK_GOLD, PICK_OBSIDIAN,
  SWORD_WOOD, SWORD_STONE, SWORD_IRON, SWORD_GOLD, SWORD_OBSIDIAN,
  AXE_WOOD, AXE_STONE, AXE_IRON,
  SHOVEL_WOOD, SHOVEL_STONE, SHOVEL_IRON,
  BOW,
);

export interface Recipe {
  out: [number, number];
  inp: [number, number][];
}

export const RECIPES: Recipe[] = [
  { out: [PLANKS, 4], inp: [[LOG, 1]] },
  { out: [STICK, 4], inp: [[PLANKS, 2]] },
  { out: [STONE, 1], inp: [[COBBLE, 1], [COAL, 1]] },
  { out: [GLASS, 2], inp: [[SAND, 2], [COAL, 1]] },
  { out: [BRICK, 4], inp: [[STONE, 4]] },
  { out: [LANTERN, 1], inp: [[COAL, 1], [PLANKS, 1]] },
  { out: [PICK_WOOD, 1], inp: [[PLANKS, 3], [STICK, 2]] },
  { out: [PICK_STONE, 1], inp: [[COBBLE, 3], [STICK, 2]] },
  { out: [PICK_IRON, 1], inp: [[IRON, 3], [STICK, 2]] },
  { out: [SWORD_WOOD, 1], inp: [[PLANKS, 2], [STICK, 1]] },
  { out: [SWORD_STONE, 1], inp: [[COBBLE, 2], [STICK, 1]] },
  { out: [SWORD_IRON, 1], inp: [[IRON, 2], [STICK, 1]] },
  { out: [PICK_GOLD, 1], inp: [[GOLD, 3], [STICK, 2]] },
  { out: [SWORD_GOLD, 1], inp: [[GOLD, 2], [STICK, 1]] },
  { out: [PICK_OBSIDIAN, 1], inp: [[OBSIDIAN, 3], [STICK, 2]] },
  { out: [SWORD_OBSIDIAN, 1], inp: [[OBSIDIAN, 2], [STICK, 1]] },
  { out: [AXE_WOOD, 1], inp: [[PLANKS, 3], [STICK, 2]] },
  { out: [AXE_STONE, 1], inp: [[COBBLE, 3], [STICK, 2]] },
  { out: [AXE_IRON, 1], inp: [[IRON, 3], [STICK, 2]] },
  { out: [SHOVEL_WOOD, 1], inp: [[PLANKS, 1], [STICK, 2]] },
  { out: [SHOVEL_STONE, 1], inp: [[COBBLE, 1], [STICK, 2]] },
  { out: [SHOVEL_IRON, 1], inp: [[IRON, 1], [STICK, 2]] },
  { out: [BOW, 1], inp: [[STICK, 3], [TALL_GRASS, 3]] },
  { out: [GOLD_BLOCK, 1], inp: [[GOLD, 4]] },
  { out: [WOOL, 1], inp: [[TALL_GRASS, 4]] },
  { out: [FURNACE, 1], inp: [[COBBLE, 8]] },
  { out: [NETHER_BRICK, 4], inp: [[NETHERRACK, 4]] },
  { out: [OBSIDIAN, 1], inp: [[WATER, 1], [MAGMA, 1]] },
];
