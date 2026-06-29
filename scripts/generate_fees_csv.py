"""Generate a starter fees CSV (one row per college) that an admin can refine
with figures from official fee notifications.

The seed values are INDICATIVE annual MBBS amounts (INR) chosen by college type
/ fee band. Edit data/fees.csv with real numbers and set is_official=1 for any
row you have verified, then run load_fees.py.

Run: .venv-etl/Scripts/python.exe scripts/generate_fees_csv.py
"""
import sqlite3, csv, os, re

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "fees.csv")

# tuition, hostel, other (misc/university), nri  — all INR/year
BY_TYPE = {
    "AIIMS":   (5856, 12000, 6000, 0),
    "JIPMER":  (5550, 12000, 5000, 0),
    "ESIC":    (30000, 20000, 10000, 0),
    "GOVT":    (35000, 25000, 15000, 0),
    "CENTRAL": (30000, 20000, 15000, 0),
    "DEEMED":  (2200000, 200000, 100000, 4000000),
    "PRIVATE": (1200000, 150000, 80000, 3000000),
}
BY_BAND = {
    "LOW":       (40000, 25000, 15000, 0),
    "MID":       (600000, 80000, 40000, 1500000),
    "HIGH":      (1300000, 150000, 80000, 3000000),
    "VERY_HIGH": (2300000, 200000, 100000, 4500000),
}
DEFAULT = (1000000, 120000, 60000, 2500000)  # unknown private

# Discipline-specific fees by management type: (tuition, hostel, other, nri)
DENTAL = {
    "GOVT":   (50000, 25000, 15000, 0),
    "PRIVATE":(450000, 120000, 60000, 1200000),
    "DEEMED": (600000, 150000, 80000, 1500000),
}
NURSING = {
    "GOVT":   (20000, 15000, 8000, 0),
    "PRIVATE":(120000, 60000, 30000, 0),
    "DEEMED": (150000, 80000, 40000, 0),
}


def discipline(name):
    n = re.sub(r"[^a-z0-9]", "", (name or "").lower())
    if "dent" in n:
        return "DENTAL"
    if "nursing" in n or n.endswith("con") or "bscnursing" in n:
        return "NURSING"
    return "MEDICAL"


def pick(typ, is_deemed, band, disc):
    t = (typ or "").upper()
    if disc == "DENTAL":
        return DENTAL.get(t, DENTAL["PRIVATE"])
    if disc == "NURSING":
        return NURSING.get(t, NURSING["GOVT"])
    if t in BY_TYPE:
        return BY_TYPE[t]
    if is_deemed:
        return BY_TYPE["DEEMED"]
    return BY_BAND.get((band or "").upper(), DEFAULT)


def main():
    db = sqlite3.connect(DEV)
    rows = db.execute(
        "SELECT id, name, type, isDeemed, feeBandDefault FROM College ORDER BY name"
    ).fetchall()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["college_id", "college_name", "type", "course", "year",
                    "tuition_annual", "hostel_annual", "other_annual", "nri_tuition",
                    "is_official", "source_url", "note"])
        for cid, name, typ, is_deemed, band in rows:
            disc = discipline(name)
            t, h, o, nri = pick(typ, is_deemed, band, disc)
            course = {"DENTAL": "BDS", "NURSING": "BSc Nursing"}.get(disc, "MBBS")
            w.writerow([cid, name, typ or "", course, "",
                        t, h, o, nri, 0, "", f"type-based indicative estimate ({disc.lower()})"])
    print(f"wrote {len(rows)} rows -> {OUT}")
    print("Edit with official figures (set is_official=1), then run load_fees.py")


if __name__ == "__main__":
    main()
