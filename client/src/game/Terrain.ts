import { BlockType } from "./BlockTypes";
import { WORLD_HEIGHT } from "./Constants";
import { getHeight } from "./Noise";

export function generateChunk(chunkX:number,chunkZ:number){

    const blocks:number[][][]=[];

    for(let x=0;x<16;x++){

        blocks[x]=[];

        for(let y=0;y<WORLD_HEIGHT;y++){

            blocks[x][y]=[];

            for(let z=0;z<16;z++){

                const wx = chunkX*16+x;

                const wz = chunkZ*16+z;

                const h = getHeight(wx,wz);

                if(y>h){

                    blocks[x][y][z]=BlockType.Air;

                }else if(y===h){

                    blocks[x][y][z]=BlockType.Grass;

                }else if(y>h-3){

                    blocks[x][y][z]=BlockType.Dirt;

                }else{

                    blocks[x][y][z]=BlockType.Stone;

                }

            }

        }

    }

    return blocks;

}
