"""Ingest Gujarat (ACPUGMEC) state-quota MBBS cutoffs via a VERIFIED code->college
map (data/gj_college_map.csv). NEET All-India-Rank based.

Source: medadmgujarat.ncode.in "Meritwise Allotment List - Round 01" PDFs. Each row:
  SR NAME MERITNO Cat <NEETscore> <ADM-Cat> <CODE>-<SeatType> <AIR> <userid> <round>
We anchor on the "<CODE>-<SeatType>" token: ADM-Cat is the token before it, AIR the
token after. Keep Seat Type GQ (Gujarat/state quota). Category map:
  OP->OPEN, EW->EWS, SE->OBC (SEBC), SC->SC, ST->ST.
Closing per (college,category) = ROBUST max (IQR fence) to drop PH/special outliers.
Missing colleges (col_gj_*) are created as College records (type/name from the map).

Usage: .venv-etl/Scripts/python.exe scripts/ingest_gj_verified.py <merit_pdf> --year 2024 [--round R1] [--dry]
"""
import sqlite3, re, sys, os, csv, uuid
from collections import defaultdict
import pdfplumber

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "gj_college_map.csv")
NOW = "2026-06-29T00:00:00.000Z"
CAT = {"OP": "OPEN", "EW": "EWS", "SE": "OBC", "SC": "SC", "ST": "ST"}
TOKEN = re.compile(r"^([A-Z]{2,7})-(GQ|MQ|LQ|NQ|PH)$")


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
    data = defaultdict(lambda: defaultdict(list))  # code -> cat -> [air]
    with pdfplumber.open(pdf) as doc:
        for page in doc.pages:
            for ln in (page.extract_text() or "").splitlines():
                t = ln.split()
                if not t or not t[0].isdigit():
                    continue
                for i, tok in enumerate(t):
                    m = TOKEN.match(tok)
                    if not m:
                        continue
                    code, st = m.group(1), m.group(2)
                    if st != "GQ" or i == 0 or i + 1 >= len(t):
                        break
                    admcat = t[i - 1]
                    cat = CAT.get(admcat)
                    if cat and t[i + 1].isdigit():
                        data[code][cat].append(int(t[i + 1]))
                    break
    return data


def ensure_colleges(cur, rows):
    created = 0
    for r in rows:
        cid = r["dev_college_id"]
        if not cid.startswith("col_gj_"):
            continue
        if cur.execute("SELECT 1 FROM College WHERE id=?", (cid,)).fetchone():
            continue
        cur.execute("""INSERT INTO College (id,name,code,type,stateId,feeBandDefault,isMinority,isDeemed,isCentral,createdAt,updatedAt)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (cid, r["college_name"], r["gj_code"], r["type"], "st_gj",
                     "HIGH" if r["type"] == "PRIVATE" else "LOW", 0, 0, 0, NOW, NOW))
        created += 1
    return created


def main():
    a = sys.argv[1:]
    pdf = a[0]
    year = int(a[a.index("--year") + 1]) if "--year" in a else 2024
    rnd = a[a.index("--round") + 1] if "--round" in a else "R1"
    dry = "--dry" in a

    rows = list(csv.DictReader(open(MAP, encoding="utf-8")))
    cmap = {r["gj_code"]: r["dev_college_id"] for r in rows}
    data = parse(pdf)
    db = sqlite3.connect(DEV); cur = db.cursor()
    mbbs = cur.execute("SELECT id FROM Course WHERE name='MBBS'").fetchone()[0]

    if not dry:
        created = ensure_colleges(cur, rows)
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='GJ')""",
                    (year, rnd))
    else:
        created = 0
    mapped = nrows = 0; unmapped = []
    sample = []
    for code, cats in data.items():
        cid = cmap.get(code)
        if not cid:
            unmapped.append(code); continue
        mapped += 1
        for cat, air in cats.items():
            clo = robust_closing(air)
            if len(sample) < 8:
                sample.append((code, cat, f"{min(air)}->{clo} (n={len(air)})"))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("gj_" + uuid.uuid4().hex[:18], year, rnd, cid, mbbs, cat, "STATE", min(air), clo, len(air), os.path.basename(pdf)))
            nrows += 1
    print(f"GJ {year} {rnd}: created {created} colleges | mapped {mapped}/{len(cmap)} | unmapped {unmapped} | rows {nrows}")
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
