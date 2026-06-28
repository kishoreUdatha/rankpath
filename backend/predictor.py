"""Prediction engine: rank + category -> per-college bucket with explainable score."""
from dataclasses import dataclass, asdict
from math import exp
from typing import Iterable

from sqlalchemy.orm import Session

from .db import Cutoff, Course, College


WEIGHTS_3Y = (0.5, 0.3, 0.2)
WEIGHTS_2Y = (0.6, 0.4)
WEIGHTS_1Y = (1.0,)

BUCKETS = [
    ("SAFE", 0.80),
    ("HIGH", 0.55),
    ("BORDERLINE", 0.35),
    ("LOW", 0.15),
    ("UNLIKELY", 0.0),
]


@dataclass
class HistoricalRank:
    year: int
    closing_rank: int
    weight: float


@dataclass
class Prediction:
    college_id: int
    college_name: str
    state: str
    college_type: str
    course_id: int
    course_name: str
    category: str
    candidate_rank: int
    history: list[HistoricalRank]
    weighted_closing_rank: float
    ratio: float
    confidence: float
    bucket: str
    explanation: str

    def to_dict(self) -> dict:
        d = asdict(self)
        d["history"] = [asdict(h) for h in self.history]
        return d


def _pick_weights(n: int) -> tuple[float, ...]:
    if n >= 3:
        return WEIGHTS_3Y
    if n == 2:
        return WEIGHTS_2Y
    return WEIGHTS_1Y


def _bucket_for(confidence: float) -> str:
    for name, threshold in BUCKETS:
        if confidence >= threshold:
            return name
    return "UNLIKELY"


def _confidence_from_ratio(ratio: float, k: float = 4.0) -> float:
    """Logistic map of (ratio - 1). ratio=1 -> 0.5, ratio=1.5 -> ~0.88, ratio=0.7 -> ~0.23."""
    try:
        return 1.0 / (1.0 + exp(-k * (ratio - 1.0)))
    except OverflowError:
        return 0.0 if ratio < 1 else 1.0


def score_one(
    candidate_rank: int,
    history_rows: list[Cutoff],
) -> tuple[float, float, list[HistoricalRank]]:
    """Score a single course+category given recent history (newest first, up to 3)."""
    rows = sorted(history_rows, key=lambda c: c.year, reverse=True)[:3]
    weights = _pick_weights(len(rows))
    weighted = sum(r.closing_rank * w for r, w in zip(rows, weights))
    ratio = weighted / candidate_rank if candidate_rank > 0 else 0.0
    history = [HistoricalRank(r.year, r.closing_rank, w) for r, w in zip(rows, weights)]
    confidence = _confidence_from_ratio(ratio)
    return weighted, confidence, history


def _build_explanation(
    history: list[HistoricalRank],
    weighted: float,
    candidate_rank: int,
    bucket: str,
) -> str:
    parts = [f"{h.year} closing rank {h.closing_rank:,} (weight {h.weight:.2f})" for h in history]
    history_str = "; ".join(parts) if parts else "no history"
    return (
        f"Weighted closing rank {weighted:,.0f} vs your rank {candidate_rank:,}. "
        f"Based on {history_str}. Bucket: {bucket}."
    )


def predict(
    session: Session,
    candidate_rank: int,
    category: str,
    *,
    year_cutoff: int | None = None,
    buckets: Iterable[str] | None = None,
    limit: int | None = None,
) -> list[Prediction]:
    """Return per-course predictions for given rank+category.

    year_cutoff: only consider cutoffs from years <= this value (used in backtesting).
    buckets: filter to these bucket names if provided.
    """
    courses = session.query(Course).join(College).all()
    out: list[Prediction] = []
    for course in courses:
        q = (
            session.query(Cutoff)
            .filter(Cutoff.course_id == course.id, Cutoff.category == category, Cutoff.round == "R1")
        )
        if year_cutoff is not None:
            q = q.filter(Cutoff.year <= year_cutoff)
        rows = q.all()
        if not rows:
            continue
        weighted, confidence, history = score_one(candidate_rank, rows)
        if weighted <= 0:
            continue
        bucket = _bucket_for(confidence)
        ratio = weighted / candidate_rank if candidate_rank > 0 else 0.0
        explanation = _build_explanation(history, weighted, candidate_rank, bucket)
        out.append(
            Prediction(
                college_id=course.college.id,
                college_name=course.college.name,
                state=course.college.state,
                college_type=course.college.type,
                course_id=course.id,
                course_name=course.name,
                category=category,
                candidate_rank=candidate_rank,
                history=history,
                weighted_closing_rank=weighted,
                ratio=ratio,
                confidence=confidence,
                bucket=bucket,
                explanation=explanation,
            )
        )
    if buckets is not None:
        wanted = set(buckets)
        out = [p for p in out if p.bucket in wanted]
    out.sort(key=lambda p: (-p.confidence, p.weighted_closing_rank))
    if limit:
        out = out[:limit]
    return out


def group_by_bucket(predictions: list[Prediction]) -> dict[str, list[Prediction]]:
    groups: dict[str, list[Prediction]] = {name: [] for name, _ in BUCKETS}
    for p in predictions:
        groups[p.bucket].append(p)
    return groups
