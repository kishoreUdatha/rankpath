"""Load validated allotment rows into Postgres via SQLAlchemy.

Tables created by Prisma migrations (see web/prisma/schema.prisma). This script
inserts into the SAME tables but is independent of the Node toolchain.

Usage:
    # 1. From validated parquet
    python -m etl.seed_database data/normalized/validated.parquet

    # 2. Demo / synthetic data for first-time UI browsing
    python -m etl.seed_database --demo
"""
from __future__ import annotations

import os
import random
from datetime import datetime, timezone
from pathlib import Path

import click
import pandas as pd
from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime, ForeignKey, Integer,
    MetaData, String, Table, Text, create_engine, insert, select, text,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Engine

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://rankpath:rankpath@localhost:5433/rankpath",
).replace("postgresql+psycopg2://", "postgresql://")

metadata = MetaData()

college_t = Table(
    "College", metadata,
    Column("id", String, primary_key=True),
    Column("name", String, nullable=False),
    Column("code", String),
    Column("state", String),
    Column("type", String),
    Column("city", String),
    Column("createdAt", DateTime, default=lambda: datetime.now(timezone.utc)),
    # Prisma's @updatedAt is NOT NULL in the DB but client-managed; set explicitly here.
    Column("updatedAt", DateTime, default=lambda: datetime.now(timezone.utc)),
)

course_t = Table(
    "Course", metadata,
    Column("id", String, primary_key=True),
    Column("name", String, nullable=False, unique=True),
)

allotment_t = Table(
    "Allotment", metadata,
    Column("id", String, primary_key=True),
    Column("year", Integer, nullable=False),
    Column("round", String, nullable=False),
    # Prisma keeps both a relation FK (authorityId) and a denormalized code.
    Column("authorityId", String),
    Column("authorityCode", String, nullable=False),
    Column("state", String),
    Column("collegeId", String, ForeignKey("College.id")),
    Column("courseId", String, ForeignKey("Course.id")),
    Column("rawInstituteName", String),
    Column("rawCourse", String),
    Column("rawSeatCategory", String),
    Column("rawCandidateCategory", String),
    Column("rawQuota", String),
    Column("normalizedCategory", String),
    Column("normalizedQuota", String),
    Column("candidateRank", Integer),
    Column("gender", String),
    Column("pwd", Boolean),
    Column("collegeType", String),
    Column("feeBand", String),
    Column("sourceUrl", String),
    Column("sourceFile", String),
    Column("lastUpdated", DateTime),
    Column("rawRowHash", String, unique=True),
    Column("createdAt", DateTime, default=lambda: datetime.now(timezone.utc)),
)


def _engine() -> Engine:
    return create_engine(DATABASE_URL, future=True)


def _ensure_tables(engine: Engine) -> None:
    """Tables come from Prisma. If they don't exist (e.g. running ETL before web init),
    create them here so the demo seed still works."""
    metadata.create_all(engine, checkfirst=True)


# ---------- Loaders ----------

def _upsert_colleges(engine: Engine, names: pd.Series) -> dict[str, str]:
    out: dict[str, str] = {}
    now = datetime.now(timezone.utc)
    with engine.begin() as cx:
        for nm in sorted(set(names.dropna())):
            cid = f"col_{abs(hash(nm)) % (10**10):010d}"
            stmt = pg_insert(college_t).values(
                id=cid, name=nm, type="UNKNOWN",
                createdAt=now, updatedAt=now,
            ).on_conflict_do_nothing(index_elements=["id"])
            cx.execute(stmt)
            out[nm] = cid
    return out


