"""Merge duplicate College rows (same normalized name + state) into one canonical row.

Duplicates arose when the [name, stateId] unique index was dropped during the
SQLite port, so the same college was inserted once per source PDF/round.

For each group:
  - canonical = row with the most CutoffSummary rows
       tie-break: non-UNKNOWN type, then has code, then id
  - canonical adopts a known type / code from the group if it lacks one
  - every CutoffSummary on an orphan is repointed to canonical
       on unique-key collision (year,round,courseId,category,quota) the rows are
       MERGED: closingRank=max, openingRank=min, allotmentCount summed,
       sourceFiles concatenated; the orphan row is deleted
  - orphan College rows are deleted

Only CutoffSummary references College in this DB (Allotment/SeatMatrix empty).

Run:  .venv-etl/Scripts/python.exe scripts/dedupe_colleges.py [--dry]
"""
import sqlite3, re, sys, os
from collections import defaultdict

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
DRY = "--dry" in sys.argv

def norm(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def main():
    db = sqlite3.connect(DEV)
    db.execute("PRAGMA foreign_keys=OFF")
    cur = db.cursor()

    cols = cur.execute("SELECT id,name,stateId,type,code FROM College").fetchall()
    ccount = dict(cur.execute(
        "SELECT collegeId, COUNT(*) FROM CutoffSummary GROUP BY collegeId").fetchall())

    groups = defaultdict(list)
    for cid, name, sid, typ, code in cols:
        groups[(norm(name), sid)].append((cid, name, typ, code))

    n_groups = n_orphans = n_repointed = n_merged = 0
    type_fixes = code_fixes = 0

    for key, rows in groups.items():
        if len(rows) < 2:
            continue
        n_groups += 1
        # choose canonical
        def score(r):
            cid, name, typ, code = r
            return (ccount.get(cid, 0), typ != "UNKNOWN", bool(code), cid)
        rows_sorted = sorted(rows, key=score, reverse=True)
        canon = rows_sorted[0]
        canon_id, _, canon_type, canon_code = canon
        orphans = rows_sorted[1:]

        # canonical adopts a known type/code if missing
        if canon_type == "UNKNOWN":
            for _id, _n, typ, _c in orphans:
                if typ != "UNKNOWN":
                    if not DRY:
                        cur.execute("UPDATE College SET type=? WHERE id=?", (typ, canon_id))
                    canon_type = typ; type_fixes += 1; break
        if not canon_code:
            for _id, _n, _t, code in orphans:
                if code:
                    if not DRY:
                        cur.execute("UPDATE College SET code=? WHERE id=?", (code, canon_id))
                    canon_code = code; code_fixes += 1; break

        # set of existing cutoff unique-keys on canonical
        existing = {}
        for r in cur.execute(
            "SELECT id,year,round,courseId,category,quota,closingRank,openingRank,allotmentCount,sourceFiles "
            "FROM CutoffSummary WHERE collegeId=?", (canon_id,)):
            existing[(r[1], r[2], r[3], r[4], r[5])] = list(r)

        for orphan_id, _n, _t, _c in orphans:
            n_orphans += 1
            for r in cur.execute(
                "SELECT id,year,round,courseId,category,quota,closingRank,openingRank,allotmentCount,sourceFiles "
                "FROM CutoffSummary WHERE collegeId=?", (orphan_id,)).fetchall():
                rid, yr, rnd, crs, cat, quo, clo, opn, alc, sf = r
                k = (yr, rnd, crs, cat, quo)
                if k in existing:
                    # merge into the canonical row, drop this one
                    e = existing[k]
                    new_clo = max(e[6], clo)
                    new_opn = min([x for x in (e[7], opn) if x is not None], default=None)
                    new_alc = (e[8] or 0) + (alc or 0)
                    new_sf = "|".join(sorted({*(str(e[9]).split("|") if e[9] else []),
                                              *(str(sf).split("|") if sf else [])} - {"None", ""}))
                    if not DRY:
                        cur.execute("UPDATE CutoffSummary SET closingRank=?,openingRank=?,allotmentCount=?,sourceFiles=? WHERE id=?",
                                    (new_clo, new_opn, new_alc, new_sf or None, e[0]))
                        cur.execute("DELETE FROM CutoffSummary WHERE id=?", (rid,))
                    e[6], e[7], e[8], e[9] = new_clo, new_opn, new_alc, new_sf
                    n_merged += 1
                else:
                    if not DRY:
                        cur.execute("UPDATE CutoffSummary SET collegeId=? WHERE id=?", (canon_id, rid))
                    existing[k] = [rid, yr, rnd, crs, cat, quo, clo, opn, alc, sf]
                    n_repointed += 1
            if not DRY:
                cur.execute("DELETE FROM College WHERE id=?", (orphan_id,))

    remaining = len(cols) - n_orphans
    print(f"duplicate groups merged : {n_groups}")
    print(f"orphan colleges removed : {n_orphans}")
    print(f"cutoffs repointed       : {n_repointed}")
    print(f"cutoffs merged (collide): {n_merged}")
    print(f"canonical type fixes    : {type_fixes}")
    print(f"canonical code fixes    : {code_fixes}")
    print(f"colleges: {len(cols)} -> {remaining}")

    if DRY:
        db.rollback(); print("\n(dry run — rolled back)")
    else:
        db.commit(); print("\nCOMMITTED.")
    # integrity check
    orphan_cut = db.execute(
        "SELECT COUNT(*) FROM CutoffSummary cs LEFT JOIN College c ON c.id=cs.collegeId WHERE c.id IS NULL").fetchone()[0]
    print("orphaned cutoffs (should be 0):", orphan_cut)

if __name__ == "__main__":
    main()
