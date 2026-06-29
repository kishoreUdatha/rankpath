"""Ingest Karnataka (KEA) state-quota MBBS cutoff ranks into CutoffSummary.

Source: cetonline.karnataka.gov.in KEA UG-NEET "MEDICAL/DENTAL CUTOFF RANK" PDFs.
Each college block: a header line "<seq> M<code> <College Name>" followed by a
24-column category table (1G 1K 1R 2AG ... GM GMK GMR SCG SCK SCR STG STK STR)
with one rank row per course-type (MBBS-GOVT., MBBS-PRIVATE, BDS-..., '--' = none).

Approximate category map (state categories -> predictor categories), per user choice:
  GM/GMK/GMR            -> OPEN
  1*/2A*/2B*/3A*/3B*    -> OBC   (all backward-class variants)
  SCG/SCK/SCR           -> SC
  STG/STK/STR           -> ST
Closing rank per mapped category = MAX (worst admitted) across its source columns
and across MBBS course-types. Ranks are treated as NEET All-India ranks.

Usage:
  ...python scripts/ingest_ka_cutoffs.py <pdf> --year 2024 --round R1 [--dry]
"""
import sqlite3, re, sys, os, uuid, datetime, difflib

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
NOW = "2026-06-29T00:00:00.000Z"

CATS = ["1G","1K","1R","2AG","2AK","2AR","2BG","2BK","2BR","3AG","3AK","3AR",
        "3BG","3BK","3BR","GM","GMK","GMR","SCG","SCK","SCR","STG","STK","STR"]
IDX = {c: i for i, c in enumerate(CATS)}
# Use only the base "General" (G) sub-pool of each category — a generic candidate
# competes there; K (Kannada-medium) and R (Rural) are special sub-reservations.
GCOLS = {
    "OPEN": ["GM"],
    "OBC":  ["1G", "2AG", "2BG", "3AG", "3BG"],  # backward-class general variants
    "SC":   ["SCG"],
    "ST":   ["STG"],
}

def dsp(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())
HDR = re.compile(r"^\s*\d+\s+([A-Z]\d{2,3})\s+(.+\S)\s*$")


def parse(pdf_path):
    import pdfplumber
    colleges = []  # (code, name, {category: closing})
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            headers = []
            for ln in text.splitlines():
                m = HDR.match(ln)
                if m and not ln.strip().startswith(("1G", "MBBS", "BDS")):
                    headers.append((m.group(1), m.group(2).strip()))
            tables = page.extract_tables() or []
            # collect rank rows (first cell starts with MBBS/BDS) grouped per table
            blocks = []
            for t in tables:
                ranks_by_cat = {}
                for row in t:
                    if not row: continue
                    lab = (row[0] or "").upper()
                    if lab.startswith("MBBS") or lab.startswith("BDS"):
                        vals = row[1:]
                        course = "MBBS" if lab.startswith("MBBS") else "BDS"
                        def cell(colname):
                            i = IDX[colname]
                            if i < len(vals):
                                v = re.sub(r"[^0-9]", "", vals[i] or "")
                                return int(v) if v else 0
                            return 0
                        for tcat, cols in GCOLS.items():
                            worst = max((cell(c) for c in cols), default=0)
                            if worst > 0:
                                key = (course, tcat)
                                ranks_by_cat[key] = max(ranks_by_cat.get(key, 0), worst)
                if ranks_by_cat:
                    blocks.append(ranks_by_cat)
            # pair college headers with rank blocks in order
            for (code, name), blk in zip(headers, blocks):
                colleges.append((code, name, blk))
    return colleges


def main():
    args = sys.argv[1:]
    pdf = args[0]
    year = int(args[args.index("--year") + 1]) if "--year" in args else 2024
    rnd = args[args.index("--round") + 1] if "--round" in args else "R1"
    dry = "--dry" in args

    parsed = parse(pdf)
    print(f"parsed {len(parsed)} college blocks")

    db = sqlite3.connect(DEV)
    cur = db.cursor()
    ka = [(cid, n) for cid, n in cur.execute(
        "SELECT c.id,c.name FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='KA'")]
    kamap = [(dsp(n), cid, n) for cid, n in ka]
    courses = {c: cid for cid, c in cur.execute("SELECT id,name FROM Course")}

    # Global one-to-one assignment: each KEA college <-> at most one dev college.
    pairs = []  # (score, parsed_idx, cid, dn)
    for pi, (code, name, blk) in enumerate(parsed):
        k = dsp(name)
        if not k:
            continue
        for dk, cid, dn in kamap:
            if not dk:
                continue
            score = 0.95 if (k in dk or dk in k) else difflib.SequenceMatcher(None, k, dk).ratio()
            if score >= 0.62:
                pairs.append((score, pi, cid, dn))
    pairs.sort(key=lambda x: x[0], reverse=True)
    assign = {}                # parsed_idx -> (cid, dn)
    used_dev = set()
    for score, pi, cid, dn in pairs:
        if pi in assign or cid in used_dev:
            continue
        assign[pi] = (cid, dn); used_dev.add(cid)

    if not dry:
        cur.execute("""DELETE FROM CutoffSummary WHERE quota='STATE' AND year=? AND round=?
                       AND collegeId IN (SELECT c.id FROM College c JOIN State s ON s.id=c.stateId WHERE s.code='KA')""",
                    (year, rnd))

    rows = 0
    sample = []
    for pi, (code, name, blk) in enumerate(parsed):
        if pi not in assign:
            continue
        cid, dn = assign[pi]
        for (course, cat), closing in blk.items():
            crsid = courses.get(course)
            if not crsid:
                continue
            if len(sample) < 6:
                sample.append((dn[:32], course, cat, closing))
            if not dry:
                cur.execute("""INSERT INTO CutoffSummary (id,year,round,collegeId,courseId,category,quota,openingRank,closingRank,allotmentCount,sourceFiles)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            ("ka_"+uuid.uuid4().hex[:18], year, rnd, cid, crsid, cat, "STATE", None, closing, 0, os.path.basename(pdf)))
            rows += 1
    print(f"matched {len(assign)} / {len(parsed)} | cutoff rows {rows}")
    print("sample:", sample)
    if not dry:
        db.commit(); print("COMMITTED")
    else:
        print("(dry run)")


if __name__ == "__main__":
    main()
