"""Ingest NTRUHS (AP) MBBS state-quota allotments for 2023, 2024, 2025 — unified
parser across the three differing allotment-string formats. Drops PII; uses SEAT
category; closing rank = p90 (robust to special-reservation outliers)."""
import sqlite3, re, hashlib
from pathlib import Path
import pdfplumber

DB = r'D:\Smartgrow Projects\rankpath\data\rankpath.db'
R = r'D:\Smartgrow Projects\rankpath\data\raw\ntruhs'
FILES = [
    (2025,'R1', R+r'\2025\mbbs_2025_phase_i_college_wise_allotments.pdf'),
    (2025,'R2', R+r'\2025\mbbs_2025_cq_collegewise_allotments_phase_ii.pdf'),
    (2025,'R3', R+r'\2025\mbbs_cq_2025_26_revised_college_wise_allotments_under_p.pdf'),
    (2024,'R1', R+r'\2024\mbbs_cq_R1.pdf'),
    (2024,'R2', R+r'\2024\mbbs_cq_R2.pdf'),
    (2024,'R3', R+r'\2024\mbbs_cq_R3.pdf'),
    (2023,'R1', R+r'\2023\mbbs_cq_R1.pdf'),
    (2023,'R2', R+r'\2023\mbbs_cq_R2.pdf'),
]
COL_RX = re.compile(r'(medical college|institute of medical|college of|govt|government|medical sciences|institute of med|university)', re.I)
DATA_RX = re.compile(r'^\d+\s+(\d{2,7})\s+\d{6,}')
GENDERED = re.compile(r'(OC|BC[_-]?[A-E]|SC\d?|ST\d?|EWS)[_-][GF](?![A-Z])', re.I)  # 2024/2023: _OC_F, BC_D_G
STANDALONE = re.compile(r'-\s(OC|BC[_-]?[A-E]|SC\d?|ST\d?|EWS)\s-', re.I)          # 2025: - OC -, - SC3 -


def seat_cat(line):
    m = GENDERED.search(line) or STANDALONE.search(line)
    if not m:
        return None
    raw = re.sub(r'[^A-Z0-9]', '', m.group(1).upper())   # BC-A->BCA, SC_3->SC3
    if raw.startswith('OC'):
        return 'OPEN'
    if raw.startswith('SC'):
        return 'SC'                       # SC / SC1 / SC2 / SC3 -> SC (2023/24 had aggregate SC)
    if raw.startswith('ST'):
        return 'ST'
    if raw.startswith('EWS'):
        return 'EWS'
    if raw.startswith('BC') and len(raw) >= 3:
        return 'BC-' + raw[2]             # BCA/BC-A -> BC-A
    return raw


def parse_file(path):
    rows, college = [], None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for ln in (page.extract_text() or '').split('\n'):
                ln = ln.strip()
                if not ln:
                    continue
                dm = DATA_RX.match(ln)
                if dm:
                    cat = seat_cat(ln)
                    if cat and college:
                        rows.append((college, int(dm.group(1)), cat))
                elif COL_RX.search(ln) and 'Allotment' not in ln and 'University of Health' not in ln and 'Note:' not in ln:
                    college = re.sub(r'\s+', ' ', ln).strip()
    return rows


