"""2024 R3 recovery v3 — quota by left-x-band + space-removed phrase match.

Fixes the last ~19%: quota words that wrap mid-word ("University"->"Universit"
+"y") still sit in the quota column's left x-band. Concatenating the band words
with spaces removed rejoins the fragments, so the no-space quota phrase matches.
Institute = everything outside the band (recovered in reading order).
"""
import sys, re, bisect, hashlib
from pathlib import Path
from datetime import datetime, timezone
import pdfplumber
import pandas as pd
from etl.normalize_categories import normalize_category, normalize_quota

PDF = Path(r'D:\Smartgrow Projects\rankpath\data\raw\mcc\2024\https_cdnbbsr_s3waas_gov_in_s3e0f7a4d0ef9b84b83b693bbf3feb8e.pdf')
COL_STARTS = [13, 58, 93, 179, 222, 269, 337, 406, 456, 506, 556, 621, 678, 720, 770, 796]
_BOUND = [COL_STARTS[i + 1] - 7 for i in range(len(COL_STARTS) - 1)]
RANK_RX = re.compile(r'^\d+(\.\d+|\(\w\))?$')
BLOCKS = [(1, 2, 3, None, None), (5, 6, 7, None, None), (9, 10, 11, 12, 13)]

_QP = [
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


def _ns(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


KNOWN_NS = sorted([(p, _ns(p)) for p in _QP], key=lambda x: -len(x[1]))


def col_of(x0):
    return bisect.bisect_right(_BOUND, x0)


def split_qi(region, qstart):
    """region: list of word dicts (x0, top, text). Returns (quota_phrase, institute)."""
    band = sorted([w for w in region if qstart - 6 <= w['x0'] <= qstart + 18],
                  key=lambda w: (round(w['top']), w['x0']))
    rest = sorted([w for w in region if not (qstart - 6 <= w['x0'] <= qstart + 18)],
                  key=lambda w: (round(w['top']), w['x0']))
    qns = _ns(''.join(w['text'] for w in band))
    quota = None
    for phrase, pns in KNOWN_NS:
        if qns == pns or qns.startswith(pns):
            quota = phrase
            break
    institute = ' '.join(w['text'] for w in rest).strip()
    return quota, institute


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
            rec = None

            def flush(rec):
                if rec is None:
                    return
                chosen = None
                for bi, (qc, ic, cc, sc, cdc) in enumerate(BLOCKS):
                    if any(w['text'] not in ('-', '') for w in rec.get(ic, [])):
                        chosen = (bi, qc, ic, cc, sc, cdc)
                if chosen is None:
                    return
                bi, qc, ic, cc, sc, cdc = chosen
                region = [w for w in (rec.get(qc, []) + rec.get(ic, [])) if w['text'] != '-']
                quota, institute = split_qi(region, COL_STARTS[qc])
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
        r3 = df[df['round'] == 'R3']
        print(f'R3 rows: {len(r3)}  quota-identified: {int(r3.quota.notna().sum())}  '
              f'({100*r3.quota.notna().mean():.0f}%)  with category: {int(r3.normalized_category.notna().sum())}')
        bad = r3[r3.quota.isna()]
        print('unidentified sample:')
        for v in bad['institute_name'].head(5):
            print('   |', str(v)[:70])
        out = sys.argv[2] if len(sys.argv) > 2 else None
        if out:
            df.to_parquet(out, index=False)
            print('wrote', out)
