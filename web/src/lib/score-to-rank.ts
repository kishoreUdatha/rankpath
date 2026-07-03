/**
 * NEET-UG marks -> approximate All India Rank (AIR).
 *
 * Anchors follow published NEET rank-vs-marks distributions for a typical year.
 * Year-to-year difficulty (and grace-mark years like 2024) shift the curve, so the
 * result is an ESTIMATE — surface it to students as "approximate AIR", never exact.
 * Rank grows roughly exponentially as marks fall, so we interpolate in log(AIR).
 *
 * Marks are out of 720 (NEET-UG total). Anchors are sorted by descending marks.
 */
const ANCHORS: Array<[marks: number, air: number]> = [
  [720, 1], [716, 20], [710, 130], [700, 240], [690, 500], [680, 850],
  [670, 1500], [660, 2500], [650, 4000], [640, 6200], [630, 9000],
  [620, 12500], [610, 16800], [600, 21500], [590, 27500], [580, 34000],
  [570, 41500], [560, 50000], [550, 59500], [540, 70000], [530, 81500],
  [520, 94000], [510, 107500], [500, 122000], [490, 137500], [480, 154000],
  [470, 171500], [460, 190000], [450, 210000], [440, 231000], [430, 253000],
  [420, 276000], [410, 300000], [400, 325000], [375, 392000], [350, 465000],
  [325, 545000], [300, 630000], [275, 720000], [250, 815000], [200, 1020000],
  [150, 1230000], [100, 1400000], [50, 1600000], [0, 1800000],
];

export const NEET_MAX_MARKS = 720;

/** Estimated AIR for a given NEET score (0..720). Returns 0 for invalid input. */
export function estimateRankFromScore(marks: number): number {
  if (!Number.isFinite(marks)) return 0;
  const m = Math.max(0, Math.min(NEET_MAX_MARKS, Math.round(marks)));
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [m1, a1] = ANCHORS[i];
    const [m2, a2] = ANCHORS[i + 1];
    if (m <= m1 && m >= m2) {
      const t = (m1 - m) / (m1 - m2); // 0 at m1 → 1 at m2
      const logA = Math.log(a1) + t * (Math.log(a2) - Math.log(a1));
      return Math.max(1, Math.round(Math.exp(logA)));
    }
  }
  return ANCHORS[ANCHORS.length - 1][1];
}
