# syntax=docker/dockerfile:1
# 1. Builder stage: scarica e compila le dipendenze
FROM python:3.11-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# 2. Final stage: immagine leggera e sicura di runtime
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/install/lib/python3.11/site-packages:$PYTHONPATH \
    PATH=/install/bin:$PATH

# Crea utente non privilegiato e directory dati per persistenza
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/data && \
    chown -R appuser:appuser /app

# Copia i pacchetti installati dal builder e il codice dell'app
COPY --from=builder /install /install
COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/').read()" || exit 1

# Use Gunicorn with 1 worker and 4 threads to handle concurrency
# and prevent APScheduler from running multiple times (sending duplicate emails)
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--bind", "0.0.0.0:5001", "app:app"]