"""Data-quality rules per spec.

Checks:
  * candidate_rank must be numeric and > 0
  * year must be valid (within last 10 years)
  * normalized_category must be non-null
  * normalized_quota must be non-null
  * institute_name must be non-empty
  * source_file must be present
  * dedup colleges by name (rapidfuzz fuzzy match)

Outputs:
  * data/normalized/validated.parquet  — clean rows
  * data/normalized/rejected.csv       — rejected rows with reason

CLI:
  python -m etl.validate_data data/normalized/*.parquet
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import click
import pandas as pd
from rapidfuzz import fuzz, process


def _dedupe_institutes(names: pd.Series, threshold: int = 92) -> dict:
    canonical: list[str] = []
    mapping: dict[str, str] = {}
    for raw in sorted(set(names.dropna().astype(str))):
        match = process.extractOne(raw, canonical, scorer=fuzz.token_sort_ratio)
        if match and match[1] >= threshold:
            mapping[raw] = match[0]
        else:
            canonical.append(raw)
            mapping[raw] = raw
    return mapping


def validate(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    if df.empty:
        return df, df
    df = df.copy()
    this_year = date.today().year
    df["_reject"] = ""

    df.loc[~pd.to_numeric(df.get("candidate_rank"), errors="coerce").gt(0), "_reject"] += "bad_rank;"
    df.loc[~df["year"].between(this_year - 10, this_year + 1, inclusive="both"), "_reject"] += "bad_year;"
    df.loc[df.get("normalized_category").isna(), "_reject"] += "unknown_category;"
    df.loc[df.get("normalized_quota").isna(), "_reject"] += "unknown_quota;"
    df.loc[df.get("institute_name").fillna("").str.len() == 0, "_reject"] += "no_institute;"
    df.loc[df.get("source_file").fillna("").str.len() == 0, "_reject"] += "no_source;"

    clean = df[df["_reject"] == ""].drop(columns=["_reject"])
    rejected = df[df["_reject"] != ""].copy()

    if not clean.empty and "institute_name" in clean.columns:
        canon = _dedupe_institutes(clean["institute_name"])
        clean["institute_canonical"] = clean["institute_name"].map(canon)

    return clean, rejected


@click.command()
@click.argument("files", nargs=-1, type=click.Path(exists=True, dir_okay=False))
@click.option("--out-clean", type=click.Path(), default="data/normalized/validated.parquet")
@click.option("--out-rejected", type=click.Path(), default="data/normalized/rejected.csv")
def main(files: tuple[str, ...], out_clean: str, out_rejected: str) -> None:
    if not files:
        click.echo("No files given.", err=True)
        return
    frames = [pd.read_parquet(f) for f in files]
    df = pd.concat(frames, ignore_index=True)
    clean, rejected = validate(df)
    Path(out_clean).parent.mkdir(parents=True, exist_ok=True)
    clean.to_parquet(out_clean, index=False)
    rejected.to_csv(out_rejected, index=False)
    click.echo(f"clean={len(clean)}  rejected={len(rejected)}  -> {out_clean}, {out_rejected}")


if __name__ == "__main__":
    main()
