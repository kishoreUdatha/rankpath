"""Re-classify College.type for private & deemed colleges.

Signals (most reliable first):
  1. Appears under DEEMED quota in CutoffSummary  -> DEEMED  (MCC Deemed counselling
     is only for deemed universities — very high precision).
  2. Appears under NRI / MGMT quota (and not deemed) -> PRIVATE.
  3. Name matches a curated private/deemed-chain keyword AND has no government
     marker (de-spaced, so OCR gaps in "Governm ent" still match) -> PRIVATE.

Government colleges (name contains government/govt/gmc when de-spaced) are never
re-typed. Only colleges currently GOVT/UNKNOWN are touched by the name rule.

Run: .venv-etl/Scripts/python.exe scripts/reclassify_college_types.py [--dry]
"""
import sqlite3, re, sys, os
from collections import defaultdict

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
DRY = "--dry" in sys.argv

def despace(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())

GOVT_MARK = ("government", "govt", "gmc", "esic", "aiims", "jipmer")
# central / aided institutions that must never be flagged private by name
CENTRAL_EXC = ("amu", "aligarh", "jamia", "banaras", "bhu", "muslimuniversity", "jawaharlalnehru")

# distinctive private / deemed-chain name tokens (de-spaced), high precision.
# Deemed chains (manipal/srm/amrita/dypatil/kasturba/bldeu/jss/dattameghe…) are
# caught by the DEEMED-quota rule, so they are intentionally NOT in this list to
# avoid colliding with govt namesakes (e.g. MGM Indore/Jamshedpur are GOVERNMENT).
PRIVATE_KW = [
    "katuri", "gsl", "fathima", "apolloinstitute", "apollomedical", "santhiram",
    "mamata", "kamineni", "mallareddy", "chalmeda", "prathima", "gayatrividya",
    "konaseema", "psims", "maheshwara", "svsmedical", "mediciti", "alluriseetharama",
    "allurisitarama", "gitam", "bhaarath", "acsmedical", "aarupadai", "chettinad",
    "saveetha", "sriramachandra", "meenakshimedical", "vinayakamission", "sreebalaji",
    "srisathyasai", "narayanamedical", "kanachur", "subbaiah", "sambhram", "kvgmedical",
    "vydehi", "kempegowda", "rajarajeswari", "sapthagiri", "mvjmedical", "bgsglobal",
    "shridevi", "akashmedical", "srilakshminarayana", "drpinnamaneni", "nimra",
]


def main():
    db = sqlite3.connect(DEV)
    cur = db.cursor()
    colleges = cur.execute("SELECT id, name, type FROM College").fetchall()

    quotas = defaultdict(set)
    for cid, q in cur.execute("SELECT collegeId, quota FROM CutoffSummary"):
        quotas[cid].add(q)

    to_deemed, to_private = [], []
    reasons = {"deemed_quota": 0, "private_quota": 0, "name_kw": 0}

    # Only ever change colleges currently typed GOVT/UNKNOWN — protects AIIMS /
    # JIPMER / ESIC / CENTRAL / existing DEEMED from data anomalies.
    CHANGEABLE = ("GOVT", "UNKNOWN")

    for cid, name, typ in colleges:
        if typ not in CHANGEABLE:
            continue
        qs = quotas.get(cid, set())
        n = despace(name)
        is_govt_name = any(m in n for m in GOVT_MARK)
        is_central = any(m in n for m in CENTRAL_EXC)

        if "DEEMED" in qs:
            to_deemed.append(cid); reasons["deemed_quota"] += 1
            continue
        if {"NRI", "MGMT", "MANAGEMENT"} & qs and not is_govt_name:
            to_private.append(cid); reasons["private_quota"] += 1
            continue
        if not is_govt_name and not is_central and any(k in n for k in PRIVATE_KW):
            to_private.append(cid); reasons["name_kw"] += 1

    print(f"colleges: {len(colleges)}")
    print(f"-> DEEMED:  {len(to_deemed)}")
    print(f"-> PRIVATE: {len(to_private)}  (by reason: {reasons})")

    if not DRY:
        for cid in to_deemed:
            cur.execute("UPDATE College SET type='DEEMED', isDeemed=1 WHERE id=?", (cid,))
        for cid in to_private:
            cur.execute("UPDATE College SET type='PRIVATE' WHERE id=?", (cid,))
        db.commit()
        print("\nCOMMITTED.")
        print("new type counts:")
        for r in cur.execute("SELECT type, COUNT(*) FROM College GROUP BY type ORDER BY 2 DESC"):
            print("  ", r)
    else:
        print("\n(dry run)")
        # show a sample of name-matched privates for review
        sample = [n for cid, n, t in colleges if cid in set(to_private)][:25]
        for s in sample:
            print("   PRIVATE?", s[:70])


if __name__ == "__main__":
    main()
