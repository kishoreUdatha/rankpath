# RankPath ETL

Pulls public NEET UG MBBS/BDS allotment files from MCC and state counselling
authorities, parses, normalizes categories/quotas, validates, and loads to Postgres.

## Setup

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium    # only needed for JS-rendered state portals
```

## Pipeline

```bash
# 1. Download public PDFs
python -m etl.scrape_mcc --years 2023 --years 2024 --years 2025
python -m etl.scrape_states --authority KEA  --years 2023 2024 2025
python -m etl.scrape_states --authority TNMCC --years 2023 2024 2025

# 2. Parse → normalized parquet
python -m etl.parse_pdf_allotments data/raw/mcc/**/*.pdf --default-quota AIQ
python -m etl.parse_excel_allotments data/raw/kea/**/*.xlsx --default-quota STATE

# 3. Normalize raw category/quota strings against /mappings
python -m etl.normalize_categories data/normalized/*.parquet

# 4. Validate (rank/year/category sanity, dedup colleges, log rejects)
python -m etl.validate_data data/normalized/*.parquet

# 5. Load into Postgres (DATABASE_URL must be set)
python -m etl.seed_database data/normalized/validated.parquet

# OR — seed synthetic demo data for first-run browsing
python -m etl.seed_database --demo
```

## Adding a new state authority

1. Append an entry to `etl/mappings/authorities.json` (public URL only).
2. Create `etl/mappings/state_categories/<CODE>.json` listing local category codes.
3. Add regex rules for any new category strings to `etl/mappings/category_master.json`.

## What the ETL refuses to do

* Log in to candidate portals
* Store names, phone numbers, emails, DOBs, application numbers
* Persist any column the prediction model doesn't need
