"""Ingest the fully-clean (quota-token-removal) 2024 R3 rows, replacing the
earlier partial 745-row R3 load, then rebuild CutoffSummary."""
import sqlite3, hashlib
import pandas as pd

DB = r'D:\Smartgrow Projects\rankpath\data\rankpath.db'
PARQUET = r'D:\Smartgrow Projects\rankpath\data\normalized\_r3_2024_clean.parquet'


def main():
    df = pd.read_parquet(PARQUET)
    r3 = df[(df['round'] == 'R3') & df.institute_name.notna() & (df.institute_name.str.len() > 3)
            & df.candidate_rank.notna() & df.normalized_quota.notna()].copy()
    print(f'clean R3 rows to ingest: {len(r3):,}  (with category: {int(r3.normalized_category.notna().sum()):,})')

    cx = sqlite3.connect(DB); c = cx.cursor()
    before = c.execute("SELECT COUNT(*) FROM \"Allotment\" WHERE year=2024 AND round='R3'").fetchone()[0]
    c.execute("DELETE FROM \"Allotment\" WHERE year=2024 AND round='R3'")
    print(f'removed prior 2024 R3 rows: {before}')

    col_ids = {r[1]: r[0] for r in c.execute('SELECT id, name FROM "College"')}
    crs_ids = {r[1]: r[0] for r in c.execute('SELECT id, name FROM "Course"')}

    def course_canon(nm):
        s = str(nm).lower()
        return 'MBBS' if 'mbbs' in s else ('BDS' if 'bds' in s else (str(nm) or 'MBBS'))

    now = '2026-06-27T00:00:00'
    new_cols, new_crs, rows = [], [], []
    for _, r in r3.iterrows():
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
            'altr3_' + str(r['raw_row_hash'])[:14], 2024, 'R3', 'MCC',
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
    print(f'new colleges: {len(new_cols)} | rows offered: {len(rows)}')

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
    print('  2024 R3 Allotment:', c.execute("SELECT COUNT(*) FROM \"Allotment\" WHERE year=2024 AND round='R3'").fetchone()[0])
    print('  2024 R3 CutoffSummary:', c.execute("SELECT COUNT(*) FROM \"CutoffSummary\" WHERE year=2024 AND round='R3'").fetchone()[0])
    print('  2024 R3 with category:', c.execute("SELECT COUNT(*) FROM \"Allotment\" WHERE year=2024 AND round='R3' AND \"normalizedCategory\" IS NOT NULL").fetchone()[0])
    cx.close()


if __name__ == '__main__':
    main()
