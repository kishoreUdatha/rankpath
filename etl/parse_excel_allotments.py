"""Parse NEET UG allotment Excel files (state portals often publish XLS/XLSX).

Strategy: read every sheet, detect a header row containing rank/institute/category
columns, then map to the same canonical schema as parse_pdf_allotments.

CLI:
    python -m etl.parse_excel_allotments data/raw/states/**/*.xlsx
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import click
import pandas as pd

from etl.normalize_categories import normalize_category, normalize_quota
from etl.parse_pdf_allotments import (
    HEADER_MARKERS,
    parse_filename,
    _column_role,
    _to_int,
    NAME_LIKE_COLS,
)


def _find_header_row(df: pd.DataFrame) -> Optional[int]:
    for i in range(min(10, len(df))):
        cells = [str(c).strip().lower() for c in df.iloc[i].tolist()]
        if sum(1 for c in cells if c in HEADER_MARKERS) >= 2:
            return i
    return None


def parse_excel(path: Path, default_quota: Optional[str] = None) -> pd.DataFrame:
    file_meta = parse_filename(path.name)
    now = datetime.now(timezone.utc).isoformat()
    sheets = pd.read_excel(path, sheet_name=None, header=None, dtype=str)
    frames: list[pd.DataFrame] = []
    for sheet_name, raw in sheets.items():
        if raw.empty:
            continue
        h_idx = _find_header_row(raw)
        if h_idx is None:
            continue
        header = [str(c).strip() for c in raw.iloc[h_idx].tolist()]
        body = raw.iloc[h_idx + 1 :].reset_index(drop=True)
        body.columns = header
        # Drop name-like columns to honor "no PII" rule
        body = body.drop(columns=[c for c in body.columns if str(c).strip().lower() in NAME_LIKE_COLS], errors="ignore")
        # Map columns by role
        roles = {col: _column_role(col) for col in body.columns}
        out = pd.DataFrame()
        for col, role in roles.items():
            if role and role != "_drop_name":
                out[role] = body[col]
        if out.empty:
            continue
        out["year"] = file_meta.get("year")
        out["round"] = file_meta.get("round")
        out["authority"] = file_meta.get("authority")
        out["quota"] = out.get("quota").fillna(default_quota) if "quota" in out.columns else default_quota
        out["source_file"] = path.name
        out["last_updated"] = now
        out["candidate_rank"] = out.get("rank").map(_to_int) if "rank" in out.columns else None
        out["raw_row_hash"] = body.astype(str).agg("|".join, axis=1).map(lambda s: hashlib.sha1(s.encode()).hexdigest())
        out["normalized_category"] = out.get("seat_category").map(normalize_category) if "seat_category" in out.columns else None
        out["normalized_quota"] = out.get("quota").map(normalize_quota) if "quota" in out.columns else None
        # Drop rows without an institute or rank
        out = out.dropna(subset=[c for c in ("institute", "candidate_rank") if c in out.columns])
        frames.append(out)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


@click.command()
@click.argument("files", nargs=-1, type=click.Path(exists=True, dir_okay=False))
@click.option("--out", type=click.Path(), default="data/normalized/allotments_excel.parquet")
@click.option("--default-quota", default=None)
def main(files: tuple[str, ...], out: str, default_quota: Optional[str]) -> None:
    if not files:
        click.echo("No files given.", err=True)
        return
    all_frames = []
    for f in files:
        path = Path(f)
        df = parse_excel(path, default_quota=default_quota)
        click.echo(f"{path.name}: parsed {len(df)} rows")
        all_frames.append(df)
    big = pd.concat(all_frames, ignore_index=True) if all_frames else pd.DataFrame()
    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    big.to_parquet(out_path, index=False)
    click.echo(f"Wrote {len(big)} rows -> {out_path}")


if __name__ == "__main__":
    main()
