export function getHeight(x: number, z: number, seed = 0): number {
  const sx = x + seed * 0.1
  const sz = z + seed * 0.17

  const value =
    Math.sin(sx * 0.06) * 4 +
    Math.cos(sz * 0.06) * 4 +
    Math.sin((sx + sz) * 0.03) * 5 +
    Math.sin(sx * 0.012) * Math.cos(sz * 0.018) * 3

  return Math.floor(value + 16)
}

export function getBiome(x: number, z: number, seed = 0): 'plains' | 'hills' | 'desert' {
  const n = Math.sin((x + seed) * 0.008) + Math.cos((z + seed * 1.3) * 0.008)
  if (n > 0.7) return 'hills'
  if (n < -0.5) return 'desert'
  return 'plains'
}
