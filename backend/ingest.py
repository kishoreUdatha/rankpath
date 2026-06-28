"""Ingest parsed PDF rows into the SQLite DB."""
from pathlib import Path

from sqlalchemy.orm import Session

from .db import College, Course, Cutoff, SessionLocal, init_db
from .parser import ParsedRow, extract_year_from_filename, parse_all


def _guess_state(institute: str) -> str:
    # MCC PDFs include state in the institute name string sometimes; fallback to UNKNOWN.
    # For real ingestion you'd maintain a college -> state dictionary.
    return "UNKNOWN"


def _guess_type(institute: str) -> str:
    upper = institute.upper()
    if "AIIMS" in upper:
        return "AIIMS"
    if "JIPMER" in upper:
        return "JIPMER"
    if "BHU" in upper or "BANARAS" in upper:
        return "BHU"
    if "AMU" in upper or "ALIGARH" in upper:
        return "AMU"
    return "GOVT"


def upsert_cutoff(session: Session, row: ParsedRow, year: int, source_file: str) -> None:
    college = (
        session.query(College).filter_by(name=row.institute, state=_guess_state(row.institute)).one_or_none()
    )
    if college is None:
        college = College(
            name=row.institute,
            state=_guess_state(row.institute),
            type=_guess_type(row.institute),
        )
        session.add(college)
        session.flush()

    course = (
        session.query(Course).filter_by(college_id=college.id, name=row.course).one_or_none()
    )
    if course is None:
        course = Course(college_id=college.id, name=row.course)
        session.add(course)
        session.flush()

    existing = (
        session.query(Cutoff)
        .filter_by(course_id=course.id, year=year, round="R1", category=row.category)
        .one_or_none()
    )
    if existing is not None:
        existing.closing_rank = row.closing_rank
        existing.source_pdf_file = source_file
    else:
        session.add(
            Cutoff(
                course_id=course.id,
                year=year,
                round="R1",
                category=row.category,
                closing_rank=row.closing_rank,
                source_pdf_file=source_file,
            )
        )


def ingest_folder(folder: Path) -> dict:
    init_db()
    parsed = parse_all(folder)
    summary: dict[str, dict] = {}
    session = SessionLocal()
    try:
        for filename, (rows, report) in parsed.items():
            year = extract_year_from_filename(filename)
            if year is None:
                summary[filename] = {"error": "no_year_in_filename"}
                continue
            for r in rows:
                upsert_cutoff(session, r, year, filename)
            session.commit()
            summary[filename] = {
                "year": year,
                "accepted": report.accepted,
                "rejected": report.rejected,
                "reasons": dict(report.reasons),
            }
    finally:
        session.close()
    return summary


if __name__ == "__main__":
    import json
    import sys

    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/raw")
    print(json.dumps(ingest_folder(target), indent=2))
