/** Simple deterministic height function (seeded later) */
export function getHeight(x: number, z: number, seed = 0): number {
  // Mix seed into coordinates
  const sx = x + seed * 0.1
  const sz = z + seed * 0.17

  const value =
    Math.sin(sx * 0.07) * 5 +
    Math.cos(sz * 0.07) * 5 +
    Math.sin((sx + sz) * 0.035) * 7 +
    Math.sin(sx * 0.015) * Math.cos(sz * 0.02) * 4

  return Math.floor(value + 18)
}

export function getBiome(x: number, z: number, seed = 0): 'plains' | 'hills' | 'desert' {
  const n = Math.sin((x + seed) * 0.01) + Math.cos((z + seed * 1.3) * 0.01)
  if (n > 0.6) return 'hills'
  if (n < -0.4) return 'desert'
  return 'plains'
}
