# scripts/ — state-quota & 2024-R3 ETL tooling

Helper scripts built on top of the core `etl/` pipeline to (a) ingest **Andhra Pradesh
state-quota** allotments from NTRUHS, and (b) recover the borderless **MCC 2024 Round-3**
PDF. They write into the SQLite DB at `data/rankpath.db`.

**Run with:** the ETL venv python, with the repo on PYTHONPATH, e.g.
```
$env:PYTHONPATH = "D:\Smartgrow Projects\rankpath"
& "D:\Smartgrow Projects\rankpath\.venv-etl\Scripts\python.exe" scripts\<file>.py
```
(Paths inside the scripts are currently absolute — adjust `DB` / file paths if the repo moves.)

## Andhra Pradesh state quota (current pipeline — run in this order)
1. **`ingest_ap_all.py`** ✅ canonical — parses NTRUHS MBBS CQ allotment PDFs for 2023/2024/2025
   (handles the 3 differing per-year formats; unified seat-category regex incl. SC1/2/3→SC and
   BCA→BC-A). Wipes & re-inserts AP `quota=STATE, state=AP`, rebuilds CutoffSummary.
2. **`clean_ap_names.py --apply`** ✅ — decodes `(cid:NNN)` ligatures and merges college-name
   variants (case/space/spelling/address) so the same college unifies across years. Dry-run
   without `--apply`.
3. **`recompute_ap_robust.py`** — ⚠️ now REDUNDANT for the standard flow: the IQR-fence robust
   closing (Q3+3·IQR, floored at median·3; n≤3 cap median·4) is built into
   `etl/seed_database.py::rebuild_cutoff_summary` for `quota='STATE'`. So a normal
   `seed_database` run already produces robust state closings. Kept only as a standalone
   recompute utility / reference.
- `ingest_ap.py` — ⚠️ superseded first cut (2025 only, old parser). Kept for reference.

## MCC 2024 Round-3 recovery (borderless PDF)
- **`recover_r3_v3.py`** ✅ canonical — word x-position binning + quota-vocabulary token removal
  (the only method that separates the overlapping quota/institute columns). ~99% on clean pages.
- **`ingest_r3_clean.py`** ✅ — loads the clean R3 rows into Allotment, rebuilds CutoffSummary.
- `recover_r3_2024.py`, `recover_r3_v2.py` — ⚠️ earlier iterations (column-binning only); v3 supersedes.
- `ingest_r3.py` — ⚠️ earlier ingest (partial 745-row clean set); `ingest_r3_clean.py` supersedes.

## To add a NEW state (AP is the template)
1. Find the authority's **live public results URL** (the `authorities.json` URLs may be stale —
   AP's correct one was `https://drntr.uhsap.in/index/`, not the dead `drntruhs.ap.nic.in`).
2. Download its allotment PDFs; adapt `ingest_ap_all.py`'s parser to that state's format
   (seat-category extraction differs per state).
3. Run ingest → name-cleanup → robust-closing, mapping its categories via `etl/mappings/state_categories/`.
