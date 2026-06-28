"""Synthetic seed data so the app is runnable without real PDFs.

These cutoffs are ILLUSTRATIVE only. Do not use predictions made on seed data
to make any real decision. The disclaimer in the UI is non-negotiable.
"""
import random

from .db import College, Cutoff, Course, SessionLocal, init_db


SEED_COLLEGES = [
    ("AIIMS New Delhi", "Delhi", "AIIMS", 60),
    ("AIIMS Jodhpur", "Rajasthan", "AIIMS", 850),
    ("AIIMS Bhopal", "Madhya Pradesh", "AIIMS", 1400),
    ("AIIMS Bhubaneswar", "Odisha", "AIIMS", 1100),
    ("AIIMS Rishikesh", "Uttarakhand", "AIIMS", 1300),
    ("Maulana Azad Medical College", "Delhi", "GOVT", 220),
    ("VMMC and Safdarjung Hospital", "Delhi", "GOVT", 300),
    ("Lady Hardinge Medical College", "Delhi", "GOVT", 600),
    ("Seth GS Medical College", "Maharashtra", "GOVT", 800),
    ("Grant Medical College", "Maharashtra", "GOVT", 1500),
    ("BJ Government Medical College", "Maharashtra", "GOVT", 2400),
    ("Government Medical College Kozhikode", "Kerala", "GOVT", 1900),
    ("Government Medical College Thiruvananthapuram", "Kerala", "GOVT", 2100),
    ("Madras Medical College", "Tamil Nadu", "GOVT", 1700),
    ("Stanley Medical College", "Tamil Nadu", "GOVT", 2900),
    ("Bangalore Medical College", "Karnataka", "GOVT", 2200),
    ("Mysore Medical College", "Karnataka", "GOVT", 3400),
    ("Andhra Medical College", "Andhra Pradesh", "GOVT", 4500),
    ("Osmania Medical College", "Telangana", "GOVT", 5200),
    ("BHU IMS", "Uttar Pradesh", "BHU", 700),
    ("JIPMER Puducherry", "Puducherry", "JIPMER", 180),
]

CATEGORY_MULTIPLIERS = {
    "UR": 1.0,
    "EWS": 1.45,
    "OBC": 1.85,
    "SC": 6.0,
    "ST": 11.0,
    "PwD_UR": 25.0,
    "PwD_OBC": 32.0,
    "PwD_SC": 80.0,
    "PwD_ST": 150.0,
}


def _year_drift(base: int, year: int) -> int:
    drift = {2021: 1.10, 2022: 1.04, 2023: 1.00, 2024: 0.97}[year]
    jitter = random.uniform(0.92, 1.08)
    return int(base * drift * jitter)


def seed() -> None:
    init_db()
    session = SessionLocal()
    try:
        if session.query(College).count() > 0:
            print("seed: data already present; skipping")
            return
        random.seed(42)
        for name, state, ctype, base_rank in SEED_COLLEGES:
            college = College(name=name, state=state, type=ctype)
            session.add(college)
            session.flush()
            course = Course(college_id=college.id, name="MBBS")
            session.add(course)
            session.flush()
            for year in (2021, 2022, 2023, 2024):
                for cat, mult in CATEGORY_MULTIPLIERS.items():
                    closing = _year_drift(int(base_rank * mult), year)
                    session.add(
                        Cutoff(
                            course_id=course.id,
                            year=year,
                            round="R1",
                            category=cat,
                            closing_rank=max(1, closing),
                            source_pdf_file="seed",
                        )
                    )
        session.commit()
        print(f"seed: inserted {len(SEED_COLLEGES)} colleges x 4 years x 9 categories = {len(SEED_COLLEGES)*4*9} cutoffs")
    finally:
        session.close()


if __name__ == "__main__":
    seed()
