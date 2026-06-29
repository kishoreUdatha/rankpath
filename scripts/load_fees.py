"""Load data/fees.csv into the FeeStructure table (full reload).

CSV columns: college_id, college_name, type, course, year, tuition_annual,
hostel_annual, other_annual, nri_tuition, is_official, source_url, note

Run: .venv-etl/Scripts/python.exe scripts/load_fees.py
"""
import sqlite3, csv, os, uuid, datetime

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
SRC = os.path.join(os.path.dirname(__file__), "..", "data", "fees.csv")


def i(v):
    v = (v or "").strip()
    return int(float(v)) if v not in ("", "None") else None


def main():
    db = sqlite3.connect(DEV)
    valid = {r[0] for r in db.execute("SELECT id FROM College")}
    now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")

    db.execute("DELETE FROM FeeStructure")
    rows, skipped = 0, 0
    with open(SRC, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            cid = r["college_id"].strip()
            if cid not in valid:
                skipped += 1
                continue
            db.execute(
                """INSERT INTO FeeStructure
                   (id, collegeId, course, year, tuitionAnnual, hostelAnnual, otherAnnual,
                    nriTuition, currency, isIndicative, sourceUrl, note, updatedAt)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("fee_" + uuid.uuid4().hex[:20], cid, r.get("course") or "MBBS",
                 i(r.get("year")), i(r.get("tuition_annual")), i(r.get("hostel_annual")),
                 i(r.get("other_annual")), i(r.get("nri_tuition")), "INR",
                 0 if (r.get("is_official", "0").strip() == "1") else 1,
                 (r.get("source_url") or "").strip() or None,
                 (r.get("note") or "").strip() or None, now),
            )
            rows += 1
    db.commit()
    official = db.execute("SELECT COUNT(*) FROM FeeStructure WHERE isIndicative=0").fetchone()[0]
    print(f"loaded {rows} fee rows (skipped {skipped} unknown colleges); {official} marked official")


if __name__ == "__main__":
    main()
