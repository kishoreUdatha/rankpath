/**
 * Admin CSV import — parses, stores and PROCESSES cutoff data straight into the DB
 * (CutoffSummary, the table the predictor reads). No manual Python step.
 *
 * Auth: session role === 'ADMIN' (same gate as the /admin section).
 * Accepts multipart/form-data with a .csv file (or JSON { csv }).
 *
 * CSV header (case-insensitive, aliases accepted):
 *   state, college, year, round, quota, category, opening, closing [, course, allotment]
 * Required per row: state, college, year, category, closing.
 * Defaults: round=R1, quota=STATE, course=MBBS.
 * Colleges are matched (never created) within the given state by normalized name;
 * unmatched rows are reported, not guessed.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

// minimal RFC-4180-ish parser (handles double-quoted fields with commas/newlines)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

const ALIASES: Record<string, string> = {
  state: "state", state_code: "state", statecode: "state",
  college: "college", institute: "college", college_name: "college", collegename: "college",
  year: "year", round: "round",
  quota: "quota", category: "category", cat: "category",
  opening: "opening", opening_rank: "opening", open: "opening", openingrank: "opening",
  closing: "closing", closing_rank: "closing", close: "closing", closingrank: "closing",
  course: "course", allotment: "allotment", allotmentcount: "allotment", seats: "allotment",
};
const CAT = new Set(["OPEN", "EWS", "OBC", "SC", "ST"]);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // read CSV text (multipart file or JSON body)
  let csv = "", filename = "import.csv";
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof Blob)) return NextResponse.json({ error: "no_file" }, { status: 400 });
    filename = ("name" in f ? (f as File).name : "import.csv");
    csv = await (f as Blob).text();
  } else {
    const body = await req.json().catch(() => ({}));
    csv = body.csv || "";
  }
  if (!csv.trim()) return NextResponse.json({ error: "empty_csv" }, { status: 400 });

  const rows = parseCSV(csv);
  if (rows.length < 2) return NextResponse.json({ error: "no_data_rows" }, { status: 400 });
  const header = rows[0].map((h) => ALIASES[h.trim().toLowerCase().replace(/\s+/g, "_")] || h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  for (const req_ of ["state", "college", "year", "category", "closing"]) {
    if (idx(req_) < 0) return NextResponse.json({ error: "missing_column", column: req_, header }, { status: 400 });
  }

  // preload states, courses
  const states = await prisma.state.findMany({ select: { id: true, code: true, name: true } });
  const stById: Record<string, { id: string }> = {};
  for (const s of states) { stById[s.code.toUpperCase()] = s; stById[norm(s.name)] = s; }
  const courses = await prisma.course.findMany({ select: { id: true, name: true } });
  const courseByName: Record<string, string> = {};
  for (const c of courses) courseByName[c.name.toUpperCase()] = c.id;

  // college lookup cache per state (normalized name -> id)
  const collegeCache: Record<string, { exact: Map<string, string>; list: { id: string; n: string }[] }> = {};
  async function collegesOf(stateId: string) {
    if (!collegeCache[stateId]) {
      const cs = await prisma.college.findMany({ where: { stateId }, select: { id: true, name: true } });
      const exact = new Map<string, string>();
      const list: { id: string; n: string }[] = [];
      for (const c of cs) { const n = norm(c.name); exact.set(n, c.id); list.push({ id: c.id, n }); }
      collegeCache[stateId] = { exact, list };
    }
    return collegeCache[stateId];
  }

  let inserted = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  const unmatched = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const g = (k: string) => (idx(k) >= 0 ? (cells[idx(k)] ?? "").trim() : "");
    const stateRaw = g("state"), collegeRaw = g("college");
    const year = parseInt(g("year"), 10);
    const round = g("round") || "R1";
    const quota = (g("quota") || "STATE").toUpperCase();
    const category = g("category").toUpperCase();
    const closing = parseInt(g("closing").replace(/[^0-9]/g, ""), 10);
    const opening = g("opening") ? parseInt(g("opening").replace(/[^0-9]/g, ""), 10) : null;
    const courseName = (g("course") || "MBBS").toUpperCase();
    const allotment = g("allotment") ? parseInt(g("allotment").replace(/[^0-9]/g, ""), 10) : 0;

    if (!stateRaw || !collegeRaw || !year || !category || !Number.isFinite(closing)) {
      errors.push(`row ${r + 1}: missing/invalid required field`); skipped++; continue;
    }
    if (!CAT.has(category)) { errors.push(`row ${r + 1}: unknown category '${category}'`); skipped++; continue; }
    const st = stById[stateRaw.toUpperCase()] || stById[norm(stateRaw)];
    if (!st) { errors.push(`row ${r + 1}: unknown state '${stateRaw}'`); skipped++; continue; }
    const courseId = courseByName[courseName];
    if (!courseId) { errors.push(`row ${r + 1}: unknown course '${courseName}'`); skipped++; continue; }

    const { exact, list } = await collegesOf(st.id);
    const cn = norm(collegeRaw);
    let collegeId = exact.get(cn);
    if (!collegeId) {
      const hit = list.find((c) => c.n.includes(cn) || cn.includes(c.n));
      if (hit) collegeId = hit.id;
    }
    if (!collegeId) { unmatched.add(`${st ? stateRaw : ""}: ${collegeRaw}`); skipped++; continue; }

    const where = { year_round_collegeId_courseId_category_quota: { year, round, collegeId, courseId, category, quota } };
    const existing = await prisma.cutoffSummary.findUnique({ where }).catch(() => null);
    const data = { year, round, collegeId, courseId, category, quota, openingRank: opening ?? closing, closingRank: closing, allotmentCount: allotment, sourceFiles: `admin:${filename}` };
    if (existing) { await prisma.cutoffSummary.update({ where, data }); updated++; }
    else { await prisma.cutoffSummary.create({ data }); inserted++; }
  }

  await prisma.adminUpload.create({
    data: {
      filename, authority: "csv-import", year: null, round: null,
      rowsParsed: rows.length - 1, rowsLoaded: inserted + updated,
      errors: [...errors, ...[...unmatched].map((u) => `unmatched college — ${u}`)].slice(0, 50).join("\n") || null,
      status: "PROCESSED", uploadedBy: session.email,
    },
  });

  return NextResponse.json({
    ok: true, filename,
    rowsParsed: rows.length - 1,
    inserted, updated, skipped,
    unmatchedColleges: [...unmatched].slice(0, 30),
    errors: errors.slice(0, 30),
  });
}
