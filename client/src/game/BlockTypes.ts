export enum BlockType {
    Air = 0,
    Grass = 1,
    Dirt = 2,
    Stone = 3,
    Wood = 4,
    Leaves = 5,
    Sand = 6,
    Water = 7
}

export const BlockColors: Record<number,string> = {

    [BlockType.Air]:"#000000",

    [BlockType.Grass]:"#48b548",

    [BlockType.Dirt]:"#8b5a2b",

    [BlockType.Stone]:"#808080",

    [BlockType.Wood]:"#8c6239",

    [BlockType.Leaves]:"#2e8b57",

    [BlockType.Sand]:"#e6d690",

    [BlockType.Water]:"#3399ff"

}
