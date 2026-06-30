"""Load REAL Karnataka MBBS/BDS fees from the KEA allotment list (which has a
'Course_fees' column) into FeeStructure, marked OFFICIAL (isIndicative=0).

Maps by verified KEA code (data/ka_college_map.csv). Fee per college = the most
common Course_fees for that college's allotted seats.

Run: .venv-etl/Scripts/python.exe scripts/ingest_ka_fees.py <allot_pdf> [--dry]
"""
import sqlite3, re, sys, os, csv, uuid
from collections import defaultdict, Counter

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "ka_college_map.csv")
NOW = "2026-06-29T00:00:00.000Z"
CODE = re.compile(r"^([A-Z]\d{2,3})")


def main():
    pdf = sys.argv[1]
    dry = "--dry" in sys.argv
    import pdfplumber
    fees = defaultdict(lambda: defaultdict(Counter))  # code -> course -> Counter(fee)
    with pdfplumber.open(pdf) as doc:
        for page in doc.pages:
            for row in page.extract_table() or []:
                if not row or len(row) < 7:
                    continue
                cm = CODE.match((row[2] or "").strip())
                fee = re.sub(r"[^0-9]", "", row[6] or "")
                cn = (row[4] or "").upper()
                if not (cm and fee):
                    continue
                course = "MBBS" if "MBBS" in cn else ("BDS" if "BDS" in cn else None)
                if course:
                    fees[cm.group(1)][course][int(fee)] += 1

    cmap = {r["kea_code"]: r["dev_college_id"] for r in csv.DictReader(open(MAP, encoding="utf-8"))}
    db = sqlite3.connect(DEV); cur = db.cursor()
    updated = inserted = 0
    for code, courses in fees.items():
        cid = cmap.get(code)
        if not cid:
            continue
        for course, ctr in courses.items():
            fee = ctr.most_common(1)[0][0]
            row = cur.execute("SELECT id FROM FeeStructure WHERE collegeId=? AND course=?", (cid, course)).fetchone()
            if dry:
                continue
            if row:
                cur.execute("""UPDATE FeeStructure SET tuitionAnnual=?, isIndicative=0,
                               sourceUrl='https://cetonline.karnataka.gov.in', note='KEA 2025 allotment (official course fee)', updatedAt=?
                               WHERE id=?""", (fee, NOW, row[0]))
                updated += 1
            else:
                cur.execute("""INSERT INTO FeeStructure (id,collegeId,course,year,tuitionAnnual,currency,isIndicative,sourceUrl,note,updatedAt)
                               VALUES (?,?,?,?,?,?,?,?,?,?)""",
                            ("fee_"+uuid.uuid4().hex[:18], cid, course, 2025, fee, "INR", 0,
                             "https://cetonline.karnataka.gov.in", "KEA 2025 allotment (official course fee)", NOW))
                inserted += 1
    if not dry:
        db.commit()
    print(f"real KA fees: updated {updated}, inserted {inserted}" + (" (dry)" if dry else " — COMMITTED"))


if __name__ == "__main__":
    main()
