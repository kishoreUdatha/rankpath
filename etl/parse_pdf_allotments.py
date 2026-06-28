"""Parse NEET UG allotment PDFs (MCC AIQ + state PDFs that follow tabular layout).

Strategy
--------
* Use pdfplumber to extract tables page by page.
* Detect header row by looking for a row containing recognisable column names
  ("Rank", "Allotted", "Category", "Institute", "Course", "Quota", ...).
* Map each row to the canonical Allotment shape.
* Mask any candidate name column (we never store PII).
* Tag every row with provenance: source_file + last_updated + (filename-derived) year/round.

Filename convention (best effort):
    {authority}_{quota}_{round}_{year}.pdf
    e.g. mcc_aiq_r1_2024.pdf, kea_state_r2_2023.pdf
"""
from __future__ import annotations

import hashlib
import multiprocessing as mp
import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

import click
import pandas as pd
import pdfplumber

from etl.normalize_categories import normalize_category, normalize_quota

NAME_LIKE_COLS = {"candidate", "candidate name", "name", "name of candidate"}
RANK_COLS = {"rank", "neet rank", "all india rank", "air", "neet ug rank"}
# Note MCC's "Alloted Category" typo — keep both spellings
CATEGORY_COLS = {"category", "allotted category", "alloted category", "cat", "seat category", "allotted\ncategory", "alloted\ncategory"}
INSTITUTE_COLS = {"institute", "allotted institute", "institute name", "college", "allotted\ninstitute"}
COURSE_COLS = {"course", "allotted course", "programme", "course allotted"}
QUOTA_COLS = {"quota", "allotted quota", "allotted\nquota"}
CAND_CAT_COLS = {"candidate category", "cand category", "candidate\ncategory"}
GENDER_COLS = {"gender", "sex"}
PWD_COLS = {"pwd", "ph", "divyangjan"}
IGNORE_COLS = {"sno", "s.no", "sl no", "sl.no", "serial no", "remarks", "status"}

HEADER_MARKERS = RANK_COLS | INSTITUTE_COLS | COURSE_COLS | CATEGORY_COLS | QUOTA_COLS


@dataclass
class AllotmentRow:
    year: Optional[int]
    round: Optional[str]
    authority: Optional[str]
    institute_name: Optional[str]
    course: Optional[str]
    quota: Optional[str]
    seat_category: Optional[str]
    candidate_category: Optional[str]
    candidate_rank: Optional[int]
    gender: Optional[str]
    pwd: Optional[bool]
    source_file: str
    last_updated: str
    raw_row_hash: str


# ---------- filename helpers ----------

_FILENAME_RX = re.compile(
    r"(?P<authority>[a-z]+(?:-[a-z]+)?)_"
    r"(?P<quota>aiq|state|deemed|nri|mgmt|management|esic|cic)?_?"
    r"r?(?P<round>\d+|mopup|stray)_?"
    r"(?P<year>20\d{2})",
    re.IGNORECASE,
)


def parse_filename(name: str) -> dict:
    m = _FILENAME_RX.search(name.lower().replace(".pdf", ""))
    if not m:
        return {}
    g = m.groupdict()
    return {
        "authority": (g.get("authority") or "").upper() or None,
        "round": ("R" + g["round"].upper()) if g.get("round") else None,
        "year": int(g["year"]) if g.get("year") else None,
    }


# ---------- table helpers ----------

def _header_index(table: list[list[Optional[str]]]) -> Optional[int]:
    for idx, row in enumerate(table[:5]):  # header almost always in first 5 rows
        cells = [(c or "").strip().lower() for c in row]
        hits = sum(1 for c in cells if c in HEADER_MARKERS)
        if hits >= 2:
            return idx
    return None


def _column_role(header_cell: str) -> Optional[str]:
    h = (header_cell or "").strip().lower()
    # Collapse multi-line headers like "Alloted\nCategory" → "alloted category"
    h_flat = re.sub(r"\s+", " ", h)
    for cell in (h, h_flat):
        if cell in RANK_COLS: return "rank"
        if cell in INSTITUTE_COLS: return "institute"
        if cell in COURSE_COLS: return "course"
        if cell in CATEGORY_COLS: return "seat_category"
        if cell in QUOTA_COLS: return "quota"
        if cell in CAND_CAT_COLS: return "candidate_category"
        if cell in GENDER_COLS: return "gender"
        if cell in PWD_COLS: return "pwd"
        if cell in NAME_LIKE_COLS: return "_drop_name"
        if cell in IGNORE_COLS: return "_ignore"
    return None


def _to_int(s: Optional[str]) -> Optional[int]:
    if s is None:
        return None
    digits = re.sub(r"[^\d]", "", str(s))
    return int(digits) if digits else None


def _row_to_allotment(
    row: list[Optional[str]],
    roles: list[Optional[str]],
    meta: dict,
    file_meta: dict,
) -> Optional[AllotmentRow]:
    record: dict = {}
    for value, role in zip(row, roles):
        if role is None or role in ("_drop_name", "_ignore"):
            continue
        if isinstance(value, str):
            # Collapse newlines inside a single cell so "Open\nPwD" → "Open PwD"
            record[role] = re.sub(r"\s+", " ", value).strip()
        else:
            record[role] = value

    if not record.get("institute") or not record.get("rank"):
        return None
    # Skip rows that are actually the header row repeated mid-table
    if str(record.get("rank", "")).lower() == "rank":
        return None

    raw = "|".join(str(v) for v in row)
    return AllotmentRow(
        year=file_meta.get("year"),
        round=file_meta.get("round"),
        authority=file_meta.get("authority"),
        institute_name=record.get("institute"),
        course=record.get("course"),
        quota=record.get("quota") or meta.get("default_quota"),
        seat_category=record.get("seat_category"),
        candidate_category=record.get("candidate_category"),
        candidate_rank=_to_int(record.get("rank")),
        gender=record.get("gender"),
        pwd=(str(record.get("pwd", "")).strip().lower() in {"y", "yes", "true", "1", "pwd"}) or None,
        source_file=meta["source_file"],
        last_updated=meta["last_updated"],
        raw_row_hash=hashlib.sha1(raw.encode("utf-8")).hexdigest(),
    )


