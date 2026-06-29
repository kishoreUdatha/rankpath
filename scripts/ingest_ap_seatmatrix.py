"""Ingest the NTRUHS (Andhra Pradesh) MBBS total sanctioned intake into SeatMatrix.

Source: drntr.uhsap.in MBBS_CQ 2025-26 "Category/College/University-area-wise"
PDF (data/_ap/ap_mbbs_cq_seatmatrix.pdf), page 2 = per-college total intake.

Stored as one SeatMatrix row per AP college:
  quota=STATE, category='Total intake', course=MBBS, seats=<intake>, year=2025.
This is the FULL college intake (all AP quotas combined) — complements the MCC
AIQ category-wise rows already loaded.

Run: .venv-etl/Scripts/python.exe scripts/ingest_ap_seatmatrix.py [--dry]
"""
import sqlite3, re, sys, os, uuid

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
PDF = os.path.join(os.path.dirname(__file__), "..", "data", "_ap", "ap_mbbs_cq_seatmatrix.pdf")
DRY = "--dry" in sys.argv

def dsp(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def main():
    import pdfplumber
    db = sqlite3.connect(DEV)
    cur = db.cursor()

    # AP colleges in dev.db -> de-spaced name map
    ap = [(cid, name) for cid, name in cur.execute(
        "SELECT c.id, c.name FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='AP'")]
    ap_keys = [(dsp(n), cid, n) for cid, n in ap]
    mbbs = cur.execute("SELECT id FROM Course WHERE name='MBBS'").fetchone()
    mbbs_id = mbbs[0] if mbbs else None

    # parse intake table (page 2)
    rows = []
    with pdfplumber.open(PDF) as pdf:
        for r in pdf.pages[1].extract_table() or []:
            if r and len(r) >= 5 and (r[0] or "").strip().isdigit():
                name = (r[2] or "").strip()
                intake = re.sub(r"[^0-9]", "", r[4] or "")
                if name and intake:
                    rows.append((name, int(intake)))

    matched, unmatched = [], []
    used = set()
    for name, intake in rows:
        k = dsp(name)
        if len(k) < 10:
            unmatched.append((name, intake)); continue
        # full containment both ways (includes the city), longest dev match first,
        # each dev college used at most once -> no "Government Medical College" collisions
        cands = [(dk, cid, dn) for dk, cid, dn in ap_keys
                 if cid not in used and (k in dk or dk in k)]
        cands.sort(key=lambda x: len(x[0]), reverse=True)
        if cands:
            dk, cid, dn = cands[0]
            used.add(cid)
            matched.append((cid, dn, name, intake))
        else:
            unmatched.append((name, intake))

    print(f"AP intake rows: {len(rows)} | matched: {len(matched)} | unmatched: {len(unmatched)}")
    for nm, iv in unmatched:
        print(f"   ? {nm[:50]} ({iv})")

    if not DRY:
        for cid, _dn, _pn, intake in matched:
            cur.execute(
                "DELETE FROM SeatMatrix WHERE collegeId=? AND quota='STATE' AND category='Total intake'", (cid,))
            cur.execute(
                """INSERT INTO SeatMatrix (id, year, round, collegeId, courseId, quota, category, seats, sourceFile)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                ("seat_" + uuid.uuid4().hex[:20], 2025, "R1", cid, mbbs_id, "STATE", "Total intake", intake, "ntruhs:ap_2025"))
        db.commit()
        print(f"\nCOMMITTED {len(matched)} AP intake rows.")
    else:
        print("\n(dry run)")


if __name__ == "__main__":
    main()
