"""Ingest Telangana (KNRUHS) state-quota (Convener Quota) MBBS cutoffs via a
VERIFIED code->college map (data/tg_college_map.csv). NEET All-India-Rank based.

Source: knruhs.telangana.gov.in college-wise CQ allotment PDFs. Structure:
  "COLL :: <CODE> - <NAME>"  /  "CRS :: MBBS"  then candidate rows
  "<NEET-AIR> <roll> <NAME> <CAT> <M/F> <SEAT-TYPE>"  (CAT=OC/BCA-E/SC/ST/EWS)

Closing per (college,course,category) = ROBUST max (IQR fence: Q3+1.5*IQR) to drop
special sub-quota seats (PH/NCC/sports/minority) that inflate the plain max.
Category map: OC->OPEN, BC[A-E]->OBC, SC->SC, ST->ST, EWS->EWS.

Usage: ...python scripts/ingest_tg_verified.py <pdf> --year 2024 --round R1 [--dry]
"""
import sqlite3, re, sys, os, uuid, csv
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "tg_college_map.csv")
SOC = {"OC": "OPEN", "EWS": "EWS", "SC": "SC", "ST": "ST",
       "BCA": "OBC", "BCB": "OBC", "BCC": "OBC", "BCD": "OBC", "BCE": "OBC"}
COLL = re.compile(r"COLL\s*::\s*([A-Z][A-Z0-9]*?)\s*(?:\(\d+\))?\s*-\s*(.+)")
CRS = re.compile(r"CRS\s*::\s*(MBBS|BDS)")


def robust_closing(ranks):
    ranks = sorted(ranks)
    n = len(ranks)
    if n <= 3:
        return ranks[-1]
    q1 = ranks[n // 4]; q3 = ranks[(3 * n) // 4]
    fence = q3 + 1.5 * (q3 - q1)
    capped = [r for r in ranks if r <= fence]
    return max(capped) if capped else ranks[-1]


def parse(pdf):
    import pdfplumber
    ranks = defaultdict(lambda: defaultdict(list))  # code -> (course,cat) -> [ranks]
    code, course = None, "MBBS"
    with pdfplumber.open(pdf) as doc:
        for page in doc.pages:
            for ln in (page.extract_text() or "").splitlines():
                m = COLL.search(ln)
                if m:
                    code = m.group(1); continue
                mc = CRS.search(ln)
                if mc:
                    course = mc.group(1); continue
                t = ln.split()
                if code and t and t[0].isdigit():
                    cat = next((x for x in t[1:] if x in SOC), None)
                    if cat:
                        ranks[code][(course, SOC[cat])].append(int(t[0]))
    return ranks


def main():
    a = sys.argv[1:]
    pdf = a[0]
    year = int(a[a.index("--year") + 1]) if "--year" in a else 2024
    rnd = a[a.index("--round") + 1] if "--round" in a else "R1"
    dry = "--dry" in a

    cmap = {r["tg_code"]: r["dev_college_id"] for r in csv.DictReader(open(MAP, encoding="utf-8"))}
    data = parse(pdf)
    db = sqlite3.connect(DEV); cur = db.cursor()
    courses = {c: cid for cid, c in cur.execute("SELECT id,name FROM Course")}

    if not dry:
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='TG')""",
                    (year, rnd))
    mapped = unmapped = rows = 0
    sample = []
    for code, blk in data.items():
        cid = cmap.get(code)
        if not cid:
            unmapped += 1; continue
        mapped += 1
        for (course, cat), rk in blk.items():
            crsid = courses.get(course)
            if not crsid or not rk:
                continue
            clo = robust_closing(rk)
            if len(sample) < 6:
                sample.append((code, cat, f"{clo} (n={len(rk)},max={max(rk)})"))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("tg_"+uuid.uuid4().hex[:18], year, rnd, cid, crsid, cat, "STATE", min(rk), clo, len(rk), os.path.basename(pdf)))
            rows += 1
    print(f"TG {year} {rnd}: mapped {mapped} | unmapped(not-in-map) {unmapped} | rows {rows}")
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
