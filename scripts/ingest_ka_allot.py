"""Ingest a KEA Karnataka allotment list -> STATE-quota CutoffSummary.

Used when KEA didn't publish a 'medi_cutoff' rank PDF for the year (e.g. 2025),
only candidate-wise allotment lists:
  SL.NO | All India Rank | Course Code | College | Course Name | Allotted Category | fees | Status

Closing rank per (college, course, mapped-category) = MAX All-India Rank.
Only base General (G) sub-pools are mapped (GM->OPEN, SCG->SC, STG->ST,
1G/2AG/2BG/3AG/3BG->OBC); Kannada-medium (K) / Rural (R) sub-pools ignored.

Usage: ...python scripts/ingest_ka_allot.py <pdf> --year 2025 --round R1 [--dry]
"""
import sqlite3, re, sys, os, uuid, difflib
from collections import defaultdict

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
GMAP = {"GM": "OPEN", "SCG": "SC", "STG": "ST",
        "1G": "OBC", "2AG": "OBC", "2BG": "OBC", "3AG": "OBC", "3BG": "OBC"}
def dsp(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def main():
    import pdfplumber
    a = sys.argv[1:]
    pdf = a[0]
    year = int(a[a.index("--year") + 1]) if "--year" in a else 2025
    rnd = a[a.index("--round") + 1] if "--round" in a else "R1"
    dry = "--dry" in a

    # closing[name][(course,cat)] = max AIR
    closing = defaultdict(lambda: defaultdict(int))
    with pdfplumber.open(pdf) as doc:
        for page in doc.pages:
            for t in page.extract_tables() or []:
                for row in t:
                    if not row or len(row) < 6:
                        continue
                    air = re.sub(r"[^0-9]", "", row[1] or "")
                    name = (row[3] or "").strip()
                    course_name = (row[4] or "").upper()
                    cat = (row[5] or "").strip().upper()
                    if not air or not name or cat not in GMAP:
                        continue
                    course = "MBBS" if "MBBS" in course_name else ("BDS" if "BDS" in course_name else None)
                    if not course:
                        continue
                    tc = GMAP[cat]
                    closing[name][(course, tc)] = max(closing[name][(course, tc)], int(air))

    print(f"parsed {len(closing)} colleges from allotment list")

    db = sqlite3.connect(DEV); cur = db.cursor()
    ka = [(cid, n) for cid, n in cur.execute(
        "SELECT c.id,c.name FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='KA'")]
    kamap = [(dsp(n), cid, n) for cid, n in ka]
    courses = {c: cid for cid, c in cur.execute("SELECT id,name FROM Course")}

    # global one-to-one fuzzy match
    names = list(closing.keys())
    pairs = []
    for i, nm in enumerate(names):
        k = dsp(nm)
        for dk, cid, dn in kamap:
            if not dk: continue
            sc = 0.95 if (k in dk or dk in k) else difflib.SequenceMatcher(None, k, dk).ratio()
            if sc >= 0.62: pairs.append((sc, i, cid, dn))
    pairs.sort(key=lambda x: x[0], reverse=True)
    assign, used = {}, set()
    for sc, i, cid, dn in pairs:
        if i in assign or cid in used: continue
        assign[i] = cid; used.add(cid)

    if not dry:
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='KA')""",
                    (year, rnd))
    rows = 0
    for i, nm in enumerate(names):
        if i not in assign: continue
        cid = assign[i]
        for (course, cat), clo in closing[nm].items():
            crsid = courses.get(course)
            if not crsid: continue
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("ka_"+uuid.uuid4().hex[:18], year, rnd, cid, crsid, cat, "STATE", None, clo, 0, os.path.basename(pdf)))
            rows += 1
    print(f"matched {len(assign)}/{len(names)} | rows {rows}")
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
