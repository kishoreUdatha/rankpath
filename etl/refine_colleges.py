"""Post-load cleanup for College rows.

Problem: MCC PDFs put the institute name and full postal address on adjacent
lines, and pdfplumber concatenates them. So we end up with College rows like:
    "AIIMS, New Delhi,AIIMS ANSARI NAGAR EAST AUROBINDO MARG NEW DELHI
     110029, Delhi (NCT), 110029"

This script:
  1. Reads every College.
  2. Parses {cleanName, city, stateCode, pin, collegeType} from the raw blob.
  3. Updates the row in place — linking to State.id if known.
  4. Infers collegeType from name keywords (AIIMS, JIPMER, ESIC, Govt, Deemed, ...).

Idempotent — safe to re-run.

Usage:
  DATABASE_URL=... python -m etl.refine_colleges
"""
from __future__ import annotations

import os
import re
from typing import Optional

import click
from sqlalchemy import MetaData, Table, Column, String, Boolean, DateTime, create_engine, select, update
from sqlalchemy.engine import Engine

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://rankpath:rankpath@localhost:5433/rankpath",
)

# Canonical Indian state names → code. Includes common variants.
STATES: dict[str, str] = {
    "andhra pradesh": "AP", "arunachal pradesh": "AR", "assam": "AS", "bihar": "BR",
    "chhattisgarh": "CG", "goa": "GA", "gujarat": "GJ", "haryana": "HR",
    "himachal pradesh": "HP", "jharkhand": "JH", "karnataka": "KA", "kerala": "KL",
    "madhya pradesh": "MP", "maharashtra": "MH", "manipur": "MN", "meghalaya": "ML",
    "mizoram": "MZ", "nagaland": "NL", "odisha": "OD", "orissa": "OD", "punjab": "PB",
    "rajasthan": "RJ", "sikkim": "SK", "tamil nadu": "TN", "telangana": "TG",
    "tripura": "TR", "uttar pradesh": "UP", "uttarakhand": "UK", "west bengal": "WB",
    # UTs
    "andaman and nicobar islands": "AN", "chandigarh": "CH",
    "dadra and nagar haveli": "DN", "daman and diu": "DD",
    "delhi (nct)": "DL", "delhi": "DL", "nct of delhi": "DL", "new delhi": "DL",
    "jammu and kashmir": "JK", "j&k": "JK",
    "ladakh": "LA", "lakshadweep": "LD", "puducherry": "PY", "u.t. of puducherry": "PY",
}
STATE_RX = re.compile(r"\b(" + "|".join(re.escape(s) for s in sorted(STATES, key=len, reverse=True)) + r")\b", re.I)
PIN_RX = re.compile(r"\b(\d{6})\b")

# Type inference rules — order matters (more specific first)
TYPE_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bAIIMS\b", re.I),                               "AIIMS"),
    (re.compile(r"all india institute of medical sciences", re.I),"AIIMS"),
    (re.compile(r"\bJIPMER\b", re.I),                              "JIPMER"),
    (re.compile(r"\bAFMC\b", re.I),                                "CENTRAL"),
    (re.compile(r"armed forces medical college", re.I),            "CENTRAL"),
    (re.compile(r"\bESI[C]?\b|employees state insurance", re.I),   "ESIC"),
    (re.compile(r"\bBHU\b|banaras hindu", re.I),                   "CENTRAL"),
    (re.compile(r"\bAMU\b|aligarh muslim", re.I),                  "CENTRAL"),
    (re.compile(r"jamia\s+millia|jamia\s+hamdard", re.I),          "CENTRAL"),
    (re.compile(r"\bdeemed\b|kasturba medical college, manipal|sri ramachandra|saveetha|vels|vinayaka mission", re.I), "DEEMED"),
    (re.compile(r"\bgovt\b|government|state medical|maulana azad|grant medical|king george|christian medical", re.I), "GOVT"),
]


def parse_institute(raw: str) -> dict[str, Optional[str]]:
    """Extract clean name, city, state code, PIN from the institute blob.

    Heuristic:
      1. Find PIN (6 digits at end).
      2. Find state via STATE_RX.
      3. Clean name = portion before either "<full address marker>" or the state.
      4. City = either the comma-segment immediately before the state, or the
         second comma-segment of the name (e.g. "AIIMS, New Delhi" → "New Delhi").
    """
    raw = (raw or "").strip()
    if not raw:
        return {"name": raw, "city": None, "state": None, "pin": None, "type": "UNKNOWN"}

    # Strip trailing pin
    pin_m = PIN_RX.search(raw)
    pin = pin_m.group(1) if pin_m else None

    # Find state
    state_m = STATE_RX.search(raw)
    state_code = STATES[state_m.group(1).lower()] if state_m else None

    # Cut at state (everything before the state name is name+address)
    if state_m:
        name_blob = raw[: state_m.start()].rstrip(", ").rstrip()
    else:
        name_blob = raw

    # Heuristic split: name = first 1-2 comma segments (usually "{NAME}, {CITY}").
    # Drop any segment that looks like a street address (digits + street word).
    parts = [p.strip() for p in name_blob.split(",") if p.strip()]
    is_address_part = re.compile(
        r"^\d|p\.?\s?o\.?|pin\s?-?|road|street|nagar|marg|sector|avenue|colony|district|near\b|opp\.?|behind|tal\.?|dist\.?",
        re.I,
    )
    clean_parts: list[str] = []
    for p in parts:
        if is_address_part.search(p):
            break
        clean_parts.append(p)
    clean_name = ", ".join(clean_parts) if clean_parts else (parts[0] if parts else raw)

    # City = last segment of clean_name if it has ≥ 2 segments
    city = clean_parts[-1] if len(clean_parts) >= 2 else None

    # Type inference
    ctype = "UNKNOWN"
    for rx, t in TYPE_RULES:
        if rx.search(clean_name) or rx.search(raw[:200]):
            ctype = t
            break
    # If it's clearly a state govt college (city/state present + has "MEDICAL COLLEGE"), default to GOVT
    if ctype == "UNKNOWN" and re.search(r"medical college", clean_name, re.I):
        ctype = "GOVT"

    return {"name": clean_name, "city": city, "state": state_code, "pin": pin, "type": ctype}


