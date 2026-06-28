from datetime import datetime
from pathlib import Path

from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Float, UniqueConstraint, Index, create_engine
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "rankpath.sqlite"
ENGINE = create_engine(f"sqlite:///{DB_PATH}", future=True)
SessionLocal = sessionmaker(bind=ENGINE, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


CATEGORIES = ["UR", "EWS", "OBC", "SC", "ST", "PwD_UR", "PwD_OBC", "PwD_SC", "PwD_ST"]
ROUNDS = ["R1"]
COLLEGE_TYPES = ["GOVT", "CENTRAL", "AIIMS", "JIPMER", "DEEMED", "BHU", "AMU"]


class College(Base):
    __tablename__ = "colleges"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    state = Column(String, nullable=False)
    type = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    courses = relationship("Course", back_populates="college", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("name", "state", name="uq_college_name_state"),)


class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True)
    college_id = Column(Integer, ForeignKey("colleges.id"), nullable=False)
    name = Column(String, nullable=False, default="MBBS")
    college = relationship("College", back_populates="courses")
    cutoffs = relationship("Cutoff", back_populates="course", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("college_id", "name", name="uq_course_college_name"),)


class Cutoff(Base):
    __tablename__ = "cutoffs"
    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    year = Column(Integer, nullable=False)
    round = Column(String, nullable=False, default="R1")
    category = Column(String, nullable=False)
    closing_rank = Column(Integer, nullable=False)
    source_pdf_url = Column(String, nullable=True)
    source_pdf_file = Column(String, nullable=True)
    ingested_at = Column(DateTime, default=datetime.utcnow)
    course = relationship("Course", back_populates="cutoffs")
    __table_args__ = (
        UniqueConstraint("course_id", "year", "round", "category", name="uq_cutoff_natural"),
        Index("ix_cutoff_lookup", "category", "year", "round"),
    )


class PredictionLog(Base):
    __tablename__ = "prediction_logs"
    id = Column(Integer, primary_key=True)
    rank = Column(Integer, nullable=False)
    category = Column(String, nullable=False)
    bucket = Column(String, nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    score = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class BacktestResult(Base):
    __tablename__ = "backtest_results"
    id = Column(Integer, primary_key=True)
    run_at = Column(DateTime, default=datetime.utcnow)
    train_years = Column(String, nullable=False)
    test_year = Column(Integer, nullable=False)
    category = Column(String, nullable=False)
    bucket = Column(String, nullable=False)
    predicted_count = Column(Integer, nullable=False)
    correct_count = Column(Integer, nullable=False)
    accuracy = Column(Float, nullable=False)


def init_db() -> None:
    Base.metadata.create_all(ENGINE)


def get_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


if __name__ == "__main__":
    init_db()
    print(f"initialized {DB_PATH}")
