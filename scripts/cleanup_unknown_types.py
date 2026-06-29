"""Final pass over the remaining UNKNOWN colleges (after deemed/private/dental/
nursing classification). These are overwhelmingly unmapped GOVERNMENT medical
colleges, with a few deemed/private stragglers.

Order:
  1. deemed-chain straggler name  -> DEEMED
  2. private / trust straggler     -> PRIVATE
  3. has a medical / govt-institution marker -> GOVT
  4. otherwise                     -> left UNKNOWN (unidentifiable)

Run: .venv-etl/Scripts/python.exe scripts/cleanup_unknown_types.py [--dry]
"""
import sqlite3, re, sys, os

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
DRY = "--dry" in sys.argv

def dsp(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())

DEEMED_KW = ("kshegde", "mullana", "maharishi", "sbks", "sumandeep", "vidyapeeth",
             "nitte", "dattameghe", "jssmedical", "adichunchanagiri", "bldeu")
PRIVATE_KW = ("hosptrust", "uttaranchalfhosp", "ftrust", "trustmc")
# markers that confirm a government medical / institutional college
GOVT_INST = ("medical", "medicine", "medsci", "medsc", "medsce", "medcoll", "medcollege",
             "medcial", "instofmed", "instituteofmed", "gmc", "gtmc", "gvmc", "kgmc",
             "kgmedical", "rims", "pgims", "pgimer", "neigrihms", "ipgmer", "instofpgmed",
             "gajapati", "lokmanyatilak", "mysoremed", "faculty", "gdc", "ptbdsharma", "jln",
             "vishwanatham", "viswanatham", "municipal", "mc", "ims")


def main():
    db = sqlite3.connect(DEV)
    cur = db.cursor()
    unk = cur.execute("SELECT id, name FROM College WHERE type='UNKNOWN'").fetchall()

    plan = {"DEEMED": [], "PRIVATE": [], "GOVT": []}
    leftover = []
    for cid, name in unk:
        d = dsp(name)
        if any(k in d for k in DEEMED_KW):
            plan["DEEMED"].append((cid, name))
        elif any(k in d for k in PRIVATE_KW):
            plan["PRIVATE"].append((cid, name))
        elif any(k in d for k in GOVT_INST):
            plan["GOVT"].append((cid, name))
        else:
            leftover.append(name)

    for t in ("DEEMED", "PRIVATE"):
        print(f"-> {t}: {len(plan[t])}")
        for _c, n in plan[t]:
            print(f"     {n[:70]}")
    print(f"-> GOVT: {len(plan['GOVT'])}")
    print(f"-> left UNKNOWN: {len(leftover)}")
    for n in leftover:
        print(f"     ? {n[:70]}")

    if not DRY:
        for cid, _n in plan["DEEMED"]:
            cur.execute("UPDATE College SET type='DEEMED', isDeemed=1 WHERE id=?", (cid,))
        for cid, _n in plan["PRIVATE"]:
            cur.execute("UPDATE College SET type='PRIVATE' WHERE id=?", (cid,))
        for cid, _n in plan["GOVT"]:
            cur.execute("UPDATE College SET type='GOVT' WHERE id=?", (cid,))
        db.commit()
        print("\nCOMMITTED.")
        for r in cur.execute("SELECT type, COUNT(*) FROM College GROUP BY type ORDER BY 2 DESC"):
            print("  ", r)
    else:
        print("\n(dry run)")


if __name__ == "__main__":
    main()
