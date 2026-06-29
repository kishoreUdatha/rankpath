"""Recover the borderless 2024 R3 longitudinal PDF via word x-position binning.

This file has a full text layer (NOT scanned) but no table ruling lines, so
pdfplumber's default line-based extract_tables() finds almost nothing. We bin
words into the known 16 fixed columns by x0 and reuse the parser's row logic.
"""
import sys, re, bisect
from pathlib import Path
from datetime import datetime, timezone
import pdfplumber
import pandas as pd
from etl.parse_pdf_allotments import _row_to_allotment, to_dataframe

PDF = Path(r'D:\Smartgrow Projects\rankpath\data\raw\mcc\2024\https_cdnbbsr_s3waas_gov_in_s3e0f7a4d0ef9b84b83b693bbf3feb8e.pdf')
COL_STARTS = [13, 58, 93, 179, 222, 269, 337, 406, 456, 506, 556, 621, 678, 720, 770, 796]
ROLES = ['rank', 'quota', 'institute', 'course', '_ignore',
         'quota', 'institute', 'course', '_ignore',
         'quota', 'institute', 'course', 'seat_category', 'candidate_category', None, '_ignore']
# Boundary just left of the next column's start: wide enough for right-extending
# institute names (R1) yet tight enough to catch institute text that wraps slightly
# left of its column start (R3). The 14px tolerance covers observed wrap-left drift.
_BOUND = [COL_STARTS[i + 1] - 14 for i in range(len(COL_STARTS) - 1)]
RANK_RX = re.compile(r'^\d+(\.\d+|\(\w\))?$')


def col_of(x0):
    return bisect.bisect_right(_BOUND, x0)


def recover(max_pages=None):
    meta = {'source_file': PDF.name, 'last_updated': datetime.now(timezone.utc).isoformat(), 'default_quota': None}
    file_meta = {'year': 2024, 'round': 'R3', 'authority': 'MCC'}
    out = []
    with pdfplumber.open(str(PDF)) as pdf:
        pages = pdf.pages if max_pages is None else pdf.pages[:max_pages]
        for page in pages:
            words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
            if not words:
                continue
            words.sort(key=lambda w: (round(w['top']), w['x0']))
            # group into visual lines by 'top'
            lines, cur, cy = [], [], None
            for w in words:
                if cy is None or abs(w['top'] - cy) <= 3:
                    cur.append(w)
                    if cy is None:
                        cy = w['top']
                else:
                    lines.append(cur); cur = [w]; cy = w['top']
            if cur:
                lines.append(cur)
            # reconstruct rank-led logical records, merging wrapped continuation lines
            rec = None

            def flush(rec):
                if rec is None:
                    return
                row = [' '.join(rec[i]).strip() for i in range(len(COL_STARTS))]
                r = _row_to_allotment(row, ROLES, meta, file_meta)
                if r:
                    out.append(r)

            for ln in lines:
                cols = {}
                for w in ln:
                    cols.setdefault(col_of(w['x0']), []).append(w['text'])
                col0 = ' '.join(cols.get(0, [])).strip()
                if RANK_RX.match(col0):
                    flush(rec)
                    rec = [[] for _ in COL_STARTS]
                    for ci, toks in cols.items():
                        rec[ci].extend(toks)
                elif rec is not None:
                    for ci, toks in cols.items():
                        rec[ci].extend(toks)
            flush(rec)
    return out


if __name__ == '__main__':
    mp = int(sys.argv[1]) if len(sys.argv) > 1 else None
    rows = recover(max_pages=mp)
    df = to_dataframe(rows)
    print('rows recovered:', len(df))
    if len(df):
        print('rounds:', df['round'].value_counts(dropna=False).to_dict())
        print('with category:', int(df.seat_category.notna().sum()))
        print('sample:')
        cols = ['round', 'candidate_rank', 'quota', 'institute_name', 'course', 'seat_category', 'candidate_category']
        print(df[df.seat_category.notna()][cols].head(5).to_string(max_colwidth=22))
        print('--- R1 sample ---')
        print(df[df['round'] == 'R1'][cols].head(3).to_string(max_colwidth=22))
        out = sys.argv[2] if len(sys.argv) > 2 else None
        if out:
            df.to_parquet(out, index=False)
            print('wrote', out)
