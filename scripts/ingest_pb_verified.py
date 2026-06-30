"""Ingest Punjab (BFUHS) state-quota MBBS cutoffs via a VERIFIED ordered match-key
map (data/pb_college_map.csv). NEET All-India-Rank based. GOVT_QUOTA only.

Two source formats:
  --mode cutoff  : "Final Cut Off" PDF rows  "<College> M.B.B.S. GOVT_QUOTA_<cat> <minMarks> <maxRank>"
                   -> closingRank = maxRank (NEET AIR), opening = same (only one rank published)
  --mode allot   : "Provisional Allotment" PDFs (candidate rows). Two layouts:
                   2024: ... <marks> <AIR> <catApplied> <College> M.B.B.S. GOVT_QUOTA_<cat>
                   2025: ... <marks> <AIR> <catApplied> <College> M.B.B.S. Govt. Quota <cat>
                   -> robust max AIR per (college, cat). Parsed by X-COORDINATE.

Category map: Open->OPEN, SC->SC, BC->OBC, EWS->EWS  (special quotas Bak./Br. Ar/
Defence/JK/RA/Sports/TA and MGT_/MINORITY_ quotas skipped). College matched to the
FIRST map row whose any key (| separated) is a substring (comma/space-insensitive);
rows ordered specific-first. Missing colleges (col_pb_*) are created.

Usage: ...python scripts/ingest_pb_verified.py <pdf> --year YYYY --mode cutoff|allot [--dry]
"""
import sqlite3, re, sys, os, csv, uuid
from collections import defaultdict
import pdfplumber

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
MAP = os.path.join(ROOT, "data", "pb_college_map.csv")
NOW = "2026-06-30T00:00:00.000Z"
CAT = {"open": "OPEN", "sc": "SC", "scheduled": "SC", "bc": "OBC",
       "backward": "OBC", "ews": "EWS"}


def _flat(s):
    return re.sub(r'\s+', ' ', s.upper().replace(',', ' ').replace('.', ' ')).strip()


