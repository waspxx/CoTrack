import os
import json
import logging
import requests
from datetime import datetime, date, timedelta
from calendar import monthrange
from dotenv import load_dotenv

load_dotenv()

try:
    from google import genai
except ImportError:
    genai = None

logger = logging.getLogger("budgetbakers_sync")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] [BUDGETBAKERS] %(levelname)s: %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

BASE_URL = "https://rest.budgetbakers.com/wallet/v1/api"


def map_categories_with_gemini(incoming_categories: list, existing_categories: list) -> dict:
    """
    Usa Gemini per mappare una lista di categorie BudgetBakers alle categorie esistenti in CoTrack.
    Ritorna un dizionario { "CategoriaBudgetBakers": "CategoriaCoTrackEsistente" }.
    """
    if not incoming_categories or not existing_categories:
        return {c: c for c in incoming_categories}

    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not gemini_key or not genai:
        return {c: c for c in incoming_categories}

    prompt = f"""Sei un assistente finanziario intelligente.
Il tuo compito è associare ciascuna categoria di transazione in arrivo da BudgetBakers (spesso in inglese o con nomi standard) a una delle categorie GIÀ PRESENTI nel database di CoTrack.

Regole:
1. Per ogni categoria in arrivo, scegli la categoria più appropriata e semanticamente affine tra quelle elencate in 'Categorie Esistenti'.
   Esempi:
   - "Groceries" -> "Generi alimentari" (o "Spesa")
   - "Interest, dividends" -> "Interessi, dividendi"
   - "Wage, invoices" -> "Stipendio, fatture"
   - "Vehicle - Fuel" o "Fuel" -> "Carburante"
   - "Restaurant, fast-food" -> "Ristorante, fast-food"
   - "Financial expenses" -> "Spese finanziarie"
   - "Life & Entertainment" -> "Vita e intrattenimento"
2. Se non esiste alcuna categoria affine adatta, traduci o mantieni un nome pulito in italiano.
3. Rispondi ESCLUSIVAMENTE con un JSON valido (senza markdown o altro testo prima o dopo):
{{
  "CategoriaBudgetBakers": "CategoriaEsistenteScelta"
}}

Categorie Esistenti nel Database CoTrack:
{json.dumps(existing_categories, ensure_ascii=False)}

Categorie da Mappare:
{json.dumps(incoming_categories, ensure_ascii=False)}
"""

    models_to_try = [
        os.environ.get('GEMINI_MODEL_FALLBACK', 'gemini-3.5-flash-lite'),
        os.environ.get('GEMINI_MODEL_PRIMARY', 'gemini-3.7-flash'),
        'gemini-2.5-flash'
    ]

    for model in models_to_try:
        try:
            client = genai.Client(api_key=gemini_key)
            response = client.models.generate_content(
                model=model,
                contents=prompt
            )
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            mapped = json.loads(raw_text)
            if isinstance(mapped, dict):
                logger.info(f"Mappatura categorie con Gemini ({model}) riuscita: {mapped}")
                return mapped
        except Exception as e:
            logger.warning(f"Tentativo mappatura con modello {model} fallito: {e}")

    return {c: c for c in incoming_categories}


