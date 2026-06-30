"""Dedupe West Bengal college records.

The dev DB accumulated duplicate WB colleges from 3 ingestion sources (MCC-original
names, the WB state-quota verified map col_wb_*, and the NMC seat matrix col_nmc_*).
This merges each hand-verified duplicate GROUP into a canonical record (the one the
WB verified map points to, so state-quota cutoffs stay linked), repointing all
foreign keys (Allotment / CutoffSummary / SeatMatrix / FeeStructure) and deleting the
duplicates. Collisions (same college+year+round+category+quota) keep the canonical row.

col_nmc_* duplicates are NOT handled here — re-run ingest_nmc_seatmatrix.py afterwards
(idempotent) so NMC seats re-attach correctly to the now-clean WB list.

Run: .venv-etl/Scripts/python.exe scripts/dedupe_wb.py [--dry]
"""
import sqlite3, os, sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")

# canonical_id : [duplicate_ids...]  (canonical chosen = WB-verified-map id where one exists)
GROUPS = {
    "col_2754927034": ["col_2234493661"],                         # AIIMS Kalyani
    "col_7185155369": ["col_9501489019"],                         # Bankura Sammilani
    "col_0942795538": ["col_9730759917"],                         # Burdwan Medical College
    "col_4154504097": ["col_1196645078"],                         # College of Medicine & JNM Hospital, Kalyani
    "col_5416104235": ["col_9214861791"],                         # Diamond Harbour Govt MC
    "col_3807053711": ["col_8077378963"],                         # Malda Medical College
    "col_7138427399": ["col_3138697110", "col_3343688695"],       # R.G. Kar Medical College
    "col_7523139205": ["col_5438448437"],                         # Raiganj Govt MC
    "col_7857008466": ["col_4160780473"],                         # North Bengal Dental College
}
# mis-tagged: S.C.B. Medical College, Cuttack is Odisha, not WB
RESTATE = {"col_8361601384": "st_od"}


def main():
    dry = "--dry" in sys.argv
    db = sqlite3.connect(DEV); cur = db.cursor()

    moved = merged_cut = merged_sm = del_fee = repoint = deleted = 0
    for canon, dups in GROUPS.items():
        cname = cur.execute("SELECT name FROM College WHERE id=?", (canon,)).fetchone()
        if not cname:
            print(f"!! canonical {canon} missing, skipping group"); continue
        for dup in dups:
            if not cur.execute("SELECT 1 FROM College WHERE id=?", (dup,)).fetchone():
                continue
            # Allotment: plain repoint
            n = cur.execute("SELECT COUNT(*) FROM Allotment WHERE collegeId=?", (dup,)).fetchone()[0]
            if not dry and n:
                cur.execute("UPDATE Allotment SET collegeId=? WHERE collegeId=?", (canon, dup))
            moved += n
            # CutoffSummary: repoint, drop collisions
            for cid, year, rnd, cat, quota, course in cur.execute(
                    "SELECT id,year,round,category,quota,courseId FROM CutoffSummary WHERE collegeId=?", (dup,)).fetchall():
                clash = cur.execute("""SELECT 1 FROM CutoffSummary WHERE collegeId=? AND year=? AND round=?
                                       AND category=? AND quota=? AND courseId=?""",
                                    (canon, year, rnd, cat, quota, course)).fetchone()
                if clash:
                    if not dry: cur.execute("DELETE FROM CutoffSummary WHERE id=?", (cid,))
                    merged_cut += 1
                else:
                    if not dry: cur.execute("UPDATE CutoffSummary SET collegeId=? WHERE id=?", (canon, cid))
                    repoint += 1
            # SeatMatrix: repoint, drop collisions
            for sid, year, rnd, quota, cat, course, src in cur.execute(
                    "SELECT id,year,round,quota,category,courseId,sourceFile FROM SeatMatrix WHERE collegeId=?", (dup,)).fetchall():
                clash = cur.execute("""SELECT 1 FROM SeatMatrix WHERE collegeId=? AND year=? AND round=?
                                       AND quota=? AND category=? AND courseId=? AND IFNULL(sourceFile,'')=IFNULL(?,'')""",
                                    (canon, year, rnd, quota, cat, course, src)).fetchone()
                if clash:
                    if not dry: cur.execute("DELETE FROM SeatMatrix WHERE id=?", (sid,))
                    merged_sm += 1
                else:
                    if not dry: cur.execute("UPDATE SeatMatrix SET collegeId=? WHERE id=?", (canon, sid))
            # FeeStructure: keep canonical's, drop dup's (canonical already has fee rows)
            has = cur.execute("SELECT COUNT(*) FROM FeeStructure WHERE collegeId=?", (canon,)).fetchone()[0]
            for (fid,) in cur.execute("SELECT id FROM FeeStructure WHERE collegeId=?", (dup,)).fetchall():
                if has:
                    if not dry: cur.execute("DELETE FROM FeeStructure WHERE id=?", (fid,))
                    del_fee += 1
                else:
                    if not dry: cur.execute("UPDATE FeeStructure SET collegeId=? WHERE id=?", (canon, fid))
            if not dry:
                cur.execute("DELETE FROM College WHERE id=?", (dup,))
            deleted += 1
            print(f"  merge {dup} -> {canon} ({cname[0][:40]})")

    for cid, newst in RESTATE.items():
        row = cur.execute("SELECT name FROM College WHERE id=?", (cid,)).fetchone()
        if row:
            if not dry: cur.execute("UPDATE College SET stateId=? WHERE id=?", (newst, cid))
            print(f"  re-state {cid} -> {newst} ({row[0][:40]})")

    print(f"\nrepointed cutoffs {repoint} | merged-collision cutoffs {merged_cut} | merged-collision seatmatrix {merged_sm} "
          f"| allotment rows moved {moved} | dup fee deleted {del_fee} | colleges deleted {deleted}")
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
