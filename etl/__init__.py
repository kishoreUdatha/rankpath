"""RankPath ETL package.

Pulls public NEET UG MBBS/BDS allotment files from MCC and state
counselling authorities, parses PDFs/Excels, normalizes categories
and quotas, validates, and seeds Postgres.

Never accesses candidate login areas. Never stores PII.
"""
__version__ = "0.2.0"
