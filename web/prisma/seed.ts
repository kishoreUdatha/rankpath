/**
 * Prisma seed — populates a small public-sample dataset so the UI is browsable
 * before any real PDFs are ingested. Mirrors the synthetic shape produced by
 * `python -m etl.seed_database --demo`.
 *
 * Run:
 *   npx prisma db seed
 */
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

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
