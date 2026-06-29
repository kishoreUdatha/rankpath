"""Clean + merge AP college name variants so the same college unifies across years.
Steps: decode (cid:NNN) ligatures, strip address tails, build an alnum fingerprint,
cluster by exact fingerprint + near-match (difflib ratio>=0.93). Dry-run prints the
plan; --apply re-points Allotment.collegeId, updates names, rebuilds CutoffSummary."""
import sqlite3, re, sys
from difflib import SequenceMatcher

DB = r'D:\Smartgrow Projects\rankpath\data\rankpath.db'
CID = {'415': 'ti'}  # observed ligature
ADDR_RX = re.compile(r'(d\.?no|survey|dist\b|district|po\b|principal|@|gmail|\d{3,}|village|marg|road|nagar|s\.?u\.?r\.?v\.?e\.?y)', re.I)


def decode(name):
    return re.sub(r'\(cid:(\d+)\)', lambda m: CID.get(m.group(1), ''), name)


def core(name):
    """Drop address-y comma segments, keep the college-identifying part."""
    n = decode(name)
    segs = [s.strip() for s in n.split(',')]
    keep = []
    for s in segs:
        if ADDR_RX.search(s):
            break
        keep.append(s)
    return ', '.join(keep) if keep else segs[0]


def fp(name):
    return re.sub(r'[^a-z0-9]', '', decode(name).lower())


def main(apply):
    cx = sqlite3.connect(DB); c = cx.cursor()
    aps = c.execute("SELECT id, name FROM \"College\" WHERE state='AP'").fetchall()
    # fingerprint per college (address-stripped)
    items = [(cid, name, re.sub(r'[^a-z0-9]', '', core(name).lower())) for cid, name in aps]

    # cluster: union by exact fp, then near-match (ratio>=0.93)
    parent = {cid: cid for cid, _, _ in items}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b):
        parent[find(a)] = find(b)
    for i in range(len(items)):
        for j in range(i+1, len(items)):
            a, b = items[i][2], items[j][2]
            if not a or not b:
                continue
            if a == b or SequenceMatcher(None, a, b).ratio() >= 0.93:
                union(items[i][0], items[j][0])

    clusters = {}
    for cid, name, f in items:
        clusters.setdefault(find(cid), []).append((cid, name))

    # canonical name = cleanest (decoded, no double spaces, prefer Title-ish, shortest core)
    def clean_name(name):
        n = re.sub(r'\s+', ' ', decode(name)).strip()
        return n
    merges = {c: cl for c, cl in clusters.items() if len(cl) > 1}
    print(f'AP colleges: {len(aps)}  ->  canonical clusters: {len(clusters)}  (merging {sum(len(v)-1 for v in merges.values())} duplicates)')
    print()
    print('=== merge plan (clusters with >1 variant) ===')
    canon_name, canon_id = {}, {}
    for root, cl in clusters.items():
        # canonical: the variant whose cleaned name is shortest among those without cid and fewest digits
        best = sorted(cl, key=lambda x: ('(cid' in x[1], len(clean_name(x[1])), x[1]))[0]
        cn = clean_name(best[1])
        cid_keep = best[0]
        canon_name[root] = cn; canon_id[root] = cid_keep
        if len(cl) > 1:
            print(f'  -> {cn[:50]}')
            for cid, name in cl:
                if cid != cid_keep:
                    print(f'       merge: {clean_name(name)[:52]}')
    if not apply:
        print('\n(dry-run; pass --apply to execute)')
        return

    # apply: re-point Allotment.collegeId to canonical, update name, delete dups
    for root, cl in clusters.items():
        keep = canon_id[root]
        c.execute('UPDATE "College" SET name=? WHERE id=?', (canon_name[root], keep))
        for cid, name in cl:
            if cid != keep:
                c.execute('UPDATE "Allotment" SET "collegeId"=? WHERE "collegeId"=?', (keep, cid))
                c.execute('DELETE FROM "College" WHERE id=?', (cid,))
    cx.commit()
    # rebuild CutoffSummary + p90 for AP
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
    apcuts = c.execute('''SELECT cs.id,cs.year,cs.round,cs."collegeId",cs."courseId",cs.category,cs.quota
        FROM "CutoffSummary" cs JOIN "College" col ON col.id=cs."collegeId" WHERE col.state='AP' AND cs.quota='STATE' ''').fetchall()
    for cid, yr, rnd, col, crs, cat, q in apcuts:
        ranks = sorted(r[0] for r in c.execute('SELECT "candidateRank" FROM "Allotment" WHERE year=? AND round=? AND "collegeId"=? AND "courseId"=? AND "normalizedCategory"=? AND "normalizedQuota"=?', (yr, rnd, col, crs, cat, q)))
        if ranks:
            c.execute('UPDATE "CutoffSummary" SET "closingRank"=? WHERE id=?', (ranks[min(int(len(ranks)*0.9), len(ranks)-1)], cid))
    cx.commit()
    print('\nAPPLIED.')
    print('AP colleges now:', c.execute("SELECT COUNT(*) FROM \"College\" WHERE state='AP'").fetchone()[0])
    # how many AP college/category groups now have all 3 years
    yrs = c.execute('''SELECT cs."collegeId",cs.category,COUNT(DISTINCT cs.year) ny FROM "CutoffSummary" cs
        JOIN "College" col ON col.id=cs."collegeId" WHERE col.state='AP' AND cs.quota='STATE' AND cs.round='R1'
        GROUP BY cs."collegeId",cs.category''').fetchall()
    from collections import Counter
    print('AP (college,category) R1 groups by #years present:', dict(Counter(y[2] for y in yrs)))
    cx.close()


if __name__ == '__main__':
    main('--apply' in sys.argv)
