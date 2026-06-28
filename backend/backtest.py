"""Backtest gate.

Train: use cutoffs from years [train_years].
Test:  for each (course, category) in test_year, take that year's actual closing rank
       as the candidate rank and ask the predictor what bucket it would have placed
       that candidate in. A correct prediction is SAFE/HIGH/BORDERLINE (candidate would
       have realistically gotten the seat). LOW/UNLIKELY = miss.

This is intentionally strict: if backtest accuracy < 0.70 for any common category,
the UI should refuse to expose predictions for that category.
"""
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy.orm import Session

from .db import BacktestResult, Cutoff, SessionLocal, init_db
from .predictor import predict


CORRECT_BUCKETS = {"SAFE", "HIGH", "BORDERLINE"}


@dataclass
class CategoryAccuracy:
    category: str
    total: int
    correct: int

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0


def run_backtest(
    session: Session,
    *,
    train_years: list[int],
    test_year: int,
) -> dict[str, CategoryAccuracy]:
    """For each cutoff in test_year, simulate a candidate at that exact rank,
    predict using only train_years data, check bucket."""
    test_rows = (
        session.query(Cutoff)
        .filter(Cutoff.year == test_year, Cutoff.round == "R1")
        .all()
    )
    by_cat: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for r in test_rows:
        by_cat[r.category].append((r.course_id, r.closing_rank))

    train_cutoff = max(train_years)
    results: dict[str, CategoryAccuracy] = {}

    for category, items in by_cat.items():
        total = 0
        correct = 0
        for course_id, actual_rank in items:
            preds = predict(
                session,
                candidate_rank=actual_rank,
                category=category,
                year_cutoff=train_cutoff,
            )
            this_course = next((p for p in preds if p.course_id == course_id), None)
            if this_course is None:
                continue
            total += 1
            if this_course.bucket in CORRECT_BUCKETS:
                correct += 1
        results[category] = CategoryAccuracy(category=category, total=total, correct=correct)

    return results


def persist_results(
    session: Session,
    *,
    train_years: list[int],
    test_year: int,
    results: dict[str, CategoryAccuracy],
) -> None:
    train_str = ",".join(str(y) for y in sorted(train_years))
    for cat, acc in results.items():
        session.add(
            BacktestResult(
                train_years=train_str,
                test_year=test_year,
                category=cat,
                bucket="any_correct",
                predicted_count=acc.total,
                correct_count=acc.correct,
                accuracy=acc.accuracy,
            )
        )
    session.commit()


def print_table(results: dict[str, CategoryAccuracy], test_year: int) -> None:
    print(f"\nBacktest results for test_year={test_year}")
    print(f"{'category':<10} {'n':>6} {'correct':>8} {'accuracy':>10}")
    print("-" * 38)
    for cat in sorted(results):
        a = results[cat]
        flag = " OK" if a.accuracy >= 0.70 else " LOW"
        print(f"{cat:<10} {a.total:>6} {a.correct:>8} {a.accuracy*100:>9.1f}%{flag}")


def main() -> int:
    init_db()
    session = SessionLocal()
    try:
        years = sorted({y for (y,) in session.query(Cutoff.year).distinct().all()})
        if len(years) < 2:
            print(f"need at least 2 years of data; have {years}")
            return 1
        test_year = max(years)
        train_years = [y for y in years if y < test_year]
        print(f"train_years={train_years} test_year={test_year}")
        results = run_backtest(session, train_years=train_years, test_year=test_year)
        persist_results(session, train_years=train_years, test_year=test_year, results=results)
        print_table(results, test_year)
        below = [c for c, a in results.items() if a.accuracy < 0.70 and a.total > 0]
        if below:
            print(f"\nbelow threshold: {below}")
            return 2
        print("\nall categories >= 70% — gate PASSED")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
