/**
 * NEET-UG marks -> approximate All India Rank (AIR), keyed by exam YEAR.
 *
 * The marks↔rank curve is deterministic within a year but shifts hugely between
 * years with paper difficulty. E.g. 650 marks ≈ AIR 4,200 (2023) vs 25,500 (2024's
 * grace-mark year) vs ~72 (2025's hard paper, which topped at 686). So we keep one
 * table per year and interpolate in log(AIR) (rank grows ~exponentially as marks fall).
 *
 * Anchors are the official NTA marks-vs-rank data points (All India / overall rank),
 * compiled from Careers360 (2023/2024) and PW/NTA (2025). They are still an ESTIMATE —
 * surface as "approximate AIR", and prefer the student's real rank whenever they have it.
 *
 * Each table is [marks, air] sorted by DESCENDING marks (best rank first).
 */
type Anchor = [marks: number, air: number];

const TABLES: Record<number, Anchor[]> = {
  2023: [
    [720, 1], [710, 48], [651, 4245], [601, 20568], [551, 48400], [500, 79000],
    [451, 125742], [401, 177959], [351, 241657], [301, 320666], [251, 417675],
    [201, 540747], [151, 710276], [101, 990231], [51, 1460741], [0, 1750199],
  ],
  2024: [
    [720, 1], [716, 18], [700, 2250], [690, 4406], [665, 17800], [656, 25500],
    [638, 40116], [630, 47810], [615, 65000], [606, 70000], [592, 90400],
    [550, 144000], [500, 209000], [451, 285550], [414, 351425], [380, 420000],
    [287, 657138], [251, 774559], [142, 1200000], [0, 1650000],
  ],
  2025: [
    [686, 1], [662, 33], [625, 158], [607, 1022], [600, 1386], [582, 3200],
    [563, 7497], [543, 15000], [532, 22000], [523, 29000], [520, 31450],
    [516, 35000], [405, 199000], [342, 335000], [0, 1550000],
  ],
};

const YEARS = Object.keys(TABLES).map(Number).sort((a, b) => a - b);

export const NEET_YEARS = YEARS;                       // [2023, 2024, 2025]
export const LATEST_NEET_YEAR = YEARS[YEARS.length - 1];
export const NEET_MAX_MARKS = 720;

// Short notes for atypical years (surfaced as a UI hint so estimates aren't over-trusted).
export const NEET_YEAR_NOTES: Record<number, string> = {
  2024: "2024 had grace marks — scores ran high, so a given mark maps to a worse rank.",
  2025: "2025 was a hard paper (topper 686) — scores compressed, so marks map to better ranks.",
};

/**
 * Estimated AIR for a NEET score (0..720) in a given exam year.
 * Falls back to the latest year's table when `year` is unknown/unsupported.
 */
export function estimateRankFromScore(marks: number, year?: number): number {
  if (!Number.isFinite(marks)) return 0;
  const table = TABLES[year ?? LATEST_NEET_YEAR] ?? TABLES[LATEST_NEET_YEAR];
  const m = Math.max(0, Math.min(NEET_MAX_MARKS, Math.round(marks)));
  if (m >= table[0][0]) return table[0][1];                       // at/above topper score
  const last = table[table.length - 1];
  if (m <= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i++) {
    const [m1, a1] = table[i];
    const [m2, a2] = table[i + 1];
    if (m <= m1 && m >= m2) {
      const t = (m1 - m) / (m1 - m2);                             // 0 at m1 → 1 at m2
      const logA = Math.log(a1) + t * (Math.log(a2) - Math.log(a1));
      return Math.max(1, Math.round(Math.exp(logA)));
    }
  }
  return last[1];
}
