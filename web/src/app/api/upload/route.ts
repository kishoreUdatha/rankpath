/**
 * Admin upload endpoint.
 *
 * Accepts a multipart/form-data POST with one PDF/XLS/CSV file. We do NOT parse
 * here; we drop the file under data/raw/uploads/ and queue an AdminUpload row
 * with PENDING_REVIEW. The Python ETL picks it up:
 *     python -m etl.parse_pdf_allotments data/raw/uploads/<file>
 *     python -m etl.normalize_categories data/normalized/...
 *     python -m etl.validate_data data/normalized/...
 *     python -m etl.seed_database data/normalized/validated.parquet
 *
 * Authentication: simple bearer token (ADMIN_API_TOKEN). Replace with real auth
 * (Auth.js / Clerk) before deploying.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EXT = new Set([".pdf", ".xlsx", ".xls", ".csv"]);

function isAuthed(req: NextRequest): boolean {
  const tok = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.ADMIN_API_TOKEN;
  return !!expected && tok === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("file");
  const authority = (form.get("authority") as string | null) ?? null;
  const year = form.get("year") ? Number(form.get("year")) : null;
  const round = (form.get("round") as string | null) ?? null;

  if (!(file instanceof Blob) || !("name" in file)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  const name = (file as File).name;
  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: "bad_extension", allowed: [...ALLOWED_EXT] }, { status: 400 });
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "file_too_large", maxBytes: 50 * 1024 * 1024 }, { status: 413 });
  }

  const dest = path.join(process.cwd(), "..", "data", "raw", "uploads");
  await fs.mkdir(dest, { recursive: true });
  const safeName = name.replace(/[^A-Za-z0-9._-]/g, "_");
  const target = path.join(dest, `${Date.now()}_${safeName}`);
  await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));

  const row = await prisma.adminUpload.create({
    data: {
      filename: path.basename(target),
      authority, year, round,
      status: "PENDING_REVIEW",
    },
  });

  return NextResponse.json({
    ok: true,
    uploadId: row.id,
    path: target,
    nextSteps: [
      `python -m etl.parse_pdf_allotments ${target}`,
      "python -m etl.normalize_categories data/normalized/*.parquet",
      "python -m etl.validate_data data/normalized/*.parquet",
      "python -m etl.seed_database data/normalized/validated.parquet",
    ],
  });
}
