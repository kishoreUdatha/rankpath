"""Ingest the official NMC nationwide UG (MBBS) seat matrix 2024-25 into SeatMatrix
as the SANCTIONED TOTAL INTAKE per college (quota='TOTAL', category='Sanctioned intake').

Source: data/_states/nmc_colleges.json (parsed from NMC 'State-wise list of MBBS
medical colleges ... Annual Intake' PDF). 774 colleges, ~117,740 seats.

Matches each NMC college to a dev College within the SAME state by token overlap
(one dev college used once). Unmatched NMC colleges (genuinely new / absent) are
CREATED as College records so per-state seat totals are complete and accurate.

Run: .venv-etl/Scripts/python.exe scripts/ingest_nmc_seatmatrix.py [--dry]
"""
import sqlite3, re, json, os, sys, uuid, difflib, csv
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEV = os.path.join(ROOT, "web", "prisma", "dev.db")
SRC = os.path.join(ROOT, "data", "_states", "nmc_colleges.json")
NOW = "2026-06-29T00:00:00.000Z"

ST = {"Andaman & Nicobar Islands": "st_an", "Andhra Pradesh": "st_ap", "Arunachal Pradesh": "st_ar",
      "Assam": "st_as", "Bihar": "st_br", "Chhattisgarh": "st_cg", "Chandigarh": "st_ch",
      "Delhi": "st_dl", "Dadra and Nagar Haveli": "st_dn", "Goa": "st_ga", "Gujarat": "st_gj",
      "Himachal Pradesh": "st_hp", "Haryana": "st_hr", "Jharkhand": "st_jh", "Jammu & Kashmir": "st_jk",
      "Karnataka": "st_ka", "Kerala": "st_kl", "Maharashtra": "st_mh", "Meghalaya": "st_ml",
      "Manipur": "st_mn", "Madhya Pradesh": "st_mp", "Mizoram": "st_mz", "Nagaland": "st_nl",
      "Orissa": "st_od", "Punjab": "st_pb", "Puducherry": "st_py", "Rajasthan": "st_rj",
      "Telangana": "st_tg", "Tamil Nadu": "st_tn", "Tripura": "st_tr", "Uttarakhand": "st_uk",
      "Uttar Pradesh": "st_up", "West Bengal": "st_wb", "Sikkim": "st_sk"}

FILLER = {"MEDICAL", "COLLEGE", "INSTITUTE", "OF", "SCIENCES", "SCIENCE", "AND", "HOSPITAL",
          "RESEARCH", "CENTRE", "CENTER", "GOVT", "GOVERNMENT", "FOR", "THE", "DR", "INSTT",
          "ACADEMY", "FOUNDATION", "TRUST", "SOCIETY", "AMP", "HEALTH", "GENERAL"}


def norm(s):
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Za-z0-9]', ' ', (s or '').upper())).strip()


def keytok(s):
    return {t for t in norm(s).split() if t not in FILLER and len(t) > 2}


def ctype(name, mgmt):
    u = name.upper()
    if 'ALL INDIA INSTITUTE' in u or u.strip().startswith('AIIMS'):
        return 'AIIMS'
    if 'JIPMER' in u:
        return 'JIPMER'
    if 'ESIC' in u or 'E.S.I.C' in u or 'EMPLOYEES STATE INSURANCE' in u:
        return 'ESIC'
    m = (mgmt or '').upper()
    if 'GOVT' in m or 'GOVERNMENT' in m:
        return 'GOVT'
    if 'TRUST' in m or 'SOCIETY' in m or 'PVT' in m or 'PRIVATE' in m or 'MINORITY' in m:
        return 'PRIVATE'
    if 'GOVERNMENT' in u or 'GOVT' in u or 'INSTITUTE OF MEDICAL SCIENCES' in u:
        return 'GOVT'
    return 'PRIVATE'