def robust_closing(ranks):
    ranks = sorted(ranks); n = len(ranks)
    if n <= 3:
        return ranks[-1]
    q1 = ranks[n // 4]; q3 = ranks[(3 * n) // 4]
    fence = q3 + 1.5 * (q3 - q1)
    capped = [r for r in ranks if r <= fence]
    return max(capped) if capped else ranks[-1]


def load_map():
    rows = list(csv.DictReader(open(MAP, encoding="utf-8")))
    keys = []  # (flat_key, dev_id, type, name)
    for r in rows:
        for k in r["match_keys"].split("|"):
            keys.append((_flat(k), r["dev_college_id"], r["type"], r["college_name"]))
    return rows, keys


def match(name, keys):
    u = _flat(name)
    for fk, cid, typ, nm in keys:
        if fk in u:
            return cid, typ, nm
    return None, None, None


def norm_cat(raw):
    return CAT.get(raw.strip().lower().split()[0] if raw.strip() else "", None)


def parse_cutoff(pdf):
    # College M.B.B.S. GOVT_QUOTA_<cat> <minMarks> <maxRank>
    out = defaultdict(dict)  # collegeName -> cat -> closing
    rx = re.compile(r'^(.+?)\s+M\.B\.B\.S\.\s+GOVT_QUOTA_([A-Za-z][A-Za-z. ]*?)\s+(\d+)\s+(\d+)\s*$')
    cur_name = ""
    with pdfplumber.open(pdf) as d:
        for p in d.pages:
            for ln in (p.extract_text() or "").splitlines():
                m = rx.match(ln)
                if not m:
                    continue
                name = m.group(1).strip()
                cat = norm_cat(m.group(2))
                maxrank = int(m.group(4))
                if cat:
                    out[name][cat] = maxrank
    return out


MARKS_AIR = re.compile(r'\b(\d{1,3})\s+(\d{4,7})\b')


def parse_allot(pdf):
    # Text-based (robust across the 2023/2024/2025 layouts). Row shape:
    #   <Mno> [RegNo] <NEETRoll-10d> <Name...> <Marks<=720> <AIR-4to7d> [CatApplied] <College...> M.B.B.S. <QUOTA_CAT>
    out = defaultdict(lambda: defaultdict(list))  # collegeName -> cat -> [air]
    with pdfplumber.open(pdf) as d:
        for p in d.pages:
            for ln in (p.extract_text() or "").splitlines():
                if 'M.B.B.S' not in ln:
                    continue
                left, _, right = ln.partition('M.B.B.S')
                # quota + category (GOVT only)
                m = re.search(r'GOVT_QUOTA_([A-Za-z][A-Za-z. ]*)', right)
                if m:
                    cat = norm_cat(m.group(1))
                else:
                    m2 = re.search(r'Govt\.\s*Quota\s+([A-Za-z]+)', right)
                    cat = norm_cat(m2.group(1)) if m2 else None
                if not cat:
                    continue
                # AIR = the last marks(<=720)->air(4-7 digit) adjacent pair in the left part
                air = None; air_end = 0
                for mm in MARKS_AIR.finditer(left):
                    if int(mm.group(1)) <= 720:
                        air = int(mm.group(2)); air_end = mm.end()
                if not air:
                    continue
                # college = text after AIR, minus leading cat-applied (numbers/quotes/commas)
                tail = left[air_end:].strip()
                tail = re.sub(r"^[\d',. ]+", "", tail).strip()
                if tail:
                    out[tail][cat].append(air)
    return out


def main():
    a = sys.argv[1:]
    pdf = a[0]
    year = int(a[a.index("--year") + 1])
    mode = a[a.index("--mode") + 1]
    rnd = "R1"
    dry = "--dry" in a

    rows, keys = load_map()
    db = sqlite3.connect(DEV); cur = db.cursor()
    mbbs = cur.execute("SELECT id FROM Course WHERE name='MBBS'").fetchone()[0]

    if not dry:
        for r in rows:
            cid = r["dev_college_id"]
            if cid.startswith("col_pb_") and not cur.execute("SELECT 1 FROM College WHERE id=?", (cid,)).fetchone():
                cur.execute("""INSERT INTO College (id,name,type,stateId,feeBandDefault,isMinority,isDeemed,isCentral,createdAt,updatedAt)
                               VALUES (?,?,?,?,?,?,?,?,?,?)""",
                            (cid, r["college_name"], r["type"], "st_pb", "HIGH" if r["type"] == "PRIVATE" else "LOW", 0, 0, 0, NOW, NOW))
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='PB')""", (year, rnd))

    data = parse_cutoff(pdf) if mode == "cutoff" else parse_allot(pdf)
    # collapse by dev id
    bycid = defaultdict(dict) if mode == "cutoff" else defaultdict(lambda: defaultdict(list))
    unmatched = set()
    for name, cats in data.items():
        cid, typ, nm = match(name, keys)
        if not cid:
            unmatched.add(name); continue
        if mode == "cutoff":
            for cat, clo in cats.items():
                bycid[cid][cat] = max(bycid[cid].get(cat, 0), clo)
        else:
            for cat, airs in cats.items():
                bycid[cid][cat] += airs

    nrows = 0; sample = []
    for cid, cats in bycid.items():
        for cat, val in cats.items():
            if mode == "cutoff":
                opening = closing = val
            else:
                opening = min(val); closing = robust_closing(val)
            if len(sample) < 6:
                sample.append((cid[-6:], cat, f"{opening}->{closing}"))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("pb_" + uuid.uuid4().hex[:18], year, rnd, cid, mbbs, cat, "STATE", opening, closing, 0, os.path.basename(pdf)))
            nrows += 1
    print(f"PB {year} ({mode}): colleges {len(bycid)} | rows {nrows} | unmatched {sorted(unmatched)}")
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry)")


if __name__ == "__main__":
    main()
