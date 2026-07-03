"""Idempotent cleanup of two 2025 round-label defects in web/prisma/dev.db.

Because dev.db is gitignored, these data corrections are captured here as code so
they survive a rebuild / can be reviewed. Safe to re-run (both steps are no-ops once
applied). Root cause of #1 is fixed in etl/seed_database.py (no longer defaults a
missing round to "R1"); #2 is a wrong --round passed at ingest time for two states.

  #1  MCC 2025 stray / special-stray allotments were stamped round='R1' (the 2025 R1
      MCC result PDF was never downloaded, and null rounds defaulted to R1). These are
      not Round 1 and pollute the predictor's R1-only signal -> DELETE.

  #2  KA and MP 2025 STATE cutoffs were loaded from *_r2 PDFs but labeled round='R1'
      -> RELABEL to their true round R2 (data preserved; predictor filters R1 only).

Usage:  .venv-etl/Scripts/python.exe scripts/fix_2025_round_mislabels.py [--dry]
"""
import os, sqlite3, sys

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
DRY = "--dry" in sys.argv


def main():
    db = sqlite3.connect(DEV)
    one = lambda s, *a: db.execute(s, a).fetchone()[0]

    # --- #1: purge stray-sourced fake R1 (all MCC-side quotas; never touches STATE) ---
    purge_where = ("year=2025 AND round='R1' "
                   "AND lower(coalesce(sourceFiles,'')) LIKE '%stray%'")
    n_purge = one(f"SELECT count(*) FROM CutoffSummary WHERE {purge_where}")
    assert one(f"SELECT count(*) FROM CutoffSummary WHERE {purge_where} AND quota='STATE'") == 0, \
        "guard: purge predicate must not match STATE rows"

    # --- #2: relabel KA/MP 2025 STATE R1 loaded from *_r2 files -> R2 ---
    relabel_where = ("quota='STATE' AND year=2025 AND round='R1' "
                     "AND collegeId IN (SELECT co.id FROM College co JOIN State s "
                     "ON co.stateId=s.id WHERE s.code IN ('KA','MP')) "
                     "AND lower(coalesce(sourceFiles,'')) LIKE '%_r2%'")
    n_relabel = one(f"SELECT count(*) FROM CutoffSummary WHERE {relabel_where}")
    # guard: no existing R2 twin would collide on the natural key
    collide = one(f"""SELECT count(*) FROM CutoffSummary a WHERE {relabel_where}
        AND EXISTS (SELECT 1 FROM CutoffSummary b WHERE b.year=2025 AND b.round='R2'
          AND b.collegeId=a.collegeId AND b.courseId=a.courseId
          AND b.category=a.category AND b.quota=a.quota)""")
    assert collide == 0, f"guard: {collide} relabels would collide with existing R2 rows"

    print(f"#1 purge stray-as-R1 : {n_purge} rows")
    print(f"#2 relabel KA/MP R1->R2: {n_relabel} rows (collision guard passed)")
    if DRY:
        print("(dry run — nothing written)")
        return
    db.execute(f"DELETE FROM CutoffSummary WHERE {purge_where}")
    db.execute(f"UPDATE CutoffSummary SET round='R2' WHERE {relabel_where}")
    db.commit()
    dups = one("SELECT count(*) FROM (SELECT 1 FROM CutoffSummary GROUP BY "
               "year,round,collegeId,courseId,category,quota HAVING count(*)>1)")
    assert dups == 0, f"post-check: {dups} duplicate natural keys"
    print(f"COMMITTED. total rows now: {one('SELECT count(*) FROM CutoffSummary')}, dup keys: {dups}")


if __name__ == "__main__":
    main()
