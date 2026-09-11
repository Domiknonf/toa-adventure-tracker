import { MOON_PHASES, MOON_DISC, MOON_DEFAULTS } from "./const.mjs";
import { setting } from "./settings.mjs";

/**
 * THE MOON.
 *
 * Derived from the travel day and nothing else - no world time, no calendar
 * module, no stored phase. That is the point: the day counter is the only thing
 * anybody advances, so the moon can never drift out of step with it, and setting
 * the day to 47 shows the moon of day 47 without a resync.
 *
 * The default cycle runs full moon on day 1, thinning to new moon on day 15 and
 * filling again through day 30. Both the length and the anchor day are settings.
 */

/* ------------------------------------------------------------------ */
/*  Phase                                                              */
/* ------------------------------------------------------------------ */

/**
 * Where in the cycle a day sits, as a fraction in [0, 1).
 *
 * 0 is full moon, 0.5 is new moon. The modulo is written the long way because
 * JavaScript's `%` keeps the sign of the dividend: a fullMoonDay set later than
 * the current day gives a negative remainder, and a negative position lands
 * outside every band in MOON_PHASES. Adding one cycle before the second modulo
 * is what keeps day 1 with fullMoonDay 20 an honest 0.633 rather than -0.633.
 */
export function positionOf(day, { cycleLength, fullMoonDay } = moonConfig()) {
  const age = (((day - fullMoonDay) % cycleLength) + cycleLength) % cycleLength;
  return age / cycleLength;
}

/** The configured cycle, clamped so a hand-edited setting cannot divide by zero. */
export function moonConfig() {
  const cycleLength = Math.max(2, Math.floor(Number(setting("cycleLength"))) || MOON_DEFAULTS.cycleLength);
  const fullMoonDay = Math.floor(Number(setting("fullMoonDay"))) || MOON_DEFAULTS.fullMoonDay;
  return { cycleLength, fullMoonDay };
}

/**
 * Everything the window shows about the moon on a given day.
 *
 * `illumination` is the lit FRACTION of the visible disc, which for a sphere lit
 * from one side is (1 + cos θ) / 2 with θ the phase angle. That is a cosine and
 * not a triangle wave on purpose: the real thing spends longer looking nearly
 * full and nearly new than it does near the quarters, and the same formula drives
 * the drawing below, so the number and the picture can never disagree.
 *
 * `waxing` is the second half of the cycle - past new moon, filling again. The
 * exact full and new moons are neither, and say so with `waxing: null`, which is
 * what keeps the window from labelling a full moon "zunehmend".
 */
export function moonFor(day) {
  const config = moonConfig();
  const position = positionOf(day, config);
  const angle = 2 * Math.PI * position;
  const cos = Math.cos(angle);
  const illumination = (1 + cos) / 2;

  const phase = MOON_PHASES.find(p => position >= p.from && position < p.to)
    // Only reachable if MOON_PHASES were edited to leave a gap; full moon is the
    // honest fallback since the table both starts and ends on it.
    ?? MOON_PHASES[0];

  const exact = phase.key === "full" || phase.key === "new";

  return {
    day,
    position,
    phase: phase.key,
    illumination,
    percent: Math.round(illumination * 100),
    // Before the halfway point the lit part is shrinking; after it, growing.
    waxing: exact ? null : position > 0.5,
    // Day-of-cycle, 1-based, purely for the tooltip.
    cycleDay: Math.floor(position * config.cycleLength) + 1,
    cycleLength: config.cycleLength,
    ...discPath(position)
  };
}

/* ------------------------------------------------------------------ */
/*  Drawing                                                            */
/* ------------------------------------------------------------------ */

/**
 * The SVG path of the LIT part of the disc.
 *
 * Computed, not a sprite sheet: a configurable cycle length means there is no
 * fixed set of eight or twenty-eight pictures to ship, and an ellipse is both
 * exact at every position and a dozen bytes.
 *
 * The shape is bounded by two arcs meeting at the poles:
 *
 *   1. THE LIMB - half of the disc's own circle, on the lit side.
 *   2. THE TERMINATOR - the day/night line. On a sphere it is a circle seen
 *      edge-on, so it projects to a half-ELLIPSE sharing the disc's vertical
 *      radius and having horizontal radius |cos θ| · r. At the quarters cos θ is
 *      0 and the ellipse degenerates to a straight line, which is exactly right
 *      and which SVG already draws correctly for rx = 0.
 *
 * Which way each arc bulges is the whole subtlety, and it is two sweep flags:
 *
 *   - The limb is on the right while waxing, on the left while waning
 *     (northern-hemisphere convention).
 *   - The terminator bulges AWAY from the lit side when more than half is lit
 *     (gibbous) and TOWARD it when less is (crescent), which is the sign of
 *     cos θ. Hence `termSweep`: same direction as the limb when gibbous,
 *     opposite when crescent.
 *
 * Returns the path plus the numbers the template needs for the disc itself.
 */
export function discPath(position) {
  const { size, radius } = MOON_DISC;
  const centre = size / 2;
  const cos = Math.cos(2 * Math.PI * position);

  const top = `${centre},${centre - radius}`;
  const bottom = `${centre},${centre + radius}`;

  // Full and new moon are drawn as special cases rather than trusted to the
  // general path. At cos = ±1 the two arcs coincide, and a zero-area or
  // fully-overlapping path is exactly where renderers disagree.
  const EPSILON = 1e-6;
  if (cos >= 1 - EPSILON) return { path: fullDisc(centre, radius), lit: 1 };
  if (cos <= -1 + EPSILON) return { path: "", lit: 0 };

  const waxing = position > 0.5;
  const limbSweep = waxing ? 1 : 0;
  // Gibbous keeps the limb's direction, crescent reverses it. Written as an
  // equality so the four cases are one line rather than a nested ternary.
  const termSweep = ((cos >= 0) === waxing) ? 1 : 0;
  const rx = Math.abs(cos) * radius;

  return {
    path: [
      `M ${top}`,
      `A ${radius},${radius} 0 0 ${limbSweep} ${bottom}`,
      `A ${rx.toFixed(3)},${radius} 0 0 ${termSweep} ${top}`,
      "Z"
    ].join(" "),
    lit: (1 + cos) / 2
  };
}

/**
 * A whole circle as a path. Two half-arcs rather than a <circle>, so the template
 * has ONE element to fill and never has to switch tag by phase.
 */
function fullDisc(centre, radius) {
  const top = `${centre},${centre - radius}`;
  const bottom = `${centre},${centre + radius}`;
  return `M ${top} A ${radius},${radius} 0 0 1 ${bottom} A ${radius},${radius} 0 0 1 ${top} Z`;
}

/** Geometry the template needs for the dark disc underneath. */
export const disc = () => ({ size: MOON_DISC.size, radius: MOON_DISC.radius, centre: MOON_DISC.size / 2 });