# ---------- public API ----------

def parse_pdf(path: Path, default_quota: Optional[str] = None, max_pages: Optional[int] = None) -> list[AllotmentRow]:
    """Parse one PDF and return a list of normalized AllotmentRow dataclasses."""
    file_meta = parse_filename(path.name)
    # MCC 2024 Round 1 filename ("final_result_of_round_1_neet_ug_2024.pdf") yields
    # round=R1, year=2024 — verify:
    if not file_meta.get("year"):
        m = re.search(r"(20\d{2})", path.name)
        if m: file_meta["year"] = int(m.group(1))
    if not file_meta.get("round"):
        m = re.search(r"round[\s_-]*(\d+|mop[- ]?up|stray|special)", path.name, re.I)
        if m: file_meta["round"] = "R" + m.group(1).upper().replace(" ", "").replace("-", "")
    meta = {
        "source_file": path.name,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "default_quota": default_quota,
    }
    out: list[AllotmentRow] = []
    # MCC PDFs put the header on the first data page; subsequent pages roll over
    # headerless. Remember roles and reuse when the column count matches.
    last_roles: Optional[list[Optional[str]]] = None
    with pdfplumber.open(str(path)) as pdf:
        pages_to_scan = pdf.pages if max_pages is None else pdf.pages[:max_pages]
        for page in pages_to_scan:
            tables = page.extract_tables() or []
            for table in tables:
                if not table:
                    continue
                h_idx = _header_index(table)
                if h_idx is not None:
                    roles = [_column_role(c or "") for c in table[h_idx]]
                    last_roles = roles
                    data_rows = table[h_idx + 1 :]
                elif last_roles is not None and table[0] and len(table[0]) == len(last_roles):
                    # Headerless continuation — reuse last roles
                    roles = last_roles
                    data_rows = table
                else:
                    continue
                for row in data_rows:
                    rec = _row_to_allotment(row, roles, meta, file_meta)
                    if rec is not None:
                        out.append(rec)
    return out


def to_dataframe(rows: Iterable[AllotmentRow]) -> pd.DataFrame:
    df = pd.DataFrame([asdict(r) for r in rows])
    if df.empty:
        return df
    df["normalized_category"] = df["seat_category"].map(normalize_category)
    df["normalized_quota"] = df["quota"].map(normalize_quota)
    return df


# ---------- Worker (top-level so multiprocessing can pickle it) ----------

def _parse_one_to_partial(args: tuple) -> tuple[str, int, Optional[str]]:
    """Worker: parse one PDF, write its rows to a per-PDF parquet, return (name, rows, path)."""
    path_str, default_quota, max_pages, partial_dir = args
    path = Path(path_str)
    rows = parse_pdf(path, default_quota=default_quota, max_pages=max_pages)
    if not rows:
        return path.name, 0, None
    df = to_dataframe(rows)
    out = Path(partial_dir) / f"{path.stem}.parquet"
    df.to_parquet(out, index=False)
    return path.name, len(df), str(out)


# ---------- CLI ----------

@click.command()
@click.argument("files", nargs=-1, type=click.Path(exists=True, dir_okay=False))
@click.option("--out", type=click.Path(), default="data/normalized/allotments.parquet")
@click.option("--default-quota", default=None, help="Fallback quota tag (e.g. AIQ) when PDF lacks the column.")
@click.option("--max-pages", type=int, default=None, help="Stop after N pages per PDF (smoke testing).")
@click.option("--workers", type=int, default=1, help="Parallel workers (>=2 enables multiprocessing + per-PDF parquet).")
@click.option("--partial-dir", type=click.Path(), default="data/normalized/_partial", help="Where per-PDF parquets are written.")
def main(files: tuple[str, ...], out: str, default_quota: Optional[str], max_pages: Optional[int], workers: int, partial_dir: str) -> None:
    if not files:
        click.echo("No PDFs given.", err=True)
        return

    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdir = Path(partial_dir)
    pdir.mkdir(parents=True, exist_ok=True)

    tasks = [(f, default_quota, max_pages, str(pdir)) for f in files]
    results: list[tuple[str, int, Optional[str]]] = []

    if workers <= 1:
        for t in tasks:
            results.append(_parse_one_to_partial(t))
            name, n, _ = results[-1]
            click.echo(f"{name}: parsed {n} rows", nl=True)
    else:
        with mp.Pool(processes=workers) as pool:
            for name, n, ppath in pool.imap_unordered(_parse_one_to_partial, tasks):
                results.append((name, n, ppath))
                click.echo(f"{name}: parsed {n} rows", nl=True)

    # Concatenate all per-PDF parquets
    partials = [r[2] for r in results if r[2]]
    if not partials:
        click.echo("No rows produced from any PDF.", err=True)
        return
    frames = [pd.read_parquet(p) for p in partials]
    df = pd.concat(frames, ignore_index=True)
    df.to_parquet(out_path, index=False)
    total = sum(r[1] for r in results)
    click.echo(f"Wrote {len(df)} rows from {len(partials)} PDFs -> {out_path}  (total parsed: {total})")


if __name__ == "__main__":
    main()