class BudgetBakersSyncService:
    def __init__(self):
        pass

    def get_token(self, user_id=None, conn=None) -> str:
        """Recupera il token API BudgetBakers (da configurazione utente in DB o da .env)."""
        token = ""
        if conn and user_id:
            try:
                row = conn.execute(
                    "SELECT value FROM configurations WHERE key = ?",
                    (f"user_config:{user_id}:budgetbakers_token",)
                ).fetchone()
                if row and row['value']:
                    token = row['value'].strip()
            except Exception as e:
                logger.error(f"Errore recupero token dal DB: {e}")

        if not token:
            token = os.environ.get("BUDGETBAKERS_API_TOKEN", "").strip() or os.environ.get("BUDGETBAKERS_TOKEN", "").strip()

        return token

    def is_configured(self, user_id=None, conn=None) -> bool:
        return bool(self.get_token(user_id=user_id, conn=conn))

    def _get_headers(self, token: str) -> dict:
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "CoTrack/1.0"
        }

    def fetch_accounts(self, token: str) -> dict:
        """Restituisce una mappa {id: name} dei conti da BudgetBakers."""
        headers = self._get_headers(token)
        try:
            resp = requests.get(f"{BASE_URL}/accounts", headers=headers, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                acc_list = data if isinstance(data, list) else data.get('accounts', [])
                return {acc.get('id'): acc.get('name', 'Sconosciuto') for acc in acc_list}
            else:
                logger.warning(f"Errore fetch_accounts: {resp.status_code} - {resp.text}")
        except Exception as e:
            logger.error(f"Eccezione fetch_accounts: {e}")
        return {}

    def fetch_categories(self, token: str) -> dict:
        """Restituisce una mappa {id: name} delle categorie da BudgetBakers."""
        headers = self._get_headers(token)
        try:
            resp = requests.get(f"{BASE_URL}/categories", headers=headers, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                cat_list = data if isinstance(data, list) else data.get('categories', [])
                return {cat.get('id'): cat.get('name', 'Altro') for cat in cat_list}
            else:
                logger.warning(f"Errore fetch_categories: {resp.status_code} - {resp.text}")
        except Exception as e:
            logger.error(f"Eccezione fetch_categories: {e}")
        return {}

    def fetch_records_for_period(self, token: str, start_date: str, end_date: str) -> list:
        """
        Scarica tutti i record di BudgetBakers nell'intervallo [start_date, end_date].
        start_date e end_date in formato YYYY-MM-DD.
        Gestisce la paginazione automatica.
        """
        headers = self._get_headers(token)
        all_records = []
        limit = 200
        offset = 0

        while True:
            url = f"{BASE_URL}/records?recordDate=gte.{start_date}T00:00:00Z&recordDate=lte.{end_date}T23:59:59Z&limit={limit}&offset={offset}&sortBy=%2BrecordDate"
            try:
                resp = requests.get(url, headers=headers, timeout=20)
                if resp.status_code != 200:
                    logger.error(f"Errore fetch records (status {resp.status_code}): {resp.text}")
                    break

                data = resp.json()
                records = data.get('records', []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
                if not records:
                    break

                all_records.extend(records)

                if len(records) < limit:
                    break

                offset += limit
            except Exception as e:
                logger.error(f"Eccezione durante fetch records: {e}")
                break

        return all_records

    def sync_wallet(self, conn, wallet_id: int, user_id: int, start_date: str = None, end_date: str = None) -> dict:
        """
        Sincronizza le transazioni di BudgetBakers nel wallet specificato per il periodo dato.
        Se start_date e end_date non sono specificati, sincronizza il mese precedente.
        Include mappatura intelligente delle categorie tramite Gemini con cache persistente.
        """
        token = self.get_token(user_id=user_id, conn=conn)
        if not token:
            return {"success": False, "error": "Token API BudgetBakers non configurato."}

        # Calcola mese precedente se non specificato
        if not start_date or not end_date:
            today = date.today()
            if today.month == 1:
                prev_year = today.year - 1
                prev_month = 12
            else:
                prev_year = today.year
                prev_month = today.month - 1

            _, num_days = monthrange(prev_year, prev_month)
            start_date = f"{prev_year:04d}-{prev_month:02d}-01"
            end_date = f"{prev_year:04d}-{prev_month:02d}-{num_days:02d}"

        logger.info(f"Sincronizzazione BudgetBakers per wallet {wallet_id} dal {start_date} al {end_date}...")

        # Scarica mappe di supporto
        accounts_map = self.fetch_accounts(token)
        categories_map = self.fetch_categories(token)

        records = self.fetch_records_for_period(token, start_date, end_date)
        logger.info(f"Scaricati {len(records)} record da BudgetBakers.")

        # 1. Recupera categorie esistenti nel wallet di CoTrack
        cat_rows = conn.execute(
            "SELECT DISTINCT category FROM wallet_transactions WHERE wallet_id = ? AND category IS NOT NULL AND category != ''",
            (wallet_id,)
        ).fetchall()
        existing_categories = [r['category'] for r in cat_rows]
        existing_categories_lower = {c.lower(): c for c in existing_categories}

        # 2. Recupera cache delle mappature salvata in configurations
        cache_key = f"user_config:{user_id}:budgetbakers_cat_cache"
        cache_row = conn.execute("SELECT value FROM configurations WHERE key = ?", (cache_key,)).fetchone()
        cat_cache = {}
        if cache_row and cache_row['value']:
            try:
                cat_cache = json.loads(cache_row['value'])
            except Exception:
                cat_cache = {}

        # 3. Individua categorie nuove in arrivo da mappare
        unmapped_cats = set()
        for r in records:
            cat_obj = r.get('category') or {}
            c_name = cat_obj.get('name') if isinstance(cat_obj, dict) else None
            if not c_name and r.get('categoryId'):
                c_name = categories_map.get(r.get('categoryId'))
            if not c_name:
                c_name = 'Altro'

            # Se non è già identica (case-insensitive) a una categoria esistente e non è in cache
            if c_name.lower() not in existing_categories_lower and c_name not in cat_cache:
                unmapped_cats.add(c_name)

        # 4. Se ci sono categorie da mappare ed esistono categorie nel DB, chiedi a Gemini
        if unmapped_cats and existing_categories:
            logger.info(f"Mappatura Gemini per {len(unmapped_cats)} nuove categorie: {list(unmapped_cats)}")
            new_mappings = map_categories_with_gemini(list(unmapped_cats), existing_categories)
            cat_cache.update(new_mappings)
            # Salva la cache aggiornata nel DB per le prossime volte
            conn.execute(
                "INSERT OR REPLACE INTO configurations (key, value) VALUES (?, ?)",
                (cache_key, json.dumps(cat_cache, ensure_ascii=False))
            )
            conn.commit()

        # Carica transazioni esistenti nel database per deduplicazione
        esistenti = conn.execute(
            "SELECT account, category, currency, amount, date, note, type FROM wallet_transactions WHERE wallet_id = ?",
            (wallet_id,)
        ).fetchall()

        esistenti_set = set()
        for row in esistenti:
            esistenti_set.add((
                row['account'],
                row['category'],
                row['currency'],
                round(float(row['amount']), 2),
                row['date'],
                row['note'] or '',
                row['type']
            ))

        inseriti = 0
        gia_presenti = 0
        nuove_transazioni = []

        for r in records:
            # Data
            raw_date = r.get('recordDate') or r.get('createdAt') or ''
            data_op = raw_date[:10]
            if not data_op:
                continue

            # Conto
            account = r.get('accountName')
            if not account and r.get('accountId'):
                account = accounts_map.get(r.get('accountId'))
            if not account:
                account = 'Sconosciuto'

            # Categoria con applicazione della mappatura intelligente
            cat_obj = r.get('category') or {}
            raw_cat = cat_obj.get('name') if isinstance(cat_obj, dict) else None
            if not raw_cat and r.get('categoryId'):
                raw_cat = categories_map.get(r.get('categoryId'))
            if not raw_cat:
                raw_cat = 'Altro'

            # Risoluzione categoria finale
            if raw_cat in cat_cache:
                category = cat_cache[raw_cat]
            elif raw_cat.lower() in existing_categories_lower:
                category = existing_categories_lower[raw_cat.lower()]
            else:
                category = raw_cat

            # Importo & Valuta
            amount_obj = r.get('amount') or {}
            if isinstance(amount_obj, dict):
                amount_val = float(amount_obj.get('value', 0))
                currency = amount_obj.get('currencyCode') or 'EUR'
            else:
                amount_val = float(amount_obj or 0)
                currency = 'EUR'

            # Note / Descrizione
            note = (r.get('note') or '').strip()
            counterparty = (r.get('counterParty') or '').strip()
            if counterparty:
                if note and counterparty.lower() not in note.lower():
                    note = f"{counterparty} - {note}"
                elif not note:
                    note = counterparty

            # Tipo operazione (Expense, Income, Transfer)
            is_transfer = bool(r.get('isTransfer') or r.get('transfer'))
            rec_type = (r.get('recordType') or '').lower()

            if is_transfer or any(kw in category.lower() for kw in ['transfer', 'trasferiment', 'trasferisci', 'giroconto']):
                t_type = 'Transfer'
            elif rec_type == 'expense' or amount_val < 0:
                t_type = 'Expense'
                if amount_val > 0:
                    amount_val = -amount_val
            elif rec_type == 'income' or amount_val > 0:
                t_type = 'Income'
                if amount_val < 0:
                    amount_val = abs(amount_val)
            else:
                t_type = 'Expense' if amount_val < 0 else 'Income'

            record_tuple = (account, category, currency, round(amount_val, 2), data_op, note, t_type)

            if record_tuple in esistenti_set:
                gia_presenti += 1
                continue

            nuove_transazioni.append((wallet_id, account, category, currency, amount_val, data_op, note, t_type))
            esistenti_set.add(record_tuple)
            inseriti += 1

        if nuove_transazioni:
            conn.executemany('''
                INSERT INTO wallet_transactions (wallet_id, account, category, currency, amount, date, note, type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', nuove_transazioni)
            conn.commit()

        return {
            "success": True,
            "imported": inseriti,
            "ignored": gia_presenti,
            "total_fetched": len(records),
            "start_date": start_date,
            "end_date": end_date,
            "mapped_categories": cat_cache
        }


budgetbakers_service = BudgetBakersSyncService()