def _upsert_courses(engine: Engine, names: pd.Series) -> dict[str, str]:
    """Upsert courses; map every raw course string to a canonical id.
    Look up existing rows by name to avoid duplicate-name collisions when the
    Prisma seed already inserted MBBS/BDS with different ids."""
    out: dict[str, str] = {}
    with engine.begin() as cx:
        for nm in sorted(set(names.dropna())):
            normalized = "MBBS" if "mbbs" in str(nm).lower() else ("BDS" if "bds" in str(nm).lower() else str(nm))
            existing = cx.execute(select(course_t.c.id).where(course_t.c.name == normalized)).first()
            if existing:
                out[nm] = existing[0]
                continue
            cid = f"crs_{abs(hash(normalized)) % (10**8):08d}"
            stmt = pg_insert(course_t).values(id=cid, name=normalized).on_conflict_do_nothing(index_elements=["name"])
            cx.execute(stmt)
            out[nm] = cid
    return out


def load_validated(parquet_path: Path) -> int:
    df = pd.read_parquet(parquet_path)
    if df.empty:
        return 0
    engine = _engine()
    _ensure_tables(engine)

    institute_col = "institute_canonical" if "institute_canonical" in df.columns else "institute_name"
    college_ids = _upsert_colleges(engine, df[institute_col])
    course_ids = _upsert_courses(engine, df.get("course", pd.Series(dtype=str)))

    rows = []
    for _, r in df.iterrows():
        row = {
            "id": f"alt_{r['raw_row_hash'][:16]}",
            "year": int(r["year"]) if pd.notna(r.get("year")) else None,
            "round": r.get("round") or "R1",
            "authorityCode": r.get("authority") or "UNKNOWN",
            "state": r.get("state"),
            "collegeId": college_ids.get(r[institute_col]),
            "courseId": course_ids.get(r.get("course")) if r.get("course") else None,
            "rawInstituteName": r.get("institute_name"),
            "rawCourse": r.get("course"),
            "rawSeatCategory": r.get("seat_category"),
            "rawCandidateCategory": r.get("candidate_category"),
            "rawQuota": r.get("quota"),
            "normalizedCategory": r.get("normalized_category"),
            "normalizedQuota": r.get("normalized_quota"),
            "candidateRank": int(r["candidate_rank"]) if pd.notna(r.get("candidate_rank")) else None,
            "gender": r.get("gender") if pd.notna(r.get("gender")) else None,
            "pwd": bool(r["pwd"]) if pd.notna(r.get("pwd")) else None,
            # Enum columns: omit when missing so Prisma's DEFAULT (UNKNOWN) fires
            "collegeType": r.get("college_type") if pd.notna(r.get("college_type")) else "UNKNOWN",
            "feeBand": r.get("fee_band") if pd.notna(r.get("fee_band")) else "UNKNOWN",
            "sourceUrl": r.get("source_url"),
            "sourceFile": r.get("source_file"),
            "lastUpdated": pd.to_datetime(r.get("last_updated"), errors="coerce").to_pydatetime() if pd.notna(r.get("last_updated")) else datetime.now(timezone.utc),
            "rawRowHash": r["raw_row_hash"],
        }
        rows.append(row)
    # Bulk insert in chunks for speed (26K rows × per-row execute is slow)
    with engine.begin() as cx:
        CHUNK = 500
        for i in range(0, len(rows), CHUNK):
            chunk = rows[i:i+CHUNK]
            stmt = pg_insert(allotment_t).values(chunk).on_conflict_do_nothing(index_elements=["rawRowHash"])
            cx.execute(stmt)
    return len(rows)


# ---------- Demo data ----------

DEMO_COLLEGES = [
    ("AIIMS New Delhi",          "AIIMS",   "DL", "AIIMS"),
    ("Maulana Azad Medical College, Delhi", "DU", "DL", "GOVT"),
    ("Grant Medical College, Mumbai",       "MUHS", "MH", "GOVT"),
    ("Madras Medical College, Chennai",     "TNMGRMU", "TN", "GOVT"),
    ("Bangalore Medical College",           "RGUHS", "KA", "GOVT"),
    ("Osmania Medical College, Hyderabad",  "KNRUHS", "TG", "GOVT"),
    ("Andhra Medical College, Visakhapatnam","NTRUHS", "AP", "GOVT"),
    ("Government Medical College, Trivandrum","KUHS", "KL", "GOVT"),
    ("Kasturba Medical College, Manipal",   "MAHE",  "KA", "DEEMED"),
    ("JIPMER Puducherry",                   "JIPMER","PY", "JIPMER"),
]
DEMO_CATEGORIES = ["OPEN", "EWS", "OBC", "SC", "ST"]
DEMO_QUOTAS = ["AIQ", "STATE", "DEEMED", "MANAGEMENT", "NRI"]