# ---------- SQLAlchemy table refs (subset of Prisma schema) ----------

metadata = MetaData()
college_t = Table(
    "College", metadata,
    Column("id", String, primary_key=True),
    Column("name", String, nullable=False),
    Column("code", String),
    Column("type", String),
    Column("city", String),
    Column("stateId", String),
    Column("isDeemed", Boolean),
    Column("isCentral", Boolean),
    Column("updatedAt", DateTime),
)
state_t = Table(
    "State", metadata,
    Column("id", String, primary_key=True),
    Column("code", String),
    Column("name", String),
)


@click.command()
@click.option("--dry-run", is_flag=True, default=False)
def main(dry_run: bool) -> None:
    engine: Engine = create_engine(DATABASE_URL, future=True)
    with engine.begin() as cx:
        state_id_by_code: dict[str, str] = {
            row.code: row.id for row in cx.execute(select(state_t.c.id, state_t.c.code)).all()
        }

        rows = cx.execute(select(college_t.c.id, college_t.c.name)).all()
        click.echo(f"colleges before refine: {len(rows)}")

        # Step 1: parse every row
        parsed_by_id: dict[str, dict] = {}
        for row in rows:
            p = parse_institute(row.name)
            p["state_id"] = state_id_by_code.get(p["state"]) if p["state"] else None
            parsed_by_id[row.id] = p

        # Step 2: group by canonical key (clean_name lower, state_code)
        # Pick the lexicographically smallest id as canonical so the choice is stable.
        groups: dict[tuple[str, Optional[str]], list[str]] = {}
        for cid, p in parsed_by_id.items():
            key = (p["name"].lower().strip(), p["state"])
            groups.setdefault(key, []).append(cid)
        canonical_id: dict[str, str] = {}      # old_id -> canonical_id
        canonical_ids: set[str] = set()
        for key, ids in groups.items():
            ids_sorted = sorted(ids)
            canon = ids_sorted[0]
            canonical_ids.add(canon)
            for cid in ids:
                canonical_id[cid] = canon

        merges = sum(1 for cid in canonical_id if canonical_id[cid] != cid)
        type_counts: dict[str, int] = {}
        for cid in canonical_ids:
            t = parsed_by_id[cid]["type"]
            type_counts[t] = type_counts.get(t, 0) + 1
        click.echo(f"after dedupe: {len(canonical_ids)} canonical (will merge {merges} duplicates)")
        click.echo("type distribution:")
        for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
            click.echo(f"  {t:10s} {c}")

        if dry_run:
            return

        # Step 3: re-point Allotment.collegeId to canonical (use raw SQL for speed)
        merge_pairs = [(old, new) for old, new in canonical_id.items() if old != new]
        click.echo(f"re-pointing {len(merge_pairs)} non-canonical Allotment groups ...")
        from sqlalchemy import text as sql_text
        for old, new in merge_pairs:
            cx.execute(sql_text('UPDATE "Allotment" SET "collegeId" = :n WHERE "collegeId" = :o'),
                       {"n": new, "o": old})

        # Step 4: drop ALL CutoffSummary rows; the predictor reads from this table and
        # we need it consistent with the merged colleges. We'll rebuild below.
        click.echo("rebuilding CutoffSummary ...")
        cx.execute(sql_text('DELETE FROM "CutoffSummary"'))

        # Step 5: update the canonical College rows in place
        click.echo("updating canonical College rows ...")
        for cid in canonical_ids:
            p = parsed_by_id[cid]
            cx.execute(
                update(college_t).where(college_t.c.id == cid).values(
                    name=p["name"], city=p["city"], type=p["type"], stateId=p["state_id"],
                    isCentral=(p["type"] in ("AIIMS", "JIPMER", "CENTRAL", "ESIC")),
                    isDeemed=(p["type"] == "DEEMED"),
                )
            )

        # Step 6: delete non-canonical College rows
        click.echo("deleting merged duplicates ...")
        to_delete = [old for old in canonical_id if canonical_id[old] != old]
        # delete in batches to avoid huge IN clause
        for i in range(0, len(to_delete), 200):
            batch = to_delete[i:i+200]
            cx.execute(sql_text('DELETE FROM "College" WHERE id = ANY(:ids)'), {"ids": batch})

        # Step 7: rebuild CutoffSummary from real Allotment rows
        cx.execute(sql_text("""
            INSERT INTO "CutoffSummary" (id, year, round, "collegeId", "courseId", category, quota,
                                          "openingRank", "closingRank", "allotmentCount", "sourceFiles")
            SELECT
              gen_random_uuid()::text,
              a.year, a.round, a."collegeId", a."courseId",
              a."normalizedCategory", a."normalizedQuota",
              MIN(a."candidateRank"), MAX(a."candidateRank"),
              COUNT(*), ARRAY_AGG(DISTINCT a."sourceFile")
            FROM "Allotment" a
            WHERE a."collegeId" IS NOT NULL
              AND a."courseId"  IS NOT NULL
              AND a."normalizedCategory" IS NOT NULL
              AND a."normalizedQuota"    IS NOT NULL
            GROUP BY a.year, a.round, a."collegeId", a."courseId", a."normalizedCategory", a."normalizedQuota"
        """))
        click.echo("done.")


if __name__ == "__main__":
    main()