def main():
    cx = sqlite3.connect(DB); c = cx.cursor()
    # wipe prior AP STATE allotments (re-ingesting cleanly)
    c.execute("DELETE FROM \"Allotment\" WHERE state='AP' AND \"normalizedQuota\"='STATE'")
    col_ids = {r[1]: r[0] for r in c.execute('SELECT id, name FROM "College"')}
    mbbs_id = c.execute("SELECT id FROM \"Course\" WHERE name='MBBS'").fetchone()[0]
    now = '2026-06-27T00:00:00'
    new_cols, ins = [], []
    per_year = {}
    for year, rnd, path in FILES:
        if not Path(path).exists():
            print(f'{year} {rnd}: MISSING {path}'); continue
        rs = parse_file(path)
        per_year[(year, rnd)] = len(rs)
        for i, (college, rank, cat) in enumerate(rs):
            if college not in col_ids:
                cid = 'col_ap_' + hashlib.sha1(college.encode()).hexdigest()[:12]
                col_ids[college] = cid
                new_cols.append((cid, college, 'AP', 'GOVT', now, now))
            rrh = hashlib.sha1(f'AP|{year}|{rnd}|{college}|{cat}|{rank}|{i}'.encode()).hexdigest()
            ins.append(('altap_'+rrh[:14], year, rnd, 'NTRUHS', col_ids[college], mbbs_id,
                        college, 'MBBS', cat, cat, 'STATE', cat, 'STATE', rank, 'AP', 'GOVT', 'UNKNOWN',
                        Path(path).name, rrh, now))
    if new_cols:
        c.executemany('INSERT OR IGNORE INTO "College"(id,name,state,type,"createdAt","updatedAt") VALUES(?,?,?,?,?,?)', new_cols)
    c.executemany('''INSERT OR IGNORE INTO "Allotment"
        (id,year,round,"authorityCode","collegeId","courseId","rawInstituteName","rawCourse",
         "rawSeatCategory","rawCandidateCategory","rawQuota","normalizedCategory","normalizedQuota",
         "candidateRank",state,"collegeType","feeBand","sourceFile","rawRowHash","createdAt")
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', ins)
    cx.commit()
    print('parsed rows per file:', {f'{y}-{r}': n for (y, r), n in per_year.items()})
    print(f'AP rows inserted: {len(ins):,} | new AP colleges: {len(new_cols)}')

    # rebuild CutoffSummary (whole table), then recompute AP closings to p90
    c.execute('DROP TABLE IF EXISTS "CutoffSummary"')
    c.execute('''CREATE TABLE "CutoffSummary"("id" TEXT PRIMARY KEY,"year" INTEGER NOT NULL,"round" TEXT NOT NULL,
      "collegeId" TEXT NOT NULL,"courseId" TEXT NOT NULL,"category" TEXT NOT NULL,"quota" TEXT NOT NULL,
      "openingRank" INTEGER,"closingRank" INTEGER NOT NULL,"allotmentCount" INTEGER NOT NULL,"sourceFiles" TEXT)''')
    agg = c.execute('''SELECT year,round,"collegeId","courseId","normalizedCategory","normalizedQuota",
        MIN("candidateRank"),MAX("candidateRank"),COUNT(*),GROUP_CONCAT(DISTINCT "sourceFile") FROM "Allotment"
        WHERE "collegeId" IS NOT NULL AND "courseId" IS NOT NULL AND "normalizedCategory" IS NOT NULL
          AND "normalizedQuota" IS NOT NULL AND "candidateRank" IS NOT NULL
        GROUP BY year,round,"collegeId","courseId","normalizedCategory","normalizedQuota"''').fetchall()
    c.executemany('INSERT INTO "CutoffSummary" VALUES (?,?,?,?,?,?,?,?,?,?,?)', [(f'cut_{i:08d}', *a) for i, a in enumerate(agg)])
    cx.commit()
    # p90 for AP STATE
    apcuts = c.execute('''SELECT cs.id,cs.year,cs.round,cs."collegeId",cs."courseId",cs.category,cs.quota
        FROM "CutoffSummary" cs JOIN "College" col ON col.id=cs."collegeId" WHERE col.state='AP' AND cs.quota='STATE' ''').fetchall()
    for cid, yr, rnd, col, crs, cat, q in apcuts:
        ranks = sorted(r[0] for r in c.execute('SELECT "candidateRank" FROM "Allotment" WHERE year=? AND round=? AND "collegeId"=? AND "courseId"=? AND "normalizedCategory"=? AND "normalizedQuota"=?', (yr, rnd, col, crs, cat, q)))
        if ranks:
            c.execute('UPDATE "CutoffSummary" SET "closingRank"=? WHERE id=?', (ranks[min(int(len(ranks)*0.9), len(ranks)-1)], cid))
    cx.commit()

    print()
    for t in ('Allotment', 'College', 'CutoffSummary'):
        print(f'  {t:14s}: {c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]:,}')
    print('  AP STATE allotments by year:', dict(c.execute("SELECT year,COUNT(*) FROM \"Allotment\" WHERE state='AP' AND \"normalizedQuota\"='STATE' GROUP BY year").fetchall()))
    print('  AP STATE cutoffs by year:', dict(c.execute("SELECT cs.year,COUNT(*) FROM \"CutoffSummary\" cs JOIN \"College\" col ON col.id=cs.\"collegeId\" WHERE col.state='AP' AND cs.quota='STATE' GROUP BY cs.year").fetchall()))
    print()
    print('=== Andhra MC, Visakhapatnam — OPEN closing by year (R1) ===')
    for r in c.execute('''SELECT cs.year,cs."closingRank",cs."allotmentCount" FROM "CutoffSummary" cs JOIN "College" col ON col.id=cs."collegeId"
        WHERE col.state='AP' AND cs.quota='STATE' AND cs.round='R1' AND cs.category='OPEN' AND col.name LIKE '%Andhra Medical%' ORDER BY cs.year'''):
        print(f'   {r[0]}: close={r[1]:>7}  n={r[2]}')
    cx.close()


if __name__ == '__main__':
    main()
