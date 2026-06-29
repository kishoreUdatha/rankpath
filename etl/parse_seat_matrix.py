"""Ingest seat-matrix data into the SeatMatrix table.

Two modes:

  --pdf-dir <dir>     Parse official MCC / state seat-matrix PDFs (one or many)
                      into normalized seat rows. Each table row is expected to
                      carry: institute, course, quota/category, seats.
                      (Use this when you have the official seat-matrix PDFs.)

  --from-cutoffs      Populate SeatMatrix from the already-ingested
                      CutoffSummary.allotmentCount (seats ALLOTTED per
                      year/round/quota/category). Runs immediately on dev.db.
                      This is a proxy for intake, not the sanctioned matrix.

Run:
  .venv-etl/Scripts/python.exe etl/parse_seat_matrix.py --from-cutoffs
  .venv-etl/Scripts/python.exe etl/parse_seat_matrix.py --pdf-dir data/seat_matrix
"""
import sqlite3, os, sys, re, uuid, datetime, glob

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
NOW = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")

# ---- category / quota normalisation (shared with the allotment parser) ----
def norm_cat(s):
    s = (s or "").upper().strip()
    s = re.sub(r"\bGEN(ERAL)?\b", "OPEN", s)
    for k in ["OPEN", "EWS", "OBC", "SC", "ST"]:
        if k in s:
            return k
    m = re.search(r"BC[-\s]?([A-E])", s)
    if m:
        return "BC-" + m.group(1)
    return s or "OPEN"

def norm_quota(s):
    s = (s or "").upper().strip()
    if "AIQ" in s or "ALL INDIA" in s: return "AIQ"
    if "STATE" in s: return "STATE"
    if "DEEM" in s: return "DEEMED"
    if "NRI" in s: return "NRI"
    if "ESIC" in s: return "ESIC_IP"
    if "MANAG" in s: return "MGMT"
    return s or "AIQ"


def _seat_id():
    return "seat_" + uuid.uuid4().hex[:20]


