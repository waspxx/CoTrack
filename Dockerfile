# Usa un'immagine base di Python leggera
FROM python:3.11-slim

# Imposta la cartella di lavoro nel container
WORKDIR /app

# Copia il file delle dipendenze e installale
COPY requirements.txt .
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN pip install --upgrade --no-cache-dir git+https://github.com/rongardF/tvdatafeed.git
RUN pip install --upgrade --no-cache-dir git+https://github.com/druzsan/justetf-scraping.git
RUN pip install --no-cache-dir -r requirements.txt
# Installa Gunicorn per l'ambiente di produzione
RUN pip install --no-cache-dir gunicorn

# Copia tutto il resto del codice nell'immagine
COPY . .

# Espone la porta che userà Flask
EXPOSE 5001

# Use Gunicorn with 1 worker and 4 threads to handle concurrency
# and prevent APScheduler from running multiple times (sending duplicate emails)
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--bind", "0.0.0.0:5001", "app:app"]