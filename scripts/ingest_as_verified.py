"""Ingest Assam (DME Assam) state-quota MBBS cutoffs via a VERIFIED key->college
map (data/as_college_map.csv). NEET All-India-Rank based.

Source: dme.assam.gov.in "Provisional Selection List (Round-N)" PDFs (wide/landscape).
Merit-sorted candidate rows; per row (by X-COORDINATE):
  AIR (NEET Rank) x[150,195) | Quota(seat category) x[755,805) | College x>=850 (wraps).
Each record spans the tops between consecutive AIR rows; College = x>=850 words in
that span. Quota->category: UR->OPEN, OBC/MOBC->OBC, SC->SC, ST(P/H)->ST, EWS->EWS.
Closing per (college,category) = robust max AIR (IQR fence). Govt colleges only
(dental -> SKIP).

Usage: ...python scripts/ingest_as_verified.py <pdf> --year YYYY [--round R1] [--dry]
"""
import sqlite3, re, sys, os, csv, uuid
from collections import defaultdict
import pdfplumber

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "as_college_map.csv")


def norm_cat(q):
    q = q.upper()
    if q.startswith('UR') or q == 'EWS' and False: pass
    if q.startswith('EWS') or q.startswith('EW'): return 'EWS'
    if q.startswith('UR') or q.startswith('OPEN') or q == 'GEN': return 'OPEN'
    if q.startswith('OBC') or q.startswith('MOBC'): return 'OBC'
    if q.startswith('SC'): return 'SC'
    if q.startswith('ST'): return 'ST'
    return None


def robust_closing(ranks):
    ranks = sorted(ranks); n = len(ranks)
    if n <= 3:
        return ranks[-1]
    q1 = ranks[n // 4]; q3 = ranks[(3 * n) // 4]
    fence = q3 + 1.5 * (q3 - q1)
    capped = [r for r in ranks if r <= fence]
    return max(capped) if capped else ranks[-1]


def parse(pdf, keys):
    out = defaultdict(lambda: defaultdict(list))  # dev_cid -> cat -> [air]
    with pdfplumber.open(pdf) as d:
        for page in d.pages:
            rows = defaultdict(list)
            for w in page.extract_words():
                rows.setdefault(round(w['top']), []).append(w)
            tops = sorted(rows)
            # data-row tops: an integer in the AIR column x[150,195)
            def air_of(t):
                for w in rows[t]:
                    if 150 <= w['x0'] < 195 and re.fullmatch(r'\d{1,7}', w['text']):
                        return int(w['text'])
                return None
            datatops = [t for t in tops if air_of(t) is not None]
            for i, t in enumerate(datatops):
                air = air_of(t)
                nxt = datatops[i + 1] if i + 1 < len(datatops) else (tops[-1] + 1)
                span = [tt for tt in tops if t <= tt < nxt]
                quota = None; inst = []
                for tt in span:
                    for w in rows[tt]:
                        if 755 <= w['x0'] < 805 and quota is None and re.fullmatch(r'[A-Za-z()]+', w['text']):
                            quota = w['text']
                        if w['x0'] >= 850:
                            inst.append(w['text'])
                cat = norm_cat(quota) if quota else None
                instu = ' '.join(inst).upper()
                cid = next((cid for k, cid, nm in keys if k in instu), None)
                if air and cat and cid and cid != 'SKIP':
                    out[cid][cat].append(air)
    return out


def main():
    a = sys.argv[1:]
    pdf = a[0]
    year = int(a[a.index("--year") + 1])
    rnd = a[a.index("--round") + 1] if "--round" in a else "R1"
    dry = "--dry" in a

    keys = [(r["match_key"].upper(), r["dev_college_id"], r["college_name"])
            for r in csv.DictReader(open(MAP, encoding="utf-8"))]
    bycid = parse(pdf, keys)
    db = sqlite3.connect(DEV); cur = db.cursor()
    mbbs = cur.execute("SELECT id FROM Course WHERE name='MBBS'").fetchone()[0]

    if not dry:
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='AS')""", (year, rnd))
    nrows = 0; sample = []
    for cid, cats in bycid.items():
        for cat, airs in cats.items():
            op, clo = min(airs), robust_closing(airs)
            if len(sample) < 6:
                sample.append((cid[-6:], cat, f"{op}->{clo} (n={len(airs)})"))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("as_" + uuid.uuid4().hex[:18], year, rnd, cid, mbbs, cat, "STATE", op, clo, len(airs), os.path.basename(pdf)))
            nrows += 1
    print(f"AS {year}: colleges {len(bycid)} | rows {nrows}")
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry)")


if __name__ == "__main__":
    main()
