# RankPath v2 — NEET UG MBBS Seat Allotment Analytics & Prediction

A full-stack analytics & prediction platform for NEET UG MBBS/BDS counselling allotments across:
**MCC AIQ, Deemed, Central institutions (AIIMS / JIPMER / ESIC / AFMC / BHU / AMU / DU / Jamia), and all State counselling authorities** — covering Government, Private, Management, NRI and category-specific quotas.

> **This site does not guarantee admission.** Every shortlist is a *probability based on 3-year allotment trends* keyed on category, quota, rank, state and college preference. Counselling outcomes depend on seat-matrix changes, policy shifts and round-by-round movement.

---

## Architecture

```
rankpath/
├─ web/        # Next.js 14 (App Router) + TS + Tailwind + shadcn/ui + Recharts + TanStack Table
│  ├─ prisma/  # Postgres schema, migrations, seed
│  └─ src/     # app routes, components, lib
├─ etl/        # Python ETL — Playwright/requests for downloads, pdfplumber/openpyxl for parsing
│  └─ mappings/  # Category + quota normalization JSONs (all states)
├─ data/
│  ├─ raw/        # original PDFs/XLS/CSVs from official portals
│  └─ normalized/ # cleaned parquet/csv ready for Postgres
└─ docker-compose.yml
```

The legacy Flask MVP under `backend/` and `templates/` is preserved for reference but is no longer the entry point.

---

## Run with Docker (one command)

```bash
cp .env.example .env
docker compose up --build
# web   → http://localhost:3000
# db    → localhost:5433 (rankpath/rankpath)
```

The `etl` service will run `seed_database.py --demo` on startup to populate a small public-sample so the UI is browsable immediately.

## Run locally without Docker

### 1) Database
```bash
docker compose up -d db
```

### 2) Web (Next.js)
```bash
cd web
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

### 3) ETL (Python)
```bash
cd etl
python -m venv .venv && . .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m etl.seed_database --demo
```

---

## ETL: ingest official allotment files

The pipeline is built so every record carries provenance (`source_url`, `source_file`, `last_updated`) and so we **never** touch private candidate login pages or store sensitive personal data.

Supported sources (primary):

| Authority | Module | Format |
|---|---|---|
| MCC AIQ (current + archive) | `scrape_mcc.py` | PDF |
| State counsellings (KEA, KCET-KH, TNMCC, NTRUHS, KNRUHS, MH-CET, CEE-Kerala, …) | `scrape_states.py` | PDF / XLS |
| Deemed & Central institutions | via MCC + institution portals | PDF |

Typical run:

```bash
# 1. Pull official PDFs into data/raw/ (only public allotment pages)
python -m etl.scrape_mcc --years 2023 2024 2025

# 2. Parse PDFs/XLS → normalized rows
python -m etl.parse_pdf_allotments data/raw/mcc/*.pdf
python -m etl.parse_excel_allotments data/raw/states/**/*.xlsx

# 3. Normalize category + quota codes against mappings/
python -m etl.normalize_categories data/normalized/*.parquet

# 4. Validate (numeric ranks, mapped quotas, dedup colleges, flag unknowns)
python -m etl.validate_data data/normalized/*.parquet

# 5. Push to Postgres
python -m etl.seed_database data/normalized/*.parquet
```

---

## Prediction engine — how the score is built

Given a candidate's `{rank, category, state, quota, gender, pwd, preferences}`, the engine:

1. Loads the closing rank per `(college × course × seat_category × quota × round)` for the last 3 years.
2. Computes a **weighted projected cutoff** = `0.5 × Y(t-1) + 0.3 × Y(t-2) + 0.2 × Y(t-3)`.
3. Applies cushion + variance for confidence scoring:

| Band | Score | Meaning |
|---|---|---|
| High chance | 80–100 | Rank well inside last 3-yr closing band |
| Moderate | 55–79 | Within +/- 5 % of band |
| Low | 30–54 | Outside band but historically possible |
| Unlikely | <30 | Rank significantly worse than any prior closing |

The engine returns **Safe / Moderate / Aspirational / Unlikely** buckets and writes every query to `PredictionLog` for audit & backtesting.

---

## Privacy, legality, ethics

- Only **public** allotment result PDFs/CSVs from official authority pages.
- **No** scraping of candidate login areas, application portals, or status-check pages.
- Candidate names found in raw PDFs are **masked** at parse time (`mask_pii=True` by default).
- We store only `rank, category, quota, college, course, round` — never phone/email/DOB/application-no.
- See `/disclaimer` in the web app for the user-facing notice.

---

## License & data attribution

Code: MIT. Counselling data remains the property of MCC and respective state authorities; this project redistributes only structured derivatives of public PDFs for educational analytics.
