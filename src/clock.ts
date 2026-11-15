/** Longest physics step, s. The tests drive the physics at this rate, so slower frames are split into steps this size. */
export const STEP = 1 / 60;
/** A frame longer than this (a background tab coming back) only counts as this much. */
const MAX_FRAME = 0.1;

/**
 * Real elapsed time between frames, from the frame's timestamp. Phaser's own `delta` is smoothed toward its target
 * rate, so on a device that can't keep up the game would run in slow motion; races are timed, so use the wall clock.
 */
export class FrameClock {
  private last: number | null = null;

  /** Seconds since the last frame, split into steps no longer than STEP. */
  steps(time: number): number[] {
    const dt = this.last === null ? STEP : Math.min(MAX_FRAME, Math.max(0, (time - this.last) / 1000));
    this.last = time;
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    return Array.from({ length: n }, () => dt / n);
  }
}