def seed_demo() -> int:
    engine = _engine()
    _ensure_tables(engine)
    random.seed(42)
    rows = []
    course_id = "crs_demo_mbbs"
    with engine.begin() as cx:
        cx.execute(pg_insert(course_t).values(id=course_id, name="MBBS").on_conflict_do_nothing(index_elements=["id"]))
        for cname, code, state, ctype in DEMO_COLLEGES:
            cid = f"col_{abs(hash(cname)) % (10**10):010d}"
            cx.execute(pg_insert(college_t).values(
                id=cid, name=cname, code=code, state=state, type=ctype,
            ).on_conflict_do_nothing(index_elements=["id"]))
            for year, weight in [(2025, 1.00), (2024, 1.04), (2023, 1.10)]:
                for rnd in ("R1", "R2"):
                    for cat in DEMO_CATEGORIES:
                        for quota in DEMO_QUOTAS:
                            base = {
                                ("AIIMS", "OPEN", "AIQ"):    60,
                                ("JIPMER", "OPEN", "AIQ"):  130,
                                ("GOVT", "OPEN", "AIQ"):  2500,
                                ("GOVT", "OPEN", "STATE"):4000,
                                ("DEEMED", "OPEN", "DEEMED"): 35000,
                            }.get((ctype, cat, quota), 15000)
                            jitter = random.randint(-int(base * 0.15), int(base * 0.15))
                            rank = max(1, int(base * weight) + jitter + random.randint(50, 500))
                            row_hash = f"demo_{cid}_{year}_{rnd}_{cat}_{quota}"
                            rows.append({
                                "id": f"alt_{abs(hash(row_hash)) % (10**16):016d}",
                                "year": year, "round": rnd,
                                "authority": "MCC" if quota in {"AIQ", "DEEMED"} else "STATE",
                                "state": state,
                                "collegeId": cid, "courseId": course_id,
                                "rawInstituteName": cname, "rawCourse": "MBBS",
                                "rawSeatCategory": cat, "rawCandidateCategory": cat,
                                "rawQuota": quota,
                                "normalizedCategory": cat, "normalizedQuota": quota,
                                "candidateRank": rank,
                                "gender": None, "pwd": False,
                                "collegeType": ctype, "feeBand": "HIGH" if ctype == "DEEMED" else "LOW",
                                "sourceUrl": "demo://synthetic",
                                "sourceFile": "demo_seed",
                                "lastUpdated": datetime.now(timezone.utc),
                                "rawRowHash": row_hash,
                            })
        for row in rows:
            cx.execute(pg_insert(allotment_t).values(**row).on_conflict_do_nothing(index_elements=["rawRowHash"]))
    return len(rows)


@click.command()
@click.argument("files", nargs=-1, type=click.Path(exists=True, dir_okay=False))
@click.option("--demo/--no-demo", default=False, help="Seed synthetic demo data instead of loading parquet.")
def main(files: tuple[str, ...], demo: bool) -> None:
    if demo:
        n = seed_demo()
        click.echo(f"Seeded {n} demo allotment rows.")
        return
    if not files:
        click.echo("No files given. Pass --demo or one+ parquet path.", err=True)
        return
    total = 0
    for f in files:
        n = load_validated(Path(f))
        click.echo(f"{f}: loaded {n}")
        total += n
    click.echo(f"TOTAL loaded: {total}")


if __name__ == "__main__":
    main()
