"""MCC AIQ category code -> canonical form.

Scope: AIQ only (no state-level codes). When MCC publishes a new code, add it here.
Unknown codes are returned as-is so the parser can reject + log them.
"""
import re

CANONICAL = {
    "UR": "UR",
    "OPEN": "UR",
    "GEN": "UR",
    "GENERAL": "UR",
    "EWS": "EWS",
    "OBC": "OBC",
    "OBCNCL": "OBC",
    "OBCNCLA": "OBC",
    "SC": "SC",
    "ST": "ST",
    "PWDUR": "PwD_UR",
    "PHUR": "PwD_UR",
    "PWDOBC": "PwD_OBC",
    "PHOBC": "PwD_OBC",
    "PWDSC": "PwD_SC",
    "PHSC": "PwD_SC",
    "PWDST": "PwD_ST",
    "PHST": "PwD_ST",
}


def normalize_category(raw: str) -> str:
    if not raw:
        return ""
    cleaned = re.sub(r"[\s\-_/&.,]", "", raw).upper()
    cleaned = cleaned.replace("CATEGORY", "")
    return CANONICAL.get(cleaned, raw.strip().upper())
