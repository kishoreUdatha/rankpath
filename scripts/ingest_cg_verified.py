"""Ingest Chhattisgarh (DME, cgdme.admissions.nic.in NIC eCounselling) state-quota
MBBS cutoffs via a VERIFIED key->college map (data/cg_college_map.csv). NEET-AIR.

Source: CG-NEET-UG "Provisional Seat Allotment List Round-1" PDFs (cdnbbsr CDN).
Candidate rows (institute name wraps across lines). Round-agnostic parse:
  a data row has quota 'GQ' + a 10-digit NEET roll; the trailing integers end
  "<AIR> <Score<=720> <CGStateRank>" so AIR = 3rd-from-last integer. Institute =
  words in x[95,278) gathered from a window of lines around the data row.
Keep quota GQ (Govt/state). Allotted-category prefix map:
  UR/OP->OPEN, OBC->OBC, SC->SC, ST->ST, SP(Special ST)->ST, EW->EWS.
Closing per (college,category) = robust max AIR (IQR fence). Govt colleges only
(matched to canonical AIQ-bearing dev ids); private colleges left unmatched.

Usage: ...python scripts/ingest_cg_verified.py <pdf> --year YYYY [--round R1] [--dry]
"""
import sqlite3, re, sys, os, csv, uuid
from collections import defaultdict
import pdfplumber

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "cg_college_map.csv")
CATP = {"UR": "OPEN", "OP": "OPEN", "OBC": "OBC", "SC": "SC", "ST": "ST", "SP": "ST", "EW": "EWS"}
# only the general "No Class" (-NC) seats per category; skip horizontal special
# sub-quotas (-F female / -FF freedom-fighter / -EX ex-serviceman / -PWD) which
# close at far worse ranks and would inflate the category cutoff.
CATRX = re.compile(r'\b(UR|OP|OBC|SC|ST|SP|EW)-NC\b')


def robust_closing(ranks):
    ranks = sorted(ranks); n = len(ranks)
    if n <= 3:
        return ranks[-1]
    q1 = ranks[n // 4]; q3 = ranks[(3 * n) // 4]
    fence = q3 + 1.5 * (q3 - q1)
    capped = [r for r in ranks if r <= fence]
    return max(capped) if capped else ranks[-1]


def parse(pdf, keys):
    # STICKY current-college: colleges appear in contiguous blocks, so track the
    # current college (updated whenever a map key appears in the institute column)
    # and attribute each GQ data row to it. Immune to header noise / name wrapping.
    keys_up = [(k.upper(), cid) for k, cid, nm in keys]
    out = defaultdict(lambda: defaultdict(list))  # dev_cid -> cat -> [air]
    with pdfplumber.open(pdf) as d:
        current = None
        for page in d.pages:
            rows = defaultdict(list)
            for w in page.extract_words():
                rows.setdefault(round(w['top']), []).append(w)
            for t in sorted(rows):
                ws = sorted(rows[t], key=lambda x: x['x0'])
                insttext = ' '.join(w['text'] for w in ws if 95 <= w['x0'] < 278).upper()
                for k, cid in keys_up:
                    if k in insttext:
                        current = cid
                        break
                line = ' '.join(w['text'] for w in ws)
                if 'GQ' not in line.split() or not re.search(r'\b\d{10}\b', line) or not current or current == 'SKIP':
                    continue
                m = CATRX.search(line)
                ints = [int(x) for x in re.findall(r'\b(\d{1,7})\b', line)]
                if m and len(ints) >= 3 and ints[-2] <= 720:
                    out[current][CATP[m.group(1)]].append(ints[-3])
    return out


def main():
    a = sys.argv[1:]
    pdf = a[0]
    year = int(a[a.index("--year") + 1])
    rnd = a[a.index("--round") + 1] if "--round" in a else "R1"
    dry = "--dry" in a

    keys = [(r["match_key"], r["dev_college_id"], r["college_name"])
            for r in csv.DictReader(open(MAP, encoding="utf-8"))]
    bycid = parse(pdf, keys)
    db = sqlite3.connect(DEV); cur = db.cursor()
    mbbs = cur.execute("SELECT id FROM Course WHERE name='MBBS'").fetchone()[0]

    if not dry:
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='CG')""", (year, rnd))

    nrows = 0; sample = []
    for cid, cats in bycid.items():
        for cat, airs in cats.items():
            op, clo = min(airs), robust_closing(airs)
            if len(sample) < 6:
                sample.append((cid[-6:], cat, f"{op}->{clo} (n={len(airs)})"))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("cg_" + uuid.uuid4().hex[:18], year, rnd, cid, mbbs, cat, "STATE", op, clo, len(airs), os.path.basename(pdf)))
            nrows += 1
    print(f"CG {year}: colleges {len(bycid)} | rows {nrows}")
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry)")


if __name__ == "__main__":
    main()
