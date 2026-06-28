# RankPath

NEET MCC AIQ Round 1 cutoff analytics — rank in, college shortlist out, with confidence and full provenance.

**Scope (v0.1):** MCC AIQ MBBS Round 1 only. State quotas, Mop-up/Stray rounds, and other courses are intentionally out of scope until backtest accuracy is validated for v0.2.

**Not admissions advice.** Every prediction is built on historical cutoff patterns and can shift with seat-matrix updates, policy changes, or NEET difficulty. Always verify against the official MCC notice.

---

## Run it

```powershell
# 1. install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2. seed synthetic demo data (so the app is usable immediately)
python -m backend.seed

# 3. start the app
uvicorn backend.app:app --reload
# open http://127.0.0.1:8000
```

## Ingest real MCC PDFs

Drop PDFs into `data/raw/` named like `mcc_aiq_r1_2024.pdf` (year must appear in filename), then:

```powershell
python -m backend.ingest data/raw
```

The parser will accept rows that have a valid institute name, MBBS course, recognised category, and a parseable closing rank — and log everything it rejects with a reason. Run the parser standalone to inspect one file:

```powershell
python -m backend.parser data/raw/mcc_aiq_r1_2024.pdf
```

## Backtest gate

Before exposing predictions for any new dataset, run:

```powershell
python -m backend.backtest
```

Trains on all years except the latest, predicts the latest year, prints accuracy per category. Any category below 70% is flagged. Results are also persisted and visible at `/backtest`.

## Tests

```powershell
pytest
```

## What's deliberately not in v0.1

- State counselling quotas (single per-state mapping is a multi-week effort each)
- Mop-up / Stray rounds (different signal, different prediction logic)
- AYUSH and BDS streams
- Email/SMS alerts (no PII collected by design)
- Multi-year category-mapping diffs (MCC AIQ has been stable; states have not)

## Architecture

```
backend/
  db.py            SQLAlchemy models, SQLite engine
  parser.py        pdfplumber-based MCC PDF reader with reject logging
  category_map.py  AIQ category code -> canonical (UR/EWS/OBC/SC/ST/PwD_*)
  ingest.py        Parsed rows -> DB upsert
  predictor.py     50/30/20 weighted closing rank -> confidence bucket
  backtest.py      Train on past, predict latest, report accuracy
  seed.py          Synthetic demo data for first-run
  app.py           FastAPI routes + Jinja templates
templates/         Pages: predict form, results, college detail, backtest, disclaimer
static/style.css   Single stylesheet
tests/             Pytest: predictor math, category mapping, end-to-end predict
data/raw/          Place MCC PDFs here (gitignored)
```
