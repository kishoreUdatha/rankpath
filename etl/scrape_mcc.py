"""Discover and download public MCC AIQ allotment PDFs.

Sources (public, no login):
    https://mcc.nic.in/UGCounselling/
    https://mcc.nic.in/UGCounselling/CurrentEvents
    https://mcc.nic.in/Archive/UG

Strategy: fetch landing HTML, find anchors ending in .pdf whose link text or
href suggests "Result" or "Allotment" or matches an AIQ round naming pattern,
filter by --years, save to data/raw/mcc/{year}/{slug}.pdf.

Falls back to Playwright when raw HTTP is blocked (some MCC pages are JS-rendered).

NEVER touches candidate login pages.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import urljoin

import click
import requests

MCC_PAGES = [
    "https://mcc.nic.in/ug-medical-counselling/",
    "https://mcc.nic.in/archive-ug/",
]
PDF_RX = re.compile(r'href="([^"]+\.pdf)"', re.IGNORECASE)
# Allotment-result-like vs. schedules/refunds/notices/withdraw/eligibility/info-bulletins
ALLOT_RX = re.compile(r"(result|allot|provisional|mop[- ]?up|stray|round\s*\d|special\s+round)", re.IGNORECASE)
EXCLUDE_RX = re.compile(r"(schedule|refund|notice|withdraw|eligibility|annexure|bulletin|fee\s*structure|weeding)", re.IGNORECASE)
YEAR_RX = re.compile(r"(20\d{2})")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; rankpath-etl/0.2; +public-data-only)"}

# NIC sites present a CA chain not in Mozilla's default bundle. We try certifi
# first; if SSL still fails, we fall back to verify=False (with a warning) since
# the data is public and we're just reading anchor tags.
def _setup_ssl() -> str | bool:
    try:
        import certifi
        return certifi.where()
    except ImportError:
        return True

_VERIFY = _setup_ssl()

def _http_get(url: str, *, timeout: int = 30) -> Optional[requests.Response]:
    try:
        return requests.get(url, headers=HEADERS, timeout=timeout, verify=_VERIFY)
    except requests.exceptions.SSLError:
        import urllib3
        urllib3.disable_warnings()
        try:
            return requests.get(url, headers=HEADERS, timeout=timeout, verify=False)
        except requests.RequestException as e:
            click.echo(f"  warn: {url} failed even with verify=False: {e}", err=True)
            return None
    except requests.RequestException as e:
        click.echo(f"  warn: {url}: {e}", err=True)
        return None


@dataclass
class PDFLink:
    url: str
    text: str
    year: Optional[int]


def _fetch_html_requests(url: str) -> Optional[str]:
    r = _http_get(url)
    if r is None:
        return None
    if r.status_code == 200 and len(r.text) > 500:
        return r.text
    click.echo(f"  warn: {url} -> HTTP {r.status_code}", err=True)
    return None


def _fetch_html_playwright(url: str) -> Optional[str]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(user_agent=HEADERS["User-Agent"])
            page = ctx.new_page()
            page.goto(url, timeout=30000)
            page.wait_for_load_state("networkidle", timeout=20000)
            html = page.content()
            browser.close()
            return html
    except Exception:
        return None


def fetch_html(url: str) -> Optional[str]:
    return _fetch_html_requests(url) or _fetch_html_playwright(url)


def discover_pdf_links(years: Iterable[int]) -> list[PDFLink]:
    years_set = set(years)
    found: dict[str, PDFLink] = {}
    for page_url in MCC_PAGES:
        html = fetch_html(page_url)
        if not html:
            click.echo(f"  warn: could not fetch {page_url}", err=True)
            continue
        # Extract anchor text + href pairs in a forgiving way
        for m in re.finditer(r'<a[^>]+href="([^"]+\.pdf)"[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL):
            href, text = m.group(1), re.sub(r"<.*?>", "", m.group(2)).strip()
            # Skip useless anchor texts ("View(8 MB)", "", duplicate icon links)
            if not text or re.match(r"^view\(", text, re.I):
                continue
            blob = text + " " + href
            if not ALLOT_RX.search(blob) or EXCLUDE_RX.search(blob):
                continue
            # Prefer year from the human-readable link text; fall back to URL.
            year_match = YEAR_RX.search(text) or YEAR_RX.search(href)
            year = int(year_match.group(1)) if year_match else None
            if years_set and (year is None or year not in years_set):
                continue
            abs_url = urljoin(page_url, href)
            # Dedup by URL: keep the entry with the most descriptive link text.
            existing = found.get(abs_url)
            if existing is None or len(text) > len(existing.text):
                found[abs_url] = PDFLink(url=abs_url, text=text, year=year)
    return list(found.values())


def download(link: PDFLink, out_root: Path) -> Optional[Path]:
    year = link.year or 0
    out_dir = out_root / "mcc" / str(year or "unknown")
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "_", link.text.lower()).strip("_")[:60] or "doc"
    out_path = out_dir / f"{slug}.pdf"
    if out_path.exists():
        return out_path
    r = _http_get(link.url, timeout=120)
    if r is None:
        return None
    if r.status_code != 200:
        click.echo(f"  warn: HTTP {r.status_code} for {link.url}", err=True)
        return None
    with out_path.open("wb") as fh:
        for chunk in r.iter_content(8192):
            fh.write(chunk)
    return out_path


@click.command()
@click.option("--years", multiple=True, type=int, required=True, help="Years to download, repeat flag: --years 2023 --years 2024")
@click.option("--out", type=click.Path(), default="data/raw")
def main(years: tuple[int, ...], out: str) -> None:
    out_root = Path(out)
    out_root.mkdir(parents=True, exist_ok=True)
    click.echo(f"Discovering MCC PDFs for years={list(years)} ...")
    links = discover_pdf_links(years)
    click.echo(f"Found {len(links)} candidate PDFs")
    manifest = []
    for link in links:
        path = download(link, out_root)
        if path:
            manifest.append({
                "url": link.url,
                "text": link.text,
                "year": link.year,
                "local_path": str(path),
                "downloaded_at": datetime.now(timezone.utc).isoformat(),
            })
            click.echo(f"  OK {path.name}")
    manifest_path = out_root / "mcc" / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    click.echo(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
