"""End-to-end predictor test using an in-memory SQLite DB."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.db import Base, College, Course, Cutoff
from backend.predictor import predict


def _make_session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, future=True)()


def _add_college(session, name, base_ranks_by_year):
    c = College(name=name, state="TestState", type="GOVT")
    session.add(c); session.flush()
    course = Course(college_id=c.id, name="MBBS")
    session.add(course); session.flush()
    for year, rank in base_ranks_by_year.items():
        session.add(Cutoff(
            course_id=course.id, year=year, round="R1",
            category="UR", closing_rank=rank, source_pdf_file="test",
        ))
    session.commit()
    return c, course


def test_strong_rank_lands_safe():
    s = _make_session()
    _add_college(s, "Alpha", {2022: 1000, 2023: 1100, 2024: 1200})
    preds = predict(s, candidate_rank=300, category="UR")
    assert len(preds) == 1
    assert preds[0].bucket == "SAFE"
    assert preds[0].confidence > 0.85


def test_at_parity_lands_borderline():
    s = _make_session()
    _add_college(s, "Beta", {2022: 1000, 2023: 1000, 2024: 1000})
    preds = predict(s, candidate_rank=1000, category="UR")
    assert preds[0].bucket == "BORDERLINE"


def test_weak_rank_lands_unlikely():
    s = _make_session()
    _add_college(s, "Gamma", {2022: 1000, 2023: 1000, 2024: 1000})
    preds = predict(s, candidate_rank=3000, category="UR")
    assert preds[0].bucket == "UNLIKELY"


def test_explanation_lists_all_three_years():
    s = _make_session()
    _add_college(s, "Delta", {2022: 1000, 2023: 1100, 2024: 1200})
    preds = predict(s, candidate_rank=500, category="UR")
    assert len(preds[0].history) == 3
    years = sorted(h.year for h in preds[0].history)
    assert years == [2022, 2023, 2024]


def test_year_cutoff_excludes_test_year():
    s = _make_session()
    _add_college(s, "Eps", {2022: 1000, 2023: 1100, 2024: 800})
    preds = predict(s, candidate_rank=900, category="UR", year_cutoff=2023)
    assert len(preds[0].history) == 2  # 2024 excluded
    assert all(h.year <= 2023 for h in preds[0].history)
