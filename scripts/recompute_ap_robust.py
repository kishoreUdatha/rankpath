"""Recompute AP STATE closing ranks with an outlier-robust rule that works at any
sample size (p90 fails for small n, where its index = max). Closing = max rank
within an IQR fence (Q3 + 3*IQR, floored at median*3 so clustered legit data isn't
over-trimmed); for n<=3, cap at median*4. This removes AP's special-reservation
(PH/NCC/Sports/CAP) rank outliers without discarding legitimate merit closings."""
import sqlite3


def robust_closing(ranks):
    ranks = sorted(ranks)
    n = len(ranks)
    if n == 0:
        return None
    med = ranks[n // 2]
    if n <= 3:
        kept = [r for r in ranks if r <= med * 4]
        return max(kept) if kept else med
    q1 = ranks[int(n * 0.25)]
    q3 = ranks[int(n * 0.75)]
    fence = max(q3 + 3 * (q3 - q1), med * 3)
    kept = [r for r in ranks if r <= fence]
    return max(kept) if kept else ranks[-1]


def main():
    cx = sqlite3.connect(r'D:\Smartgrow Projects\rankpath\data\rankpath.db'); c = cx.cursor()
    apcuts = c.execute('''SELECT cs.id, cs.year, cs.round, cs."collegeId", cs."courseId", cs.category, cs.quota, cs."closingRank"
        FROM "CutoffSummary" cs JOIN "College" col ON col.id=cs."collegeId" WHERE col.state='AP' AND cs.quota='STATE' ''').fetchall()
    changed = 0
    big = []
    for cid, yr, rnd, col, crs, cat, q, old in apcuts:
        ranks = [r[0] for r in c.execute('SELECT "candidateRank" FROM "Allotment" WHERE year=? AND round=? AND "collegeId"=? AND "courseId"=? AND "normalizedCategory"=? AND "normalizedQuota"=?', (yr, rnd, col, crs, cat, q))]
        new = robust_closing(ranks)
        if new and new != old:
            c.execute('UPDATE "CutoffSummary" SET "closingRank"=? WHERE id=?', (new, cid))
            changed += 1
            if old - new > 50000:
                big.append((old, new, yr, cat, col))
    cx.commit()
    print(f'AP cutoffs recomputed (robust): {changed} changed')
    print(f'large corrections (old-new > 50k): {len(big)}')
    # show worst offenders fixed
    big.sort(key=lambda x: -(x[0]-x[1]))
    for old, new, yr, cat, col in big[:10]:
        nm = c.execute('SELECT name FROM "College" WHERE id=?', (col,)).fetchone()[0]
        print(f'   {old:>8} -> {new:>7}  {yr} {cat:5} {nm[:38]}')
    # sanity: any AP OPEN closing still > 200k?
    bad = c.execute('''SELECT COUNT(*) FROM "CutoffSummary" cs JOIN "College" col ON col.id=cs."collegeId"
        WHERE col.state='AP' AND cs.quota='STATE' AND cs."closingRank" > 200000''').fetchone()[0]
    print(f'\nAP cutoffs still >200k (should be ~0): {bad}')
    cx.close()


if __name__ == '__main__':
    main()
