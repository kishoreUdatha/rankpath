"""Ingest Bihar (BCECEB / UGMAC) state-quota MBBS cutoffs via a VERIFIED ordered
match-key map (data/br_college_map.csv). NEET All-India-Rank based.

Source: bceceboard.bihar.gov.in "INSTITUTE WISE OPENING AND CLOSING RANK OF
UGMAC-<year>" PDFs. Each row:
  INSTITUTE | COURSE | SEAT TYPE(General/Female) | CATEGORY | NEET-AIR-OPEN |
  NEET-AIR-CLOSE | STATE-OPEN | STATE-CLOSE
We take the NEET ALL-INDIA-RANK opening/closing (first two numbers). MBBS only.
Category map: UR->OPEN, EWS->EWS, BC/EBC->OBC, SC->SC, ST->ST
(sub-quotas DQ/MM/NRI/RCG/SM skipped). General+Female merged per category
(opening=min, closing=max of NEET AIR).

Match: each institute -> FIRST map row whose key is a substring (comma/space
insensitive). Missing private colleges (col_br_*) are created.

Usage: .venv-etl/Scripts/python.exe scripts/ingest_br_verified.py <pdf> --year 2024 [--round R1] [--dry]
"""
import sqlite3, re, sys, os, csv, uuid
from collections import defaultdict
import pdfplumber

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "br_college_map.csv")
NOW = "2026-06-29T00:00:00.000Z"
CAT = {"UR": "OPEN", "EWS": "EWS", "BC": "OBC", "EBC": "OBC", "SC": "SC", "ST": "ST"}
# 2024/2025 layout: NEET-AIR-OPEN NEET-AIR-CLOSE STATE-OPEN STATE-CLOSE (take first two
# = NEET All-India-Rank). NOTE: the 2023 UGMAC PDF publishes ONLY Bihar state ranks (no
# NEET-AIR column), so it is intentionally NOT ingestible here — matching it would mix
# state ranks into a NEET-AIR-keyed dataset. The strict 4-number regex makes 2023 a
# safe no-op (0 rows) rather than silently ingesting the wrong metric.
ROW = re.compile(r'^(.+?)\s+(M\.B\.B\.S\.)\s+(General|Female)\s+([A-Z]{2,4})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$')


def _flat(s):
    return re.sub(r'\s+', ' ', s.upper().replace(',', ' ')).strip()


def parse(pdf):
    data = defaultdict(lambda: defaultdict(lambda: [[], []]))  # inst -> cat -> [opens, closes]
    with pdfplumber.open(pdf) as doc:
        for p in doc.pages:
            for ln in (p.extract_text() or "").splitlines():
                m = ROW.match(ln)
                if not m:
                    continue
                inst = m.group(1).strip()
                cat = CAT.get(m.group(4))
                if not cat:
                    continue
                nopen, nclose = int(m.group(5)), int(m.group(6))
                data[inst][cat][0].append(nopen)
                data[inst][cat][1].append(nclose)
    return data


def match(inst, keys):
    u = _flat(inst)
    for key, cid, typ, name in keys:
        if _flat(key) in u:
            return cid, typ, name
    return None, None, None


def main():
    a = sys.argv[1:]
    pdf = a[0]
    year = int(a[a.index("--year") + 1]) if "--year" in a else 2024
    rnd = a[a.index("--round") + 1] if "--round" in a else "R1"
    dry = "--dry" in a

    keys = [(r["match_key"], r["dev_college_id"], r["type"], r["college_name"])
            for r in csv.DictReader(open(MAP, encoding="utf-8"))]
    data = parse(pdf)
    db = sqlite3.connect(DEV); cur = db.cursor()
    mbbs = cur.execute("SELECT id FROM Course WHERE name='MBBS'").fetchone()[0]

    resolved = {}; unmatched = []
    for inst in data:
        cid, typ, name = match(inst, keys)
        if cid:
            resolved[inst] = (cid, typ, name)
        else:
            unmatched.append(inst)

    created = 0
    if not dry:
        seen = set()
        for inst, (cid, typ, name) in resolved.items():
            if cid.startswith("col_br_") and cid not in seen:
                seen.add(cid)
                if not cur.execute("SELECT 1 FROM College WHERE id=?", (cid,)).fetchone():
                    cur.execute("""INSERT INTO College (id,name,type,stateId,feeBandDefault,isMinority,isDeemed,isCentral,createdAt,updatedAt)
                                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                                (cid, name, typ, "st_br", "HIGH" if typ == "PRIVATE" else "LOW", 0, 0, 0, NOW, NOW))
                    created += 1
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='BR')""",
                    (year, rnd))

    bycid = defaultdict(lambda: defaultdict(lambda: [[], []]))
    for inst, (cid, typ, name) in resolved.items():
        for c, (op, cl) in data[inst].items():
            bycid[cid][c][0] += op
            bycid[cid][c][1] += cl

    nrows = 0; sample = []
    for cid, cats in bycid.items():
        for c, (op, cl) in cats.items():
            o, k = min(op), max(cl)
            if len(sample) < 8:
                sample.append((cid[-6:], c, f"{o}->{k}"))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("br_" + uuid.uuid4().hex[:18], year, rnd, cid, mbbs, c, "STATE", o, k, 0, os.path.basename(pdf)))
            nrows += 1
    print(f"BR {year} {rnd}: institutes {len(data)} | matched {len(resolved)} | created {created} | rows {nrows}")
    if unmatched:
        print("UNMATCHED:", unmatched)
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
