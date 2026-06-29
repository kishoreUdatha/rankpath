"""Recover 2024 R3 borderless PDF with quota-vocabulary token removal.

x-binning can't separate quota from institute (their x-ranges overlap when long
institute names wrap). Instead: bin words to columns for rank/course/category
(clean), but for each round block's quota+institute REGION, identify the quota by
matching a known MCC quota phrase's tokens and remove exactly those — the rest is
the institute, recovered in reading order regardless of x.
"""
import sys, re, bisect, hashlib
from pathlib import Path
from datetime import datetime, timezone
import pdfplumber
import pandas as pd
from etl.normalize_categories import normalize_category, normalize_quota

PDF = Path(r'D:\Smartgrow Projects\rankpath\data\raw\mcc\2024\https_cdnbbsr_s3waas_gov_in_s3e0f7a4d0ef9b84b83b693bbf3feb8e.pdf')
# column left-x starts: rank, [qR1 instR1 cR1 remR1] [qR2 instR2 cR2 remR2] [qR3 instR3 cR3 seatcat candcat opt remR3]
COL_STARTS = [13, 58, 93, 179, 222, 269, 337, 406, 456, 506, 556, 621, 678, 720, 770, 796]
_BOUND = [COL_STARTS[i + 1] - 7 for i in range(len(COL_STARTS) - 1)]
RANK_RX = re.compile(r'^\d+(\.\d+|\(\w\))?$')
# round blocks as (quota_col, institute_col, course_col, seatcat_col, candcat_col)
BLOCKS = [(1, 2, 3, None, None), (5, 6, 7, None, None), (9, 10, 11, 12, 13)]

# known quota phrases as lowercased token tuples, longest first
_QP = [
    # full vocabulary read from the file's own quota-abbreviation legend
    "delhi ncr children/widows of personnel of the armed forces (cw) du quota",
    "delhi ncr children/widows of personnel of the armed forces (cw) ip quota",
    "employees state insurance scheme nursing quota (esi-ip quota nursing)",
    "aligarh muslim university (amu) quota", "b.sc nursing delhi ncr cw quota",
    "non-resident indian(amu)quota", "employees state insurance scheme(esi)",
    "internal -puducherry ut domicile", "deemed/paid seats quota",
    "b.sc nursing all india", "b.sc nursing delhi ncr",
    "delhi university quota", "ip university quota", "jamia internal quota",
    "jain minority quota", "muslim minority quota", "muslim women quota",
    "muslim obc quota", "muslim st quota", "open seat quota",
    "foreign country quota", "non-resident indian", "muslim quota", "all india",
]
KNOWN_PHRASES = sorted([(p, p.split()) for p in _QP], key=lambda x: -len(x[1]))


def col_of(x0):
    return bisect.bisect_right(_BOUND, x0)


def split_quota_institute(words):
    """words: list of token strings in reading order for the quota+institute region."""
    low = [w.lower().strip(',') for w in words]
    for phrase, ptoks in KNOWN_PHRASES:
        pool = list(low)
        idxs, ok = [], True
        for pt in ptoks:
            try:
                j = pool.index(pt)
            except ValueError:
                ok = False
                break
            idxs.append(low.index(pt) if low.count(pt) == 1 else _nth(low, pt, idxs))
            pool[j] = None
        if ok:
            inst = ' '.join(words[i] for i in range(len(words)) if i not in set(idxs)).strip()
            return phrase, inst
    return None, ' '.join(words).strip()


def _nth(low, tok, used):
    for i, t in enumerate(low):
        if t == tok and i not in used:
            return i
    return low.index(tok)