def from_cutoffs(db):
    """SeatMatrix <- CutoffSummary.allotmentCount (seats allotted)."""
    db.execute("DELETE FROM SeatMatrix")
    rows = db.execute(
        """SELECT year, round, collegeId, courseId, quota, category, allotmentCount
           FROM CutoffSummary WHERE allotmentCount > 0"""
    ).fetchall()
    n = 0
    for yr, rnd, cid, crs, quota, cat, seats in rows:
        db.execute(
            """INSERT OR REPLACE INTO SeatMatrix
               (id, year, round, collegeId, courseId, quota, category, seats, sourceFile)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (_seat_id(), yr, rnd, cid, crs, quota, cat, int(seats), "derived:allotments"),
        )
        n += 1
    db.commit()
    print(f"from-cutoffs: wrote {n} SeatMatrix rows (seats = allotted; proxy for intake)")


def keyn(s):
    """de-space + drop the (NNNNNN) institute code for name matching."""
    s = re.sub(r"\(\d+\)", "", s or "")
    return re.sub(r"[^a-z0-9]", "", s.lower())

def header_category(h):
    """Map a wide seat-matrix column header to a base category (PwD folded in)."""
    h = (h or "").lower().replace("\n", " ")
    if "ews" in h: return "EWS"
    if "obc" in h: return "OBC"
    if re.search(r"\bsc\b", h) or h.strip().startswith("sc"): return "SC"
    if re.search(r"\bst\b", h) or h.strip().startswith("st"): return "ST"
    if "open" in h or "gen" in h: return "OPEN"
    return None

def sm_quota(q):
    q = (q or "").lower()
    if "deemed" in q or "paid" in q: return "DEEMED"
    if "all india" in q or "aiq" in q: return "AIQ"
    if "esi" in q: return "ESIC_IP"
    if "nri" in q: return "NRI"
    return "AIQ"

def course_of(program, courses, default):
    p = (program or "").upper()
    if "BDS" in p: return courses.get("BDS", default)
    if "NURS" in p: return courses.get("BSC_NURSING") or courses.get("BSC NURSING") or default
    return courses.get("MBBS", default)


def from_pdfs(db, pdf_dir):
    try:
        import pdfplumber
    except ImportError:
        sys.exit("pdfplumber not installed in this venv — pip install pdfplumber")

    files = sorted(glob.glob(os.path.join(pdf_dir, "*.pdf")))
    if not files:
        print(f"No PDFs found in {pdf_dir}. Drop official seat-matrix PDFs there and re-run.")
        return

    coll = {keyn(n): cid for cid, n in db.execute("SELECT id, name FROM College")}
    courses = {c.upper(): cid for cid, c in db.execute("SELECT id, name FROM Course")}
    default_course = courses.get("MBBS") or next(iter(courses.values()), None)

    # Real intake matrices fully replace whatever is in SeatMatrix (idempotent re-runs).
    db.execute("DELETE FROM SeatMatrix")

    total, unmatched = 0, 0
    for path in files:
        base = os.path.basename(path)
        ym = re.search(r"(20\d{2})", base); year = int(ym.group(1)) if ym else 0
        rm = re.search(r"r(?:ound)?\s*([1-9])", base, re.I); rnd = f"R{rm.group(1)}" if rm else "R1"
        rows_file = 0
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                for table in page.extract_tables() or []:
                    if not table:
                        continue
                    # find the header row (has Institute + TotalSeats)
                    hidx = None
                    for i, r in enumerate(table[:3]):
                        joined = " ".join((c or "").lower() for c in r)
                        flat = re.sub(r"\s", "", joined)
                        if "institute" in flat and "totalseats" in flat:
                            hidx = i; break
                    if hidx is None:
                        continue
                    header = table[hidx]
                    ci = next((j for j, h in enumerate(header) if "institute" in (h or "").lower()), None)
                    cp = next((j for j, h in enumerate(header) if re.search(r"program|course|branch", (h or "").lower())), None)
                    cq = next((j for j, h in enumerate(header) if "quota" in (h or "").lower()), None)
                    cat_cols = {j: header_category(h) for j, h in enumerate(header) if header_category(h)}
                    if ci is None or not cat_cols:
                        continue
                    for row in table[hidx + 1:]:
                        if not row or len(row) <= ci or not (row[ci] or "").strip():
                            continue
                        cid = coll.get(keyn(row[ci]))
                        if not cid:
                            unmatched += 1
                            continue
                        crs = course_of(row[cp] if cp is not None else "", courses, default_course)
                        quota = sm_quota(row[cq] if cq is not None else "")
                        agg = {}
                        for j, cat in cat_cols.items():
                            if j < len(row):
                                v = re.sub(r"[^0-9]", "", row[j] or "")
                                if v:
                                    agg[cat] = agg.get(cat, 0) + int(v)
                        for cat, seats in agg.items():
                            if seats <= 0:
                                continue
                            # merge if the same (year,round,college,course,quota,category) already loaded
                            ex = db.execute(
                                "SELECT id, seats FROM SeatMatrix WHERE year=? AND round=? AND collegeId=? AND courseId=? AND quota=? AND category=?",
                                (year, rnd, cid, crs, quota, cat)).fetchone()
                            if ex:
                                db.execute("UPDATE SeatMatrix SET seats=? WHERE id=?", (ex[1] + seats, ex[0]))
                            else:
                                db.execute(
                                    """INSERT INTO SeatMatrix (id, year, round, collegeId, courseId, quota, category, seats, sourceFile)
                                       VALUES (?,?,?,?,?,?,?,?,?)""",
                                    (_seat_id(), year, rnd, cid, crs, quota, cat, seats, base))
                            total += 1
                            rows_file += 1
        print(f"  {base}: +{rows_file} seat rows")
    db.commit()
    print(f"from-pdfs: wrote {total} official SeatMatrix rows from {len(files)} file(s); {unmatched} institute rows unmatched")


def main():
    db = sqlite3.connect(DEV)
    if "--from-cutoffs" in sys.argv:
        from_cutoffs(db)
    elif "--pdf-dir" in sys.argv:
        d = sys.argv[sys.argv.index("--pdf-dir") + 1]
        from_pdfs(db, d)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
