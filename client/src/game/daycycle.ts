/**
 * Length of one full day/night cycle in milliseconds.
 *
 * 2^19 ms (about 8m44s) on purpose: Photon's server clock is a 32-bit
 * millisecond counter that wraps around, and 2^32 is an exact multiple of
 * 2^19, so the shared time of day never jumps when the counter wraps.
 */
export const DAY_MS = 524288;

/** Time of day a fresh world starts at (0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight). */
export const DAY_START = 0.3;
