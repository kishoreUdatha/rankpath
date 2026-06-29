"""Ingest Madhya Pradesh (DME) state-quota MBBS cutoffs via a VERIFIED
INST_CODE->college map (data/mp_college_map.csv). NEET All-India-Rank based.

Source: dme.mponline.gov.in "Allotment Opening Closing" PDFs (college x category
opening/closing AI RANK). Columns: INST_CODE | TYPE | NAME | COURSE |
OPEN_AI_RANK | CLOSE_AI_RANK | open_score | close_score | CATEGORY | allotted | status
Category e.g. 'EWS/X/OP' = social/horizontal/seat-type. We keep only the base
horizontal pool 'X' (no PwD/girls/etc) and map: UR->OPEN, EWS/OBC/SC/ST as-is.

Usage: ...python scripts/ingest_mp_verified.py <pdf> --year 2024 --round R1 [--dry]
"""
import sqlite3, re, sys, os, uuid, csv
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "mp_college_map.csv")
SOC = {"UR": "OPEN", "EWS": "EWS", "OBC": "OBC", "SC": "SC", "ST": "ST"}


def load_map():
    with open(MAP, encoding="utf-8") as f:
        return {r["mp_code"].strip(): r["dev_college_id"].strip() for r in csv.DictReader(f)}


def parse(pdf):
    import pdfplumber
    agg = defaultdict(lambda: defaultdict(int))  # code -> (course,cat) -> max close
    with pdfplumber.open(pdf) as doc:
        for page in doc.pages:
            for t in page.extract_tables() or []:
                for row in t:
                    if not row or len(row) < 9:
                        continue
                    code = (row[0] or "").strip()
                    course = (row[3] or "").strip().upper()
                    if not code.isdigit() or course not in ("MBBS", "BDS"):
                        continue
                    close = re.sub(r"[^0-9]", "", row[5] or "")
                    cat = (row[8] or "").strip().upper()
                    parts = cat.split("/")
                    if len(parts) < 2 or parts[1] != "X" or parts[0] not in SOC or not close:
                        continue
                    tc = SOC[parts[0]]
                    agg[code][(course, tc)] = max(agg[code][(course, tc)], int(close))
    return agg


def main():
    a = sys.argv[1:]
    pdf = a[0]
    year = int(a[a.index("--year") + 1]) if "--year" in a else 2024
    rnd = a[a.index("--round") + 1] if "--round" in a else "R1"
    dry = "--dry" in a

    cmap = load_map()
    agg = parse(pdf)
    db = sqlite3.connect(DEV); cur = db.cursor()
    courses = {c: cid for cid, c in cur.execute("SELECT id,name FROM Course")}

    if not dry:
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='MP')""",
                    (year, rnd))
    mapped = unmapped = rows = 0
    sample = []
    for code, blk in agg.items():
        cid = cmap.get(code)
        if not cid:
            unmapped += 1; continue
        mapped += 1
        for (course, cat), close in blk.items():
            crsid = courses.get(course)
            if not crsid or not close:
                continue
            if len(sample) < 6: sample.append((code, course, cat, close))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("mp_"+uuid.uuid4().hex[:18], year, rnd, cid, crsid, cat, "STATE", None, close, 0, os.path.basename(pdf)))
            rows += 1
    print(f"MP {year} {rnd}: mapped {mapped} | unmapped(not-in-map) {unmapped} | rows {rows}")
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