def main():
    dry = "--dry" in sys.argv
    data = json.load(open(SRC, encoding="utf-8"))
    db = sqlite3.connect(DEV); cur = db.cursor()
    mbbs = cur.execute("SELECT id FROM Course WHERE name='MBBS'").fetchone()[0]

    # ensure Sikkim state exists
    if not cur.execute("SELECT 1 FROM State WHERE id='st_sk'").fetchone():
        if not dry:
            cur.execute("INSERT INTO State (id,code,name) VALUES ('st_sk','SK','Sikkim')")

    # idempotent re-run: drop this source's SeatMatrix + the colleges it created
    # (col_nmc_* hold only NMC data) BEFORE matching, so creates don't accumulate.
    if not dry:
        cur.execute("DELETE FROM SeatMatrix WHERE sourceFile='nmc:ug_2024_25'")
        cur.execute("DELETE FROM College WHERE id LIKE 'col_nmc_%'")

    # dev colleges by state
    devby = defaultdict(list)
    for cid, name, sid in cur.execute("SELECT id,name,stateId FROM College WHERE stateId IS NOT NULL"):
        devby[sid].append((cid, name, keytok(name)))

    matched = created = 0
    unmatched_samples = []
    seats_by_cid = {}  # collegeId -> seats
    used = set()
    per_state = defaultdict(lambda: [0, 0])  # sid -> [matched, created]
    # normalized-name index per state for exact matching
    devnorm = defaultdict(dict)  # sid -> {norm(name): cid}
    for sid, lst in devby.items():
        for cid, dname, kd in lst:
            devnorm[sid].setdefault(norm(dname), cid)

    # verified per-state overrides (NMC-name substring -> dev id) for colleges that
    # generic matching can't resolve (filler-only govt names / cross-source name
    # variants, e.g. WB "Purulia Government" == dev "Deben Mahata GMC").
    overrides = defaultdict(list)
    opath = os.path.join(ROOT, "data", "nmc_seat_overrides.csv")
    if os.path.exists(opath):
        for r in csv.DictReader(open(opath, encoding="utf-8")):
            overrides[r["state_code"]].append((r["name_substring"].lower(), r["dev_college_id"]))
    code_by_sid = {v: k for k, v in cur.execute("SELECT code,id FROM State").fetchall()}

    # PHASE 0 (verified overrides) then PHASE 1 (exact normalized-name) claim dev
    # records first, so a fuzzy match can't steal an exact/known target.
    pending = []
    for rec in data:
        sid = ST.get(rec['state'])
        if not sid:
            continue
        ov = next((did for substr, did in overrides.get(code_by_sid.get(sid, ''), [])
                   if substr in rec['name'].lower() and did not in used), None)
        if ov:
            used.add(ov); seats_by_cid[ov] = rec['seats']
            matched += 1; per_state[sid][0] += 1
            continue
        cid = devnorm[sid].get(norm(rec['name']))
        if cid and cid not in used:
            used.add(cid); seats_by_cid[cid] = rec['seats']
            matched += 1; per_state[sid][0] += 1
        else:
            pending.append((sid, rec))

    # PHASE 2 — fuzzy token/difflib match for the rest; else create.
    for sid, rec in pending:
        kn = keytok(rec['name'])
        best = None; bestscore = 0
        for (cid, dname, kd) in devby[sid]:
            if cid in used:
                continue
            common = kn & kd
            if not common:
                continue
            score = len(common) / max(1, min(len(kn), len(kd)))
            score = max(score, difflib.SequenceMatcher(None, norm(rec['name']), norm(dname)).ratio())
            if score > bestscore:
                bestscore = score; best = cid
        if best and bestscore >= 0.55:
            cid = best; matched += 1; per_state[sid][0] += 1
        elif devnorm[sid].get(norm(rec['name'])) in used:
            # exact-name dev record already claimed (true duplicate name) -> merge, don't create
            cid = devnorm[sid][norm(rec['name'])]
            seats_by_cid[cid] = max(seats_by_cid.get(cid, 0), rec['seats'])
            continue
        else:
            cid = "col_nmc_" + uuid.uuid4().hex[:14]
            t = ctype(rec["name"], rec.get("mgmt"))
            if not dry:
                cur.execute("""INSERT INTO College (id,name,type,stateId,feeBandDefault,isMinority,isDeemed,isCentral,createdAt,updatedAt)
                               VALUES (?,?,?,?,?,?,?,?,?,?)""",
                            (cid, rec['name'], t, sid, "HIGH" if t == "PRIVATE" else "LOW", 0, 0, 0, NOW, NOW))
            created += 1; per_state[sid][1] += 1
            if len(unmatched_samples) < 20:
                unmatched_samples.append(f"{rec['state'][:3]}|{rec['name'][:48]}")
        used.add(cid)
        seats_by_cid[cid] = rec['seats']
    rows = list(seats_by_cid.items())

    if not dry:
        cur.execute("DELETE FROM SeatMatrix WHERE sourceFile='nmc:ug_2024_25'")
        for cid, seats in rows:
            cur.execute("""INSERT INTO SeatMatrix (id,year,round,collegeId,courseId,quota,category,seats,sourceFile)
                           VALUES (?,?,?,?,?,?,?,?,?)""",
                        ("nmc_" + uuid.uuid4().hex[:16], 2024, "NA", cid, mbbs, "TOTAL", "Sanctioned intake", seats, "nmc:ug_2024_25"))
        db.commit()

    print(f"NMC seat matrix: {len(data)} colleges | matched-to-dev {matched} | created {created} | total seats {sum(s for _,s in rows)}")
    print("\nper-state (matched / created):")
    code = {v: k for k, v in cur.execute("SELECT code,id FROM State").fetchall()}
    for sid in sorted(per_state, key=lambda s: -(per_state[s][0] + per_state[s][1])):
        m, c = per_state[sid]
        print(f"  {code.get(sid, sid)}: {m+c:>3} ({m} matched, {c} new)")
    print("\nsample created/unmatched:")
    for s in unmatched_samples:
        print("  ", s)
    print("\n" + ("COMMITTED" if not dry else "(dry run)"))


if __name__ == "__main__":
    main()
