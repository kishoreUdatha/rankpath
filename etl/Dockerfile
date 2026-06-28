FROM python:3.11-slim

WORKDIR /work

# System deps for pdfplumber + playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpoppler-cpp-dev pkg-config curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY etl/requirements.txt /work/etl/requirements.txt
RUN pip install --no-cache-dir -r /work/etl/requirements.txt
RUN python -m playwright install --with-deps chromium || true

COPY etl /work/etl

ENV PYTHONPATH=/work
CMD ["python", "-m", "etl.seed_database", "--demo"]
