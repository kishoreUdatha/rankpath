"""Discover and download public state-counselling allotment files.

Drives by etl/mappings/authorities.json. For each state authority we:
  1. fetch the public landing page (no login)
  2. find PDFs/XLS whose link text contains 'allot|result|round'
  3. save to data/raw/{authority}/{year}/

Many state portals are JS-rendered, so we always try Playwright as a fallback.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin

import click
import requests

from etl.scrape_mcc import fetch_html, ALLOT_RX, YEAR_RX, HEADERS

MAPPINGS = Path(__file__).parent / "mappings" / "authorities.json"
FILE_RX = re.compile(r'href="([^"]+\.(?:pdf|xlsx?|csv))"', re.IGNORECASE)


def discover(authority_code: str, years: Iterable[int]) -> list[dict]:
    cfg = json.loads(MAPPINGS.read_text(encoding="utf-8"))
    auth = next((a for a in cfg["authorities"] if a["code"].upper() == authority_code.upper()), None)
    if auth is None:
        raise click.ClickException(f"Unknown authority: {authority_code}")
    if auth["code"] == "MCC":
        raise click.ClickException("Use scrape_mcc for MCC")

    page_url = auth["url_current"]
    html = fetch_html(page_url)
    if not html:
        click.echo(f"  warn: could not fetch {page_url}", err=True)
        return []

    out = []
    years_set = set(years)
    for m in re.finditer(r'<a[^>]+href="([^"]+\.(?:pdf|xlsx?|csv))"[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL):
        href, text = m.group(1), re.sub(r"<.*?>", "", m.group(2)).strip()
        if not ALLOT_RX.search(text + " " + href):
            continue
        ym = YEAR_RX.search(text) or YEAR_RX.search(href)
        year = int(ym.group(1)) if ym else None
        if years_set and (year is None or year not in years_set):
            continue
        out.append({"url": urljoin(page_url, href), "text": text, "year": year, "authority": auth["code"]})
    return out


def download(item: dict, out_root: Path) -> Path | None:
    year = item.get("year") or 0
    out_dir = out_root / item["authority"].lower() / str(year or "unknown")
    out_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(item["url"]).suffix.lower() or ".pdf"
    slug = re.sub(r"[^a-z0-9]+", "_", item["text"].lower()).strip("_")[:60] or "doc"
    target = out_dir / f"{slug}{ext}"
    if target.exists():
        return target
    try:
        r = requests.get(item["url"], headers=HEADERS, timeout=120, stream=True)
        if r.status_code != 200:
            return None
        with target.open("wb") as fh:
            for chunk in r.iter_content(8192):
                fh.write(chunk)
        return target
    except requests.RequestException:
        return None


@click.command()
@click.option("--authority", required=True, help="Authority code (e.g. KEA, NTRUHS, TNMCC)")
@click.option("--years", multiple=True, type=int, required=True)
@click.option("--out", type=click.Path(), default="data/raw")
def main(authority: str, years: tuple[int, ...], out: str) -> None:
    items = discover(authority, years)
    click.echo(f"{authority}: {len(items)} candidate files")
    out_root = Path(out)
    manifest = []
    for item in items:
        path = download(item, out_root)
        if path:
            manifest.append({**item, "local_path": str(path), "downloaded_at": datetime.now(timezone.utc).isoformat()})
            click.echo(f"  OK {path.name}")
    m_path = out_root / authority.lower() / "manifest.json"
    m_path.parent.mkdir(parents=True, exist_ok=True)
    m_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
