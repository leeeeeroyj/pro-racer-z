/** The player's "reduce motion" setting, read live: no shake or flashes, and fewer sparks. */
export function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
