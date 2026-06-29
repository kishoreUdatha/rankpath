"""Parse NTRUHS (Andhra Pradesh) MBBS college-wise allotment PDFs and ingest as
state-quota data. PII (names) is dropped — we keep only college, NEET rank, seat
category, quota=STATE, state=AP. Cutoff key uses the SEAT category (from the
allotment string 'CODE - MBBS - REGION - SEATCAT - GENDER').
"""
import sqlite3, re, hashlib
from pathlib import Path
import pdfplumber

DB = r'D:\Smartgrow Projects\rankpath\data\rankpath.db'
FILES = [
    ('R1', r'D:\Smartgrow Projects\rankpath\data\raw\ntruhs\2025\mbbs_2025_phase_i_college_wise_allotments.pdf'),
    ('R2', r'D:\Smartgrow Projects\rankpath\data\raw\ntruhs\2025\mbbs_2025_cq_collegewise_allotments_phase_ii.pdf'),
    ('R3', r'D:\Smartgrow Projects\rankpath\data\raw\ntruhs\2025\mbbs_cq_2025_26_revised_college_wise_allotments_under_p.pdf'),
]
COL_RX = re.compile(r'(medical college|institute of medical|college of|govt|government|medical sciences|institute of med)', re.I)
DATA_RX = re.compile(r'^\d+\s+(\d{2,7})\s+\d{6,}')
# allotment detail: CODE - MBBS - REGION - SEATCAT - GENDER
ALLOT_RX = re.compile(r'-\s*MBBS\s*-\s*[A-Z]+\s*-\s*([A-Z]{2,4})\s*-\s*[A-Z]', re.I)
CATMAP = {'OC': 'OPEN', 'EWS': 'EWS', 'SC': 'SC', 'ST': 'ST',
          'BCA': 'BC-A', 'BCB': 'BC-B', 'BCC': 'BC-C', 'BCD': 'BC-D', 'BCE': 'BC-E'}


def parse_file(round_, path):
    rows = []
    college = None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for ln in (page.extract_text() or '').split('\n'):
                ln = ln.strip()
                if not ln:
                    continue
                dm = DATA_RX.match(ln)
                if dm:
                    am = ALLOT_RX.search(ln)
                    if not am or not college:
                        continue  # not allotted / no college context
                    seat = am.group(1).upper()
                    cat = CATMAP.get(seat)
                    if not cat:
                        continue
                    rows.append((college, int(dm.group(1)), cat))
                elif COL_RX.search(ln) and 'Allotment List' not in ln and 'University of Health' not in ln:
                    college = re.sub(r'\s+', ' ', ln).strip()
    return rows


