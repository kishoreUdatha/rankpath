"""Clean-filter the recovered 2024 R3 rows and ingest into the SQLite DB, then
rebuild CutoffSummary. Only R3 rows whose quota is a recognised MCC quota phrase
are kept (this drops the long-name-institute 'bleed' rows where binning mixed
quota+institute), guaranteeing the institutes we load are clean.
"""
import sqlite3, re, hashlib
import pandas as pd

DB = r'D:\Smartgrow Projects\rankpath\data\rankpath.db'
PARQUET = r'D:\Smartgrow Projects\rankpath\data\normalized\_r3_2024_recovered.parquet'

KNOWN_QUOTAS = {
    'all india', 'open seat quota', 'deemed/paid seats quota', 'delhi university quota',
    'ip university quota', 'aligarh muslim university (amu) quota', 'muslim minority quota',
    'muslim women quota', 'muslim obc quota', 'muslim quota', 'muslim st quota',
    'non-resident indian', 'jamia internal quota', 'jain minority quota',
    'foreign country quota', 'employees state insurance scheme(esi)',
    'internal -puducherry ut domicile', 'b.sc nursing all india',
}


def norm(s):
    return re.sub(r'\s+', ' ', str(s)).strip().lower()


def main():
    df = pd.read_parquet(PARQUET)
    r3 = df[df['round'] == 'R3'].copy()
    print(f'R3 rows recovered: {len(r3):,}')
    r3['q'] = r3['quota'].map(norm)
    clean = r3[r3['q'].isin(KNOWN_QUOTAS)].copy()
    dropped = len(r3) - len(clean)
    print(f'clean R3 (known quota): {len(clean):,}   dropped(bleed): {dropped:,}')
    # also require a usable college + rank + normalized category/quota
    clean = clean[clean.institute_name.notna() & (clean.institute_name != '-')
                  & clean.candidate_rank.notna() & clean.normalized_quota.notna()].copy()
    print(f'clean R3 ingestable (college+rank+quota): {len(clean):,}')
    print(f'  with normalized category: {int(clean.normalized_category.notna().sum()):,}')

    cx = sqlite3.connect(DB)
    c = cx.cursor()

    # name->id maps from existing tables (reuse ids; create new where missing)
    col_ids = {row[1]: row[0] for row in c.execute('SELECT id, name FROM "College"')}
    crs_ids = {row[1]: row[0] for row in c.execute('SELECT id, name FROM "Course"')}

    def course_canon(nm):
        s = str(nm).lower()
        return 'MBBS' if 'mbbs' in s else ('BDS' if 'bds' in s else str(nm))

    now = '2026-06-27T00:00:00'
    new_cols, new_crs, rows = [], [], []
    for _, r in clean.iterrows():
        nm = r['institute_name']
        if nm not in col_ids:
            cid = 'col_r3_' + hashlib.sha1(nm.encode()).hexdigest()[:12]
            col_ids[nm] = cid
            new_cols.append((cid, nm, 'UNKNOWN', now, now))
        canon = course_canon(r.get('course'))
        if canon not in crs_ids:
            crsid = 'crs_r3_' + hashlib.sha1(canon.encode()).hexdigest()[:8]
            crs_ids[canon] = crsid
            new_crs.append((crsid, canon))
        rows.append((
            'alt_' + str(r['raw_row_hash'])[:16], 2024, 'R3', 'MCC',
            col_ids[nm], crs_ids[canon],
            r.get('institute_name'), r.get('course'), r.get('seat_category'),
            r.get('candidate_category'), r.get('quota'),
            r.get('normalized_category'), r.get('normalized_quota'),
            int(r['candidate_rank']), 'UNKNOWN', 'UNKNOWN',
            r.get('source_file'), str(r['raw_row_hash']), now,
        ))

    if new_cols:
        c.executemany('INSERT OR IGNORE INTO "College" (id,name,type,"createdAt","updatedAt") VALUES (?,?,?,?,?)', new_cols)
    if new_crs:
        c.executemany('INSERT OR IGNORE INTO "Course" (id,name) VALUES (?,?)', new_crs)
    c.executemany('''INSERT OR IGNORE INTO "Allotment"
        (id,year,round,"authorityCode","collegeId","courseId",
         "rawInstituteName","rawCourse","rawSeatCategory","rawCandidateCategory","rawQuota",
         "normalizedCategory","normalizedQuota","candidateRank","collegeType","feeBand",
         "sourceFile","rawRowHash","createdAt")
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', rows)
    cx.commit()
    print(f'new colleges: {len(new_cols)}  | Allotment rows inserted (pre-dedup): {len(rows)}')

    # rebuild CutoffSummary
    c.execute('DROP TABLE IF EXISTS "CutoffSummary"')
    c.execute('''CREATE TABLE "CutoffSummary" (
      "id" TEXT PRIMARY KEY, "year" INTEGER NOT NULL, "round" TEXT NOT NULL,
      "collegeId" TEXT NOT NULL, "courseId" TEXT NOT NULL,
      "category" TEXT NOT NULL, "quota" TEXT NOT NULL,
      "openingRank" INTEGER, "closingRank" INTEGER NOT NULL,
      "allotmentCount" INTEGER NOT NULL, "sourceFiles" TEXT )''')
    agg = c.execute('''
      SELECT year, round, "collegeId", "courseId", "normalizedCategory", "normalizedQuota",
             MIN("candidateRank"), MAX("candidateRank"), COUNT(*), GROUP_CONCAT(DISTINCT "sourceFile")
      FROM "Allotment"
      WHERE "collegeId" IS NOT NULL AND "courseId" IS NOT NULL
        AND "normalizedCategory" IS NOT NULL AND "normalizedQuota" IS NOT NULL
        AND "candidateRank" IS NOT NULL
      GROUP BY year, round, "collegeId", "courseId", "normalizedCategory", "normalizedQuota"
    ''').fetchall()
    c.executemany('INSERT INTO "CutoffSummary" VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                  [(f'cut_{i:08d}', *a) for i, a in enumerate(agg)])
    cx.commit()

    print()
    print('=== updated DB ===')
    for t in ('Allotment', 'College', 'Course', 'CutoffSummary'):
        print(f'  {t:14s}: {c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]:,}')
    print('  2024 R3 Allotment rows:', c.execute("SELECT COUNT(*) FROM \"Allotment\" WHERE year=2024 AND round='R3'").fetchone()[0])
    print('  2024 R3 CutoffSummary rows:', c.execute("SELECT COUNT(*) FROM \"CutoffSummary\" WHERE year=2024 AND round='R3'").fetchone()[0])
    cx.close()


if __name__ == '__main__':
    main()
