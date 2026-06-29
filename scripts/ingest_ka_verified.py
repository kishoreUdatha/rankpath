"""Ingest Karnataka (KEA) state-quota MBBS cutoffs using a VERIFIED code->college
map (data/ka_college_map.csv) — no fuzzy matching, so no mis-assignment.

Modes:
  --mode cutoff : KEA 'medi_cutoff' PDF (college header "<seq> M<code> <name>" +
                  24-col category table; one rank row per course-type).
  --mode allot  : KEA allotment list (AIR Rank | Course Code 'M001MG' | College |
                  Course Name | Allotted Category); closing = MAX AIR per cat.

Category map (base General sub-pool only): GM->OPEN, SCG->SC, STG->ST,
1G/2AG/2BG/3AG/3BG->OBC. K (Kannada) / R (Rural) sub-pools ignored.

Usage: ...python scripts/ingest_ka_verified.py <pdf> --mode cutoff --year 2024 --round R1 [--dry]
"""
import sqlite3, re, sys, os, uuid, csv
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "ka_college_map.csv")

CATS = ["1G","1K","1R","2AG","2AK","2AR","2BG","2BK","2BR","3AG","3AK","3AR",
        "3BG","3BK","3BR","GM","GMK","GMR","SCG","SCK","SCR","STG","STK","STR"]
IDX = {c: i for i, c in enumerate(CATS)}
GCOLS = {"OPEN": ["GM"], "OBC": ["1G","2AG","2BG","3AG","3BG"], "SC": ["SCG"], "ST": ["STG"]}
GMAP = {"GM":"OPEN","SCG":"SC","STG":"ST","1G":"OBC","2AG":"OBC","2BG":"OBC","3AG":"OBC","3BG":"OBC"}
HDR = re.compile(r"^\s*\d+\s+([A-Z]\d{2,3})\s+(.+\S)\s*$")
CODE = re.compile(r"^([A-Z]\d{2,3})")


def load_map():
    m = {}
    with open(MAP, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            m[r["kea_code"].strip()] = r["dev_college_id"].strip()
    return m


def parse_cutoff(pdf):
    import pdfplumber
    out = []  # (code, {(course,cat):closing})
    with pdfplumber.open(pdf) as doc:
        for page in doc.pages:
            text = page.extract_text() or ""
            headers = [HDR.match(ln).group(1) for ln in text.splitlines()
                       if HDR.match(ln) and not ln.strip().startswith(("1G","MBBS","BDS"))]
            blocks = []
            for t in page.extract_tables() or []:
                rb = {}
                for row in t:
                    if not row: continue
                    lab = (row[0] or "").upper()
                    if lab.startswith("MBBS") or lab.startswith("BDS"):
                        vals = row[1:]; course = "MBBS" if lab.startswith("MBBS") else "BDS"
                        def cell(c):
                            i = IDX[c]; v = re.sub(r"[^0-9]","",(vals[i] or "")) if i < len(vals) else ""
                            return int(v) if v else 0
                        for tc, cols in GCOLS.items():
                            w = max((cell(c) for c in cols), default=0)
                            if w: rb[(course, tc)] = max(rb.get((course, tc), 0), w)
                if rb: blocks.append(rb)
            for code, blk in zip(headers, blocks):
                out.append((code, blk))
    return out


def parse_allot(pdf):
    import pdfplumber
    agg = defaultdict(lambda: defaultdict(int))  # code -> (course,cat)->maxAIR
    with pdfplumber.open(pdf) as doc:
        for page in doc.pages:
            for t in page.extract_tables() or []:
                for row in t:
                    if not row or len(row) < 6: continue
                    air = re.sub(r"[^0-9]","",(row[1] or ""))
                    cm = CODE.match((row[2] or "").strip())
                    cat = (row[5] or "").strip().upper()
                    cn = (row[4] or "").upper()
                    if not (air and cm and cat in GMAP): continue
                    course = "MBBS" if "MBBS" in cn else ("BDS" if "BDS" in cn else None)
                    if not course: continue
                    code = cm.group(1); tc = GMAP[cat]
                    agg[code][(course, tc)] = max(agg[code][(course, tc)], int(air))
    return [(c, dict(v)) for c, v in agg.items()]


def main():
    a = sys.argv[1:]
    pdf = a[0]
    mode = a[a.index("--mode")+1] if "--mode" in a else "cutoff"
    year = int(a[a.index("--year")+1]) if "--year" in a else 2024
    rnd = a[a.index("--round")+1] if "--round" in a else "R1"
    dry = "--dry" in a

    cmap = load_map()
    parsed = parse_cutoff(pdf) if mode == "cutoff" else parse_allot(pdf)
    db = sqlite3.connect(DEV); cur = db.cursor()
    courses = {c: cid for cid, c in cur.execute("SELECT id,name FROM Course")}

    if not dry:
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='KA')""",
                    (year, rnd))
    mapped = unmapped = rows = 0
    for code, blk in parsed:
        cid = cmap.get(code)
        if not cid:
            unmapped += 1; continue
        mapped += 1
        for (course, cat), clo in blk.items():
            crsid = courses.get(course)
            if not crsid or not clo: continue
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("ka_"+uuid.uuid4().hex[:18], year, rnd, cid, crsid, cat, "STATE", None, clo, 0, os.path.basename(pdf)))
            rows += 1
    print(f"{mode} {year}: mapped {mapped} | unmapped(not-in-map) {unmapped} | rows {rows}")
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
