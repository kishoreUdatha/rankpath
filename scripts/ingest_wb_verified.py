"""Ingest West Bengal (WBMCC) state-quota MBBS cutoffs via a VERIFIED ordered
match-key map (data/wb_college_map.csv). NEET All-India-Rank based.

Source: wbmcc.nic.in "UG Result Round-1" PDFs (PROVISIONAL SEAT ALLOTMENT RESULT).
Columns (parsed by X-COORDINATE, institute names wrap across lines):
  ROUND | ALL INDIA RANK | CHOICE | INSTITUTE | COURSE | ALLOTTED QUOTA |
  ALLOTTED CATEGORY | CANDIDATE CATEGORY | STATUS
We take ALL INDIA RANK (=NEET AIR), INSTITUTE (reconstructed), COURSE (MBBS only),
ALLOTTED CATEGORY (the seat category). Category map:
  UR->OPEN, EWS->EWS, OBC-A/OBC-B->OBC, SC->SC, ST->ST  (PwD sub-quota rows skipped).
Closing per (college,category) = ROBUST max (IQR fence).

Match: each parsed institute is matched to the FIRST map row whose match_key is a
substring (rows ordered specific-first so 'NILRATAN ...' wins before plain
'MEDICAL COLLEGE, KOLKATA'). Missing private colleges (col_wb_*) are created.

Usage: .venv-etl/Scripts/python.exe scripts/ingest_wb_verified.py <result_pdf> --year 2024 [--round R1] [--dry]
"""
import sqlite3, re, sys, os, csv, uuid
from collections import defaultdict
import pdfplumber

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "wb_college_map.csv")
NOW = "2026-06-29T00:00:00.000Z"


def col(x):
    if 90 <= x < 145: return 'RANK'
    if 195 <= x < 362: return 'INST'
    if 362 <= x < 418: return 'COURSE'
    if 548 <= x < 625: return 'ACAT'
    return None


def norm_cat(s):
    s = s.upper()
    if 'PWD' in s: return None
    if s.startswith('UR'): return 'OPEN'
    if s.startswith('EWS'): return 'EWS'
    if s.startswith('OBC'): return 'OBC'
    if s.startswith('SC'): return 'SC'
    if s.startswith('ST'): return 'ST'
    return None


def robust_closing(ranks):
    ranks = sorted(ranks); n = len(ranks)
    if n <= 3: return ranks[-1]
    q1 = ranks[n // 4]; q3 = ranks[(3 * n) // 4]
    fence = q3 + 1.5 * (q3 - q1)
    capped = [r for r in ranks if r <= fence]
    return max(capped) if capped else ranks[-1]


def emit(rec, data):
    if rec is None or 'MBBS' not in rec['course']:
        return
    inst = re.sub(r'\s+', ' ', ' '.join(rec['inst'])).strip().rstrip(',')
    cat = norm_cat(' '.join(rec['acat']).strip())
    if inst and cat:
        data[inst][cat].append(rec['air'])


def parse(pdf):
    data = defaultdict(lambda: defaultdict(list))  # inst -> cat -> [air]
    with pdfplumber.open(pdf) as doc:
        for p in doc.pages:
            rows = defaultdict(dict)
            for w in p.extract_words():
                c = col(w['x0'])
                if not c:
                    continue
                rows.setdefault(round(w['top']), {}).setdefault(c, []).append((w['x0'], w['text']))
            cur = None
            for t in sorted(rows):
                r = rows[t]
                rank = None
                if 'RANK' in r:
                    txt = ''.join(x[1] for x in sorted(r['RANK']))
                    if txt.isdigit():
                        rank = int(txt)
                if rank is not None:
                    emit(cur, data)  # flush previous record
                    cur = {'air': rank, 'inst': [], 'course': '', 'acat': []}
                    if 'INST' in r: cur['inst'] += [x[1] for x in sorted(r['INST'])]
                    if 'COURSE' in r: cur['course'] = ' '.join(x[1] for x in sorted(r['COURSE']))
                    if 'ACAT' in r: cur['acat'] += [x[1] for x in sorted(r['ACAT'])]
                elif cur is not None:
                    if 'INST' in r: cur['inst'] += [x[1] for x in sorted(r['INST'])]
                    if 'ACAT' in r and not cur['acat']: cur['acat'] += [x[1] for x in sorted(r['ACAT'])]
            emit(cur, data)  # flush last record on page
    return data


def _flat(s):
    return re.sub(r'\s+', ' ', s.upper().replace(',', ' ')).strip()


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

    # resolve institutes -> dev ids
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
            if cid.startswith("col_wb_") and cid not in seen:
                seen.add(cid)
                if not cur.execute("SELECT 1 FROM College WHERE id=?", (cid,)).fetchone():
                    cur.execute("""INSERT INTO College (id,name,type,stateId,feeBandDefault,isMinority,isDeemed,isCentral,createdAt,updatedAt)
                                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                                (cid, name, typ, "st_wb", "HIGH" if typ == "PRIVATE" else "LOW", 0, 0, 0, NOW, NOW))
                    created += 1
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='WB')""",
                    (year, rnd))

    # merge by dev id (multiple inst strings -> same college across categories)
    bycid = defaultdict(lambda: defaultdict(list))
    for inst, (cid, typ, name) in resolved.items():
        for c, airs in data[inst].items():
            bycid[cid][c] += airs

    nrows = 0; sample = []
    for cid, cats in bycid.items():
        for c, airs in cats.items():
            clo = robust_closing(airs)
            if len(sample) < 8:
                sample.append((cid[-6:], c, f"{min(airs)}->{clo} (n={len(airs)})"))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("wb_" + uuid.uuid4().hex[:18], year, rnd, cid, mbbs, c, "STATE", min(airs), clo, len(airs), os.path.basename(pdf)))
            nrows += 1
    print(f"WB {year} {rnd}: institutes {len(data)} | matched {len(resolved)} | created {created} | rows {nrows}")
    if unmatched:
        print("UNMATCHED institutes:", unmatched)
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
