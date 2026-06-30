"""Ingest Maharashtra (State CET Cell) state-quota (85% State Quota) MBBS cutoffs
via a VERIFIED code->college map (data/mh_college_map.csv). NEET All-India-Rank based.

Source: medical<year>.mahacet.org "Cut off NEET UG" PDF -
  "Quotawise List of First & Last Admitted Candidates In M.B.B.S." tables.
  Per college (5-digit code) two rows: "A :" = AIR (First/Last per category),
  "M :" = NEET marks. We take the AIR row: First=opening, Last=closing.

Columns parsed by X-COORDINATE against the "F L F L ..." sub-header anchors
(handles blank cells in private-college rows). Category map:
  OPEN->OPEN, EWS->EWS, OBC->OBC, SC->SC, ST->ST  (state buckets SEBC/VJ/NT skipped).

Usage: .venv-etl/Scripts/python.exe scripts/ingest_mh_verified.py <cutoff_pdf> --year 2024 [--round R-FINAL] [--dry]
"""
import sqlite3, re, sys, os, csv, uuid
import pdfplumber

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "mh_college_map.csv")
CATS = ['SC', 'ST', 'VJ', 'NT1', 'NT2', 'NT3', 'OBC', 'SEBC', 'EWS', 'OPEN']
KEEP = {'OPEN': 'OPEN', 'EWS': 'EWS', 'OBC': 'OBC', 'SC': 'SC', 'ST': 'ST'}


def line_group(words):
    lines = {}
    for w in words:
        lines.setdefault(round(w['top'] / 3.0), []).append(w)
    return [sorted(v, key=lambda x: x['x0']) for k, v in sorted(lines.items())]


CAT_HEADERS = {'SC', 'ST', 'VJ', 'NT1', 'NT2', 'NT3', 'OBC', 'SEBC', 'EWS',
               'OPEN', 'D1', 'D2', 'D3', 'PH', 'MKB', 'NRI'}


def parse(pdf):
    out = {}  # code -> {cat: (first, last)}
    with pdfplumber.open(pdf) as doc:
        for page in doc.pages:
            txt = page.extract_text() or ""
            if 'M.B.B.S.' not in txt:
                continue
            lines = line_group(page.extract_words())
            # category header row: most tokens drawn from CAT_HEADERS, incl OPEN+OBC
            cathdr = None
            for ln in lines:
                ct = [w for w in ln if w['text'] in CAT_HEADERS]
                if len(ct) >= 8 and any(w['text'] == 'OPEN' for w in ct):
                    cathdr = [((w['x0'] + w['x1']) / 2, w['text']) for w in ct]
                    break
            # F/L sub-header anchors
            anchors = None
            for ln in lines:
                fl = [w for w in ln if w['text'] in ('F', 'L')]
                if len(fl) >= 16:
                    anchors = [((w['x0'] + w['x1']) / 2, w['text']) for w in fl]
                    break
            if not anchors or not cathdr:
                continue
            # assign each F/L anchor to nearest category-header by x
            labels = []
            for x, t in anchors:
                cat = min(cathdr, key=lambda c: abs(c[0] - x))[1]
                labels.append((x, cat, t))
            for ln in lines:
                txt2 = ' '.join(w['text'] for w in ln)
                m = re.match(r'^\s*\d+\s+(\d{5})\s+', txt2)
                if not m:
                    continue
                colon = [w for w in ln if w['text'] == ':']
                ax = colon[0]['x1'] if colon else 0
                cell = {}
                for w in ln:
                    if w['x0'] <= ax or not re.fullmatch(r'\d+', w['text']):
                        continue
                    xc = (w['x0'] + w['x1']) / 2
                    best = min(labels, key=lambda L: abs(L[0] - xc))
                    if abs(best[0] - xc) < 14:
                        cell[(best[1], best[2])] = int(w['text'])
                code = m.group(1)
                rec = out.setdefault(code, {})
                for cat in KEEP:
                    f = cell.get((cat, 'F')); l = cell.get((cat, 'L'))
                    if l is not None:
                        rec[cat] = (f if f is not None else l, l)
    return out


def main():
    a = sys.argv[1:]
    pdf = a[0]
    year = int(a[a.index("--year") + 1]) if "--year" in a else 2024
    rnd = a[a.index("--round") + 1] if "--round" in a else "R-FINAL"
    dry = "--dry" in a

    cmap = {r["mh_code"]: r["dev_college_id"] for r in csv.DictReader(open(MAP, encoding="utf-8"))}
    data = parse(pdf)
    db = sqlite3.connect(DEV); cur = db.cursor()
    mbbs = cur.execute("SELECT id FROM Course WHERE name='MBBS'").fetchone()[0]

    if not dry:
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='MH')""",
                    (year, rnd))
    mapped = rows = 0; unmapped = []
    sample = []
    for code, cats in data.items():
        cid = cmap.get(code)
        if not cid:
            unmapped.append(code); continue
        mapped += 1
        for cat, (op, clo) in cats.items():
            if len(sample) < 8:
                sample.append((code, cat, f"{op}->{clo}"))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("mh_" + uuid.uuid4().hex[:18], year, rnd, cid, mbbs, cat, "STATE", op, clo, 0, os.path.basename(pdf)))
            rows += 1
    print(f"MH {year} {rnd}: mapped {mapped}/{len(cmap)} map codes | parsed-but-unmapped {len(unmapped)} (private/skipped) | rows {rows}")
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
