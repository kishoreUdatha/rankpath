"""MCC AIQ Round 1 PDF parser.

MCC publishes allotment / category-wise cutoff PDFs after each round. The exact
column layout varies year-to-year, so this parser:
  1. Extracts tables with pdfplumber.
  2. Heuristically maps columns by header keywords.
  3. Drops any row that fails strict validation (so silent corruption is impossible).
  4. Returns a structured ParsedRow + a per-file ParseReport.

If MCC changes the PDF layout, update COLUMN_KEYWORDS below — that's the single
point of maintenance.
"""
from dataclasses import dataclass, field
from pathlib import Path
import re

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

from .category_map import normalize_category


COLUMN_KEYWORDS = {
    "institute": ["institute", "college", "allotted institute"],
    "course": ["course", "programme", "program"],
    "category": ["category", "alloted category", "allotted category"],
    "rank": ["rank", "neet rank", "all india rank", "air"],
    "quota": ["quota", "allotted quota"],
}

VALID_CATEGORIES = {"UR", "EWS", "OBC", "SC", "ST", "PwD_UR", "PwD_OBC", "PwD_SC", "PwD_ST"}


@dataclass
class ParsedRow:
    institute: str
    course: str
    category: str
    closing_rank: int
    quota: str
    page: int
    raw: dict


@dataclass
class ParseReport:
    source: str
    total_rows: int = 0
    accepted: int = 0
    rejected: int = 0
    reasons: dict[str, int] = field(default_factory=dict)

    def reject(self, reason: str) -> None:
        self.rejected += 1
        self.reasons[reason] = self.reasons.get(reason, 0) + 1


def _index_columns(header: list[str]) -> dict[str, int]:
    idx: dict[str, int] = {}
    lower = [(h or "").strip().lower() for h in header]
    for field_name, keywords in COLUMN_KEYWORDS.items():
        for i, h in enumerate(lower):
            if any(k in h for k in keywords):
                idx[field_name] = i
                break
    return idx


def _parse_rank(cell: str | None) -> int | None:
    if not cell:
        return None
    m = re.search(r"\d[\d,]*", cell)
    if not m:
        return None
    try:
        return int(m.group(0).replace(",", ""))
    except ValueError:
        return None


def _is_mbbs(course_cell: str | None) -> bool:
    if not course_cell:
        return False
    return "mbbs" in course_cell.lower()


def parse_pdf(path: Path, *, only_mbbs: bool = True) -> tuple[list[ParsedRow], ParseReport]:
    """Parse one MCC AIQ PDF. Returns (rows, report)."""
    if pdfplumber is None:
        raise RuntimeError("pdfplumber not installed. Run: pip install -r requirements.txt")

    report = ParseReport(source=str(path))
    rows: list[ParsedRow] = []

    with pdfplumber.open(str(path)) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            for table in page.extract_tables() or []:
                if not table or len(table) < 2:
                    continue
                header = table[0]
                cols = _index_columns(header)
                if "institute" not in cols or "rank" not in cols:
                    report.reject("missing_required_columns")
                    continue

                for raw_row in table[1:]:
                    report.total_rows += 1
                    if not raw_row or all(not c for c in raw_row):
                        report.reject("empty_row")
                        continue

                    institute = (raw_row[cols["institute"]] or "").strip() if cols.get("institute") is not None else ""
                    course = (raw_row[cols["course"]] or "").strip() if cols.get("course") is not None else "MBBS"
                    category_raw = (raw_row[cols["category"]] or "").strip() if cols.get("category") is not None else ""
                    quota = (raw_row[cols["quota"]] or "").strip() if cols.get("quota") is not None else "AIQ"
                    closing_rank = _parse_rank(raw_row[cols["rank"]] if cols.get("rank") is not None else None)

                    if not institute:
                        report.reject("missing_institute")
                        continue
                    if only_mbbs and course and not _is_mbbs(course):
                        report.reject("non_mbbs_course")
                        continue
                    if closing_rank is None or closing_rank <= 0:
                        report.reject("invalid_rank")
                        continue
                    category = normalize_category(category_raw)
                    if category not in VALID_CATEGORIES:
                        report.reject(f"unknown_category:{category_raw or 'EMPTY'}")
                        continue

                    rows.append(
                        ParsedRow(
                            institute=institute,
                            course=course or "MBBS",
                            category=category,
                            closing_rank=closing_rank,
                            quota=quota or "AIQ",
                            page=page_num,
                            raw={"row": raw_row, "header": header},
                        )
                    )
                    report.accepted += 1

    return rows, report


def parse_all(folder: Path, *, only_mbbs: bool = True) -> dict[str, tuple[list[ParsedRow], ParseReport]]:
    """Parse every *.pdf in folder. Filename should encode year, e.g. mcc_aiq_r1_2024.pdf."""
    out: dict[str, tuple[list[ParsedRow], ParseReport]] = {}
    for pdf in sorted(folder.glob("*.pdf")):
        rows, report = parse_pdf(pdf, only_mbbs=only_mbbs)
        out[pdf.name] = (rows, report)
    return out


def extract_year_from_filename(name: str) -> int | None:
    m = re.search(r"(20\d{2})", name)
    return int(m.group(1)) if m else None


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("usage: python -m backend.parser <pdf-or-folder>")
        sys.exit(1)
    target = Path(sys.argv[1])
    if target.is_dir():
        results = parse_all(target)
        for name, (rows, rep) in results.items():
            print(f"{name}: accepted={rep.accepted} rejected={rep.rejected} reasons={dict(rep.reasons)}")
    else:
        rows, rep = parse_pdf(target)
        for r in rows[:10]:
            print(r)
        print(f"\naccepted={rep.accepted} rejected={rep.rejected} reasons={dict(rep.reasons)}")