def recover(max_pages=None):
    out = []
    now = datetime.now(timezone.utc).isoformat()
    with pdfplumber.open(str(PDF)) as pdf:
        pages = pdf.pages if max_pages is None else pdf.pages[:max_pages]
        for page in pages:
            ws = page.extract_words(use_text_flow=False, keep_blank_chars=False)
            if not ws:
                continue
            ws.sort(key=lambda w: (round(w['top']), w['x0']))
            lines, cur, cy = [], [], None
            for w in ws:
                if cy is None or abs(w['top'] - cy) <= 3:
                    cur.append(w)
                    if cy is None:
                        cy = w['top']
                else:
                    lines.append(cur); cur = [w]; cy = w['top']
            if cur:
                lines.append(cur)
            rec = None  # dict col -> list[word dict] (preserve order/x)

            def flush(rec):
                if rec is None:
                    return
                # rightmost populated block (institute col non-blank)
                chosen = None
                for bi, (qc, ic, cc, sc, cdc) in enumerate(BLOCKS):
                    inst_words = rec.get(ic, [])
                    if any(w['text'] not in ('-', '') for w in inst_words):
                        chosen = (bi, qc, ic, cc, sc, cdc)
                if chosen is None:
                    return
                bi, qc, ic, cc, sc, cdc = chosen
                region = sorted(rec.get(qc, []) + rec.get(ic, []), key=lambda w: (round(w['top']), w['x0']))
                region = [w['text'] for w in region if w['text'] != '-']
                quota, institute = split_quota_institute(region)
                course = ' '.join(w['text'] for w in rec.get(cc, []) if w['text'] != '-').strip()
                seatcat = ' '.join(w['text'] for w in rec.get(sc, []) if w['text'] != '-').strip() if sc else ''
                candcat = ' '.join(w['text'] for w in rec.get(cdc, []) if w['text'] != '-').strip() if cdc else ''
                rank_txt = ' '.join(w['text'] for w in rec.get(0, [])).strip()
                m = re.match(r'\s*(\d[\d,]*)', rank_txt)
                if not institute or not m:
                    return
                out.append({
                    'year': 2024, 'round': f'R{bi+1}', 'authority': 'MCC',
                    'institute_name': institute, 'course': course or 'MBBS',
                    'quota': quota, 'seat_category': seatcat or None,
                    'candidate_category': candcat or None,
                    'candidate_rank': int(re.sub(r'[^\d]', '', m.group(1))),
                    'source_file': PDF.name, 'last_updated': now,
                    'raw_row_hash': hashlib.sha1((rank_txt + '|' + institute + '|' + (quota or '') + f'|{bi}').encode()).hexdigest(),
                })

            for ln in lines:
                cols = {}
                for w in ln:
                    cols.setdefault(col_of(w['x0']), []).append(w)
                c0 = ' '.join(w['text'] for w in cols.get(0, [])).strip()
                if RANK_RX.match(c0):
                    flush(rec)
                    rec = {}
                    for ci, wl in cols.items():
                        rec.setdefault(ci, []).extend(wl)
                elif rec is not None:
                    for ci, wl in cols.items():
                        rec.setdefault(ci, []).extend(wl)
            flush(rec)
    df = pd.DataFrame(out)
    if len(df):
        df['normalized_category'] = df['seat_category'].map(normalize_category)
        df['normalized_quota'] = df['quota'].map(normalize_quota)
    return df


if __name__ == '__main__':
    mp = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] != 'all' else None
    df = recover(max_pages=mp)
    print('rows:', len(df))
    if len(df):
        print('rounds:', df['round'].value_counts().to_dict())
        r3 = df[df['round'] == 'R3']
        print(f'R3 rows: {len(r3)}  quota-identified: {int(r3.quota.notna().sum())}  '
              f'inst-nonblank: {int((r3.institute_name.str.len() > 3).sum())}  '
              f'normalized_quota: {int(r3.normalized_quota.notna().sum())}')
        cols = ['round', 'candidate_rank', 'quota', 'institute_name', 'seat_category']
        print(r3[cols].head(8).to_string(max_colwidth=30))
        out = sys.argv[2] if len(sys.argv) > 2 else None
        if out:
            df.to_parquet(out, index=False)
            print('wrote', out)