def main():
    cx = sqlite3.connect(DB); c = cx.cursor()
    col_ids = {r[1]: r[0] for r in c.execute('SELECT id, name FROM "College"')}
    crs_ids = {r[1]: r[0] for r in c.execute('SELECT id, name FROM "Course"')}
    mbbs_id = crs_ids.get('MBBS')
    if not mbbs_id:
        mbbs_id = 'crs_mbbs'; c.execute('INSERT OR IGNORE INTO "Course"(id,name) VALUES(?,?)', (mbbs_id, 'MBBS'))

    now = '2026-06-27T00:00:00'
    all_rows = []
    for round_, path in FILES:
        rs = parse_file(round_, path)
        print(f'{round_}: parsed {len(rs):,} allotment rows from {Path(path).name[:45]}')
        for college, rank, cat in rs:
            all_rows.append((round_, college, rank, cat, Path(path).name))

    new_cols = []
    ins = []
    for i, (round_, college, rank, cat, src) in enumerate(all_rows):
        # AP college names are distinct; prefix to avoid clashing with MCC college names
        nm = college
        if nm not in col_ids:
            cid = 'col_ap_' + hashlib.sha1(nm.encode()).hexdigest()[:12]
            col_ids[nm] = cid
            new_cols.append((cid, nm, 'AP', 'GOVT', now, now))
        rrh = hashlib.sha1(f'AP|{round_}|{college}|{cat}|{rank}|{i}'.encode()).hexdigest()
        ins.append((
            'altap_' + rrh[:14], 2025, round_, 'NTRUHS', col_ids[nm], mbbs_id,
            college, 'MBBS', cat, cat, 'STATE', cat, 'STATE', rank, 'AP', 'GOVT', 'UNKNOWN',
            src, rrh, now,
        ))
    if new_cols:
        c.executemany('INSERT OR IGNORE INTO "College"(id,name,state,type,"createdAt","updatedAt") VALUES(?,?,?,?,?,?)', new_cols)
    c.executemany('''INSERT OR IGNORE INTO "Allotment"
        (id,year,round,"authorityCode","collegeId","courseId",
         "rawInstituteName","rawCourse","rawSeatCategory","rawCandidateCategory","rawQuota",
         "normalizedCategory","normalizedQuota","candidateRank",state,"collegeType","feeBand",
         "sourceFile","rawRowHash","createdAt")
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', ins)
    cx.commit()
    print(f'\nnew AP colleges: {len(new_cols)} | AP allotment rows inserted: {len(ins)}')

    # rebuild CutoffSummary
    c.execute('DROP TABLE IF EXISTS "CutoffSummary"')
    c.execute('''CREATE TABLE "CutoffSummary" (
      "id" TEXT PRIMARY KEY,"year" INTEGER NOT NULL,"round" TEXT NOT NULL,
      "collegeId" TEXT NOT NULL,"courseId" TEXT NOT NULL,"category" TEXT NOT NULL,"quota" TEXT NOT NULL,
      "openingRank" INTEGER,"closingRank" INTEGER NOT NULL,"allotmentCount" INTEGER NOT NULL,"sourceFiles" TEXT)''')
    agg = c.execute('''SELECT year,round,"collegeId","courseId","normalizedCategory","normalizedQuota",
        MIN("candidateRank"),MAX("candidateRank"),COUNT(*),GROUP_CONCAT(DISTINCT "sourceFile")
        FROM "Allotment"
        WHERE "collegeId" IS NOT NULL AND "courseId" IS NOT NULL
          AND "normalizedCategory" IS NOT NULL AND "normalizedQuota" IS NOT NULL AND "candidateRank" IS NOT NULL
        GROUP BY year,round,"collegeId","courseId","normalizedCategory","normalizedQuota"''').fetchall()
    c.executemany('INSERT INTO "CutoffSummary" VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                  [(f'cut_{i:08d}', *a) for i, a in enumerate(agg)])
    cx.commit()

    print()
    print('=== DB totals ===')
    for t in ('Allotment', 'College', 'CutoffSummary'):
        print(f'  {t:14s}: {c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]:,}')
    print('  AP (STATE) allotments:', c.execute("SELECT COUNT(*) FROM \"Allotment\" WHERE state='AP' AND \"normalizedQuota\"='STATE'").fetchone()[0])
    print('  AP CutoffSummary rows:', c.execute("SELECT COUNT(*) FROM \"CutoffSummary\" cs JOIN \"College\" col ON col.id=cs.\"collegeId\" WHERE col.state='AP' AND cs.quota='STATE'").fetchone()[0])
    print()
    print('=== sample AP cutoffs (Phase-I / R1) ===')
    for r in c.execute('''SELECT cs.category,cs."closingRank",cs."allotmentCount",col.name
       FROM "CutoffSummary" cs JOIN "College" col ON col.id=cs."collegeId"
       WHERE col.state='AP' AND cs.quota='STATE' AND cs.round='R1' AND col.name LIKE '%Nellore%'
       ORDER BY cs.category'''):
        print(f'   {r[0]:5} close={r[1]:>7} n={r[2]:>3}  {r[3][:38]}')
    cx.close()


if __name__ == '__main__':
    main()
