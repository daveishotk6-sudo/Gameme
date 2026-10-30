export function getHeight(x:number,z:number){

    const value =
        Math.sin(x*0.08) * 4 +
        Math.cos(z*0.08) * 4 +
        Math.sin((x+z)*0.03)*6;

    return Math.floor(value + 12);

}
