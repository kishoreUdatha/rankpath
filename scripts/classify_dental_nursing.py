"""Classify the management type (GOVT / PRIVATE / DEEMED) of UNKNOWN dental &
nursing colleges so they leave the UNKNOWN bucket and can get discipline-correct
indicative fees (a govt dental college is not an MBBS-rate ₹10L).

Discipline is detected by name in generate_fees_csv.py; this script only sets the
College.type (management class).

Rules (only touches type='UNKNOWN'):
  Dental  : deemed-chain name -> DEEMED ; govt marker -> GOVT ; else PRIVATE
  Nursing : private marker -> PRIVATE ; else GOVT (the unmatched ones are the
            central/state govt CONs e.g. RAK CON, LHMC, Safdarjung)

Run: .venv-etl/Scripts/python.exe scripts/classify_dental_nursing.py [--dry]
"""
import sqlite3, re, sys, os

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
DRY = "--dry" in sys.argv

def dsp(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def is_dental(n): return "dent" in n
def is_nursing(n): return ("nursing" in n) or n.endswith("con") or "bscnursing" in n

GOVT_MARK = ("government", "goverment", "govt", "gmc", "goadental", "nairhosp", "nair",
             "burdwan", "patnadental", "northbengal", "rahmed", "drrahmed", "ahmed",
             "facultyofden", "kgmu", "nehruinstituteofdental", "tamilnadugovt", "gdc",
             "regionaldental", "ruhs", "scb", "rims", "dentalinstitu")
DEEMED_DENTAL = ("amrita", "abshetty", "manipal", "bvdu", "dypatil", "saveetha",
                 "sriramachandra", "sdmdental", "sdm", "yenepoya", "kledental")
PRIVATE_NURSING = ("apollo", "narayana", "manipal", "amrita", "nims", "padmashree")


def main():
    db = sqlite3.connect(DEV)
    cur = db.cursor()
    unk = cur.execute("SELECT id, name FROM College WHERE type='UNKNOWN'").fetchall()

    plan = {"DEEMED": [], "GOVT": [], "PRIVATE": []}
    for cid, name in unk:
        n = dsp(name)
        if is_dental(n):
            if any(k in n for k in DEEMED_DENTAL):
                plan["DEEMED"].append((cid, name))
            elif any(k in n for k in GOVT_MARK):
                plan["GOVT"].append((cid, name))
            else:
                plan["PRIVATE"].append((cid, name))
        elif is_nursing(n):
            if any(k in n for k in PRIVATE_NURSING):
                plan["PRIVATE"].append((cid, name))
            else:
                plan["GOVT"].append((cid, name))

    total = sum(len(v) for v in plan.values())
    print(f"UNKNOWN dental/nursing to classify: {total}")
    for t, items in plan.items():
        print(f"  -> {t}: {len(items)}")
        for _cid, nm in items:
            print(f"       {nm[:70]}")

    if not DRY:
        for t, items in plan.items():
            for cid, _nm in items:
                if t == "DEEMED":
                    cur.execute("UPDATE College SET type='DEEMED', isDeemed=1 WHERE id=?", (cid,))
                else:
                    cur.execute("UPDATE College SET type=? WHERE id=?", (t, cid))
        db.commit()
        print("\nCOMMITTED.")
    else:
        print("\n(dry run)")


if __name__ == "__main__":
    main()
