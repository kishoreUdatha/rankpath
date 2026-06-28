"""Normalize raw category + quota strings against the master mapping JSONs.

Usage (CLI):
    python -m etl.normalize_categories data/normalized/*.parquet

Public API:
    normalize_category(raw: str) -> str | None
    normalize_quota(raw: str) -> str | None
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

import click
import pandas as pd

MAPPINGS_DIR = Path(__file__).parent / "mappings"


def _load(name: str) -> dict:
    return json.loads((MAPPINGS_DIR / name).read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _category_rules() -> list[tuple[re.Pattern, str]]:
    data = _load("category_master.json")
    return [(re.compile(r["match"], re.IGNORECASE), r["normalized"]) for r in data["rules"]]


@lru_cache(maxsize=1)
def _quota_rules() -> list[tuple[re.Pattern, str]]:
    data = _load("quota_master.json")
    return [(re.compile(r["match"], re.IGNORECASE), r["normalized"]) for r in data["rules"]]


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def normalize_category(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    text = _clean(str(raw))
    if not text:
        return None
    for pattern, target in _category_rules():
        if pattern.search(text):
            return target
    return None  # caller should flag as unknown_category


def normalize_quota(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    text = _clean(str(raw))
    if not text:
        return None
    for pattern, target in _quota_rules():
        if pattern.search(text):
            return target
    return None


def normalize_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Add normalized_category / normalized_quota columns. Preserve raw."""
    out = df.copy()
    out["normalized_category"] = out["seat_category"].map(normalize_category) if "seat_category" in out else None
    out["normalized_quota"] = out["quota"].map(normalize_quota) if "quota" in out else None
    out["unknown_category"] = out["normalized_category"].isna() & out.get("seat_category").notna()
    out["unknown_quota"] = out["normalized_quota"].isna() & out.get("quota").notna()
    return out


@click.command()
@click.argument("files", nargs=-1, type=click.Path(exists=True, dir_okay=False))
@click.option("--inplace/--no-inplace", default=True, help="Overwrite the parquet files with normalized columns added.")
def main(files: tuple[str, ...], inplace: bool) -> None:
    if not files:
        click.echo("No files provided.", err=True)
        return
    for f in files:
        path = Path(f)
        df = pd.read_parquet(path)
        out = normalize_frame(df)
        unknown_cat = int(out["unknown_category"].sum())
        unknown_q = int(out["unknown_quota"].sum())
        click.echo(f"{path.name}: rows={len(out)} unknown_category={unknown_cat} unknown_quota={unknown_q}")
        if inplace:
            out.to_parquet(path, index=False)


if __name__ == "__main__":
    main()
