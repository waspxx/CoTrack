from flask import Flask, render_template, request, jsonify, make_response, send_file, session
from flask_babel import Babel, _
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import requests
from bs4 import BeautifulSoup
import re
import pandas as pd
import os
import yfinance as yf
from datetime import datetime
import json
import csv
from io import StringIO
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import threading
import secrets
from datetime import timedelta
from apscheduler.schedulers.background import BackgroundScheduler
import atexit

try:
    from google import genai
except ImportError:
    genai = None

try:
    import PyPDF2
except ImportError:
    PyPDF2 = None

try:
    import justetf_scraping
except ImportError:
    justetf_scraping = None

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') # Obbligatoria per i form con Flask-WTF
# Configurazione del database SQLite
app.config['GEMINI_API_KEY'] = os.environ.get('GEMINI_API_KEY')
app.config['GEMINI_MODEL_PRIMARY'] = os.environ.get('GEMINI_MODEL_PRIMARY', 'gemini-3.5-flash')
app.config['GEMINI_MODEL_FALLBACK'] = os.environ.get('GEMINI_MODEL_FALLBACK', 'gemini-3.1-flash-lite')
app.config['BABEL_DEFAULT_LOCALE'] = 'en'
app.config['BABEL_SUPPORTED_LOCALES'] = ['en', 'it']
app.config['SMTP_SERVER'] = os.environ.get('SMTP_SERVER')
app.config['SMTP_PORT'] = int(os.environ.get('SMTP_PORT', 587))
app.config['SMTP_USERNAME'] = os.environ.get('SMTP_USERNAME')
app.config['SMTP_PASSWORD'] = os.environ.get('SMTP_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER')

def get_locale():
    if 'language' in session:
        return session['language']
    return request.accept_languages.best_match(app.config['BABEL_SUPPORTED_LOCALES'])

babel = Babel(app, locale_selector=get_locale)

@app.context_processor
def inject_locale():
    return dict(get_locale=get_locale)
DB_FOLDER = 'data'
DB_NAME = 'cotrack.db'
DATABASE_PATH = os.path.join(DB_FOLDER, DB_NAME)

import time

# Istanza globale per tvdatafeed e cache in memoria per minimizzare le richieste
tv_instance = None
tv_cache = {}
CACHE_TTL = 300  # Tempo di validità della cache in secondi (5 minuti)

def get_tv_hist_cached(ticker):
    global tv_instance
    now = time.time()
    if ticker in tv_cache and (now - tv_cache[ticker][1]) < CACHE_TTL:
        return tv_cache[ticker][0]
        
    if tv_instance is None:
        from tvDatafeed import TvDatafeed
        tv_instance = TvDatafeed()
        
    from tvDatafeed import Interval
    # Scarichiamo 5000 barre, usate poi sia per il prezzo attuale che per lo storico
    data = tv_instance.get_hist(symbol=ticker, exchange='OTCB', interval=Interval.in_daily, n_bars=5000)
    tv_cache[ticker] = (data, now)
    return data

# --- CACHE PER JUSTETF SCRAPING ---
etf_overview_cache = None

def get_ticker_from_isin(isin_code):
    global etf_overview_cache
    if justetf_scraping is None:
        return None
        
    if etf_overview_cache is None:
        try:
            # Carica l'overview degli ETF (può impiegare qualche secondo al primo avvio)
            etf_overview_cache = justetf_scraping.load_overview()
        except Exception as e:
            print(f"Errore nel caricamento di justetf_scraping: {e}")
            etf_overview_cache = pd.DataFrame()
            
    if not etf_overview_cache.empty and isin_code in etf_overview_cache.index:
        ticker = etf_overview_cache.loc[isin_code, 'ticker']
        return str(ticker.iloc[0]) if isinstance(ticker, pd.Series) else str(ticker)
    return None

# --- CACHE RISOLUZIONE TICKER (in-memory, per sessione server) ---
_ticker_resolve_cache = {}

def _get_default_exchange() -> str:
    """Legge l'exchange di default configurato nel DB (chiave 'default_exchange').
    Fallback: '.MI' per retrocompatibilità."""
    try:
        conn = get_db_connection()
        row = conn.execute("SELECT value FROM configurations WHERE key = 'default_exchange'").fetchone()
        conn.close()
        if row and row['value']:
            return row['value']
    except Exception:
        pass
    return '.MI'

def resolve_ticker_from_isin(isin_code: str, preferred_exchange: str = None) -> str:
    """Risolve un ISIN nel ticker Yahoo Finance più appropriato.

    Pipeline (in ordine di priorità):
    1. ISIN italiano (IT*) → restituisce l'ISIN grezzo (tvdatafeed lo gestisce)
    2. Cache in-memory → evita richieste di rete duplicate nella stessa sessione server
    3. justetf_scraping → ticker base ETF + suffisso exchange (più affidabile per ETF UCITS)
    4. Yahoo Finance Search API → usato per azioni e ETF non trovati da justetf
    5. ISIN grezzo → fallback finale

    Args:
        isin_code: es. 'IE00BK5BQT80'
        preferred_exchange: suffisso Yahoo override, es. '.AS', '.L', '.DE'.
                            Se None, usa il valore configurato nel DB (default '.MI').
    Returns:
        Ticker Yahoo pronto all'uso, es. 'VWCE.MI', 'AAPL', 'IWDA.L'
    """
    isin_code = isin_code.strip().upper()

    # Non è un ISIN (12 caratteri alfanumerici) → è già un ticker, restituiamo invariato
    if not re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', isin_code):
        return isin_code

    # ISIN italiani (BTP, titoli di stato, ecc.) → gestiti da tvdatafeed con ISIN grezzo
    if isin_code.startswith('IT'):
        return isin_code

    suffix = preferred_exchange or _get_default_exchange()
    cache_key = f"{isin_code}|{suffix}"

    # Cache hit
    if cache_key in _ticker_resolve_cache:
        return _ticker_resolve_cache[cache_key]

    result = isin_code  # fallback finale

    # --- Livello 1: justetf_scraping (ottimale per ETF UCITS europei) ---
    ticker_base = get_ticker_from_isin(isin_code)
    if ticker_base:
        result = f"{ticker_base}{suffix}"
    else:
        # --- Livello 2: Yahoo Finance Search (azioni, ETF non EU/non UCITS) ---
        try:
            url = (f'https://query2.finance.yahoo.com/v1/finance/search'
                   f'?q={isin_code}&quotesCount=8&newsCount=0')
            r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
            if r.status_code == 200:
                quotes = r.json().get('quotes', [])
                if quotes:
                    symbols = [q.get('symbol', '') for q in quotes if q.get('symbol')]
                    # Prima cerca un simbolo col suffisso preferito
                    matched = next((s for s in symbols if s.endswith(suffix)), None)
                    result = matched if matched else symbols[0]
        except Exception as e:
            print(f"Yahoo search fallita per {isin_code}: {e}")

    _ticker_resolve_cache[cache_key] = result
    return result

# --- 1. CONFIGURAZIONE DATABASE ---
def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row 
    return conn

def init_db():
    # Assicura che la cartella del DB esista
    os.makedirs(DB_FOLDER, exist_ok=True)
    conn = get_db_connection()

    # Auto-migration from Italian to English schema
    try:
        conn.execute("ALTER TABLE transazioni RENAME TO transactions")
        conn.execute("ALTER TABLE utenti RENAME TO users")
        conn.execute("ALTER TABLE portafogli RENAME TO portfolios")
        conn.execute("ALTER TABLE configurazioni RENAME TO configurations")
        conn.execute("ALTER TABLE storico_prezzi RENAME TO price_history")
        conn.execute("ALTER TABLE wallet_transazioni RENAME TO wallet_transactions")
        conn.execute("ALTER TABLE wallet_conti_config RENAME TO wallet_account_config")
        
        conn.execute("ALTER TABLE transactions RENAME COLUMN dataOperazione TO date")
        conn.execute("ALTER TABLE transactions RENAME COLUMN nomeEtf TO asset_name")
        conn.execute("ALTER TABLE transactions RENAME COLUMN tipoOperazione TO operation_type")
        conn.execute("ALTER TABLE transactions RENAME COLUMN prezzoQuota TO price_per_share")
        conn.execute("ALTER TABLE transactions RENAME COLUMN costoCommissioni TO fees")
        conn.execute("ALTER TABLE transactions RENAME COLUMN numeroQuote TO quantity")
        conn.execute("ALTER TABLE transactions RENAME COLUMN totaleOperazione TO total_value")
        conn.execute("ALTER TABLE transactions RENAME COLUMN tipoAsset TO asset_type")
        conn.execute("ALTER TABLE transactions RENAME COLUMN portafoglio_id TO portfolio_id")
        
        conn.execute("ALTER TABLE portfolios RENAME COLUMN utente_id TO user_id")
        conn.execute("ALTER TABLE portfolios RENAME COLUMN nome TO name")
        
        conn.execute("ALTER TABLE password_resets RENAME COLUMN utente_id TO user_id")
        conn.execute("ALTER TABLE password_resets RENAME COLUMN scadenza TO expires_at")
        
        conn.execute("ALTER TABLE configurations RENAME COLUMN chiave TO key")
        conn.execute("ALTER TABLE configurations RENAME COLUMN valore TO value")
        
        conn.execute("ALTER TABLE price_history RENAME COLUMN data TO date")
        conn.execute("ALTER TABLE price_history RENAME COLUMN prezzo TO price")
        
        conn.execute("ALTER TABLE wallet_transactions RENAME COLUMN portafoglio_id TO portfolio_id")
        conn.execute("ALTER TABLE wallet_transactions RENAME COLUMN data_operazione TO date")
        
        conn.execute("ALTER TABLE wallet_account_config RENAME COLUMN portafoglio_id TO portfolio_id")
        conn.execute("ALTER TABLE wallet_account_config RENAME COLUMN conto TO account")
        conn.execute("ALTER TABLE wallet_account_config RENAME COLUMN saldo_iniziale TO initial_balance")
        conn.execute("ALTER TABLE wallet_account_config RENAME COLUMN escluso TO excluded")
        
        conn.execute("UPDATE transactions SET operation_type = 'Buy' WHERE operation_type = 'Acquisto'")
        conn.execute("UPDATE transactions SET operation_type = 'Sell' WHERE operation_type = 'Vendita'")
        conn.execute("UPDATE transactions SET operation_type = 'Dividend' WHERE operation_type = 'Dividendo'")
        conn.execute("UPDATE transactions SET asset_type = 'Single Stocks' WHERE asset_type = 'Azioni singole'")
        conn.execute("UPDATE transactions SET asset_type = 'Single Bonds' WHERE asset_type = 'Obbligazioni Singole'")
        conn.execute("UPDATE transactions SET asset_type = 'Gold' WHERE asset_type = 'Oro'")
        conn.execute("UPDATE transactions SET asset_type = 'Cash' WHERE asset_type = 'Liquidità'")
    except sqlite3.OperationalError:
        pass

    conn.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            asset_name TEXT NOT NULL,
            operation_type TEXT NOT NULL,
            price_per_share REAL NOT NULL,
            fees REAL NOT NULL,
            quantity REAL NOT NULL,
            total_value REAL NOT NULL,
            asset_type TEXT,
            ticker TEXT,
            portfolio_id INTEGER
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS portfolios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS password_resets (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS configurations (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS price_history (
            date TEXT NOT NULL,
            ticker TEXT NOT NULL,
            price REAL NOT NULL,
            PRIMARY KEY (date, ticker)
        )
    ''')
    
    # Migrazione automatica da CSV a DB (se presente)
    csv_path = os.path.join(DB_FOLDER, 'price_history.csv')
    if os.path.exists(csv_path):
        try:
            df_csv = pd.read_csv(csv_path, index_col=0, parse_dates=True)
            records = [(date.strftime('%Y-%m-%d'), str(ticker), float(price)) 
                       for date, row in df_csv.iterrows() if pd.notna(date) 
                       for ticker, price in row.items() if pd.notna(price)]
            if records:
                conn.executemany('INSERT OR IGNORE INTO price_history (date, ticker, price) VALUES (?, ?, ?)', records)
            os.rename(csv_path, csv_path + ".migrated")
        except Exception as e:
            print(f"Errore migrazione CSV storico: {e}")

    # Nuove tabelle per la separazione
    conn.execute('''
        CREATE TABLE IF NOT EXISTS wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS bills_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS garages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')

    # Popolamento iniziale copiando da portfolios (mantenendo gli stessi ID)
    migration_done = conn.execute("SELECT value FROM configurations WHERE key = 'migration_portfolio_to_tabs_done'").fetchone()
    if not migration_done:
        conn.execute("INSERT OR IGNORE INTO wallets (id, user_id, name) SELECT id, user_id, name FROM portfolios")
        conn.execute("INSERT OR IGNORE INTO bills_profiles (id, user_id, name) SELECT id, user_id, name FROM portfolios")
        conn.execute("INSERT OR IGNORE INTO garages (id, user_id, name) SELECT id, user_id, name FROM portfolios")
        conn.execute("INSERT OR REPLACE INTO configurations (key, value) VALUES ('migration_portfolio_to_tabs_done', '1')")

    # Modifiche alle tabelle correlate per usare i nuovi ID
    try:
        conn.execute("ALTER TABLE wallet_transactions RENAME COLUMN portfolio_id TO wallet_id")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE wallet_account_config RENAME COLUMN portfolio_id TO wallet_id")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE bills RENAME COLUMN portfolio_id TO bills_id")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE bills_config RENAME COLUMN portfolio_id TO bills_id")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE vehicles RENAME COLUMN portfolio_id TO garage_id")
    except sqlite3.OperationalError:
        pass

    conn.execute('''
        CREATE TABLE IF NOT EXISTS wallet_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_id INTEGER NOT NULL,
            account TEXT,
            category TEXT,
            currency TEXT,
            amount REAL,
            date TEXT,
            note TEXT,
            type TEXT,
            FOREIGN KEY (wallet_id) REFERENCES wallets (id)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS wallet_account_config (
            wallet_id INTEGER NOT NULL,
            account TEXT NOT NULL,
            initial_balance REAL DEFAULT 0,
            excluded INTEGER DEFAULT 0,
            PRIMARY KEY (wallet_id, account),
            FOREIGN KEY (wallet_id) REFERENCES wallets (id)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bills_id INTEGER NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            water_price REAL DEFAULT 0,
            water_consumption REAL DEFAULT 0,
            electricity_price REAL DEFAULT 0,
            electricity_consumption REAL DEFAULT 0,
            gas_price REAL DEFAULT 0,
            gas_consumption REAL DEFAULT 0,
            FOREIGN KEY (bills_id) REFERENCES bills_profiles (id),
            UNIQUE(bills_id, year, month)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS bills_config (
            bills_id INTEGER PRIMARY KEY,
            water_unit TEXT DEFAULT 'm³',
            electricity_unit TEXT DEFAULT 'kWh',
            gas_unit TEXT DEFAULT 'Smc',
            FOREIGN KEY (bills_id) REFERENCES bills_profiles (id)
        )
    ''')

    # Vehicles table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS vehicles (
            id TEXT PRIMARY KEY,
            brand TEXT NOT NULL,
            model TEXT NOT NULL,
            type TEXT NOT NULL,
            fuel TEXT,
            plate TEXT,
            year INTEGER,
            odometer REAL,
            tankSize REAL,
            garage_id INTEGER NOT NULL,
            archived INTEGER DEFAULT 0,
            FOREIGN KEY (garage_id) REFERENCES garages (id) ON DELETE CASCADE
        )
    ''')

    # Loan groups table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS loan_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    # Loans table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS loans (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            principal REAL NOT NULL,
            interest_rate REAL NOT NULL,
            term_months INTEGER NOT NULL,
            start_date TEXT NOT NULL,
            monthly_payment REAL,
            user_id INTEGER NOT NULL,
            loan_group_id INTEGER,
            rate_type TEXT DEFAULT 'fixed',
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (loan_group_id) REFERENCES loan_groups (id) ON DELETE SET NULL
        )
    ''')
    try:
        conn.execute("ALTER TABLE loans ADD COLUMN rate_type TEXT DEFAULT 'fixed'")
    except sqlite3.OperationalError:
        pass

    # Loan payments table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS loan_payments (
            id TEXT PRIMARY KEY,
            loan_id TEXT NOT NULL,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY (loan_id) REFERENCES loans (id) ON DELETE CASCADE
        )
    ''')

    # Vehicle activities table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS vehicle_activities (
            id TEXT PRIMARY KEY,
            vehicleId TEXT NOT NULL,
            type TEXT NOT NULL,
            date TEXT NOT NULL,
            odometer REAL,
            notes TEXT,
            
            fuelType TEXT,
            priceUnit REAL,
            totalCost REAL,
            liters REAL,
            isFull INTEGER,
            
            fuel2 TEXT,
            priceUnit2 REAL,
            totalCost2 REAL,
            liters2 REAL,
            isFull2 INTEGER,
            
            fuel3 TEXT,
            priceUnit3 REAL,
            totalCost3 REAL,
            liters3 REAL,
            isFull3 INTEGER,
            
            consumption TEXT,
            distance REAL,
            gasStation TEXT,
            driver TEXT,
            reason TEXT,
            paymentMethod TEXT,
            
            category TEXT,
            cost REAL,
            location TEXT,
            
            description TEXT,
            provider TEXT,
            
            amount REAL,
            
            startLocation TEXT,
            endLocation TEXT,
            purpose TEXT,
            
            triggerType TEXT,
            targetDate TEXT,
            targetOdometer REAL,
            missedPrevious INTEGER DEFAULT 0,
            isRecurring INTEGER DEFAULT 0,
            recurrenceKm REAL,
            recurrenceVal INTEGER,
            recurrenceUnit TEXT,
            
            FOREIGN KEY (vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE
        )
    ''')
 
    # Ensure vehicle_activities has missedPrevious and recurring columns for existing databases
    try:
        conn.execute("ALTER TABLE vehicle_activities ADD COLUMN missedPrevious INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE vehicle_activities ADD COLUMN isRecurring INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE vehicle_activities ADD COLUMN recurrenceKm REAL")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE vehicle_activities ADD COLUMN recurrenceVal INTEGER")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE vehicle_activities ADD COLUMN recurrenceUnit TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        conn.execute("ALTER TABLE vehicles ADD COLUMN archived INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    try:
        conn.execute("ALTER TABLE loans ADD COLUMN loan_group_id INTEGER")
    except sqlite3.OperationalError:
        pass

    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vehicles_garage_id ON vehicles(garage_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vehicle_activities_vehicleId ON vehicle_activities(vehicleId)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON loan_payments(loan_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_loans_loan_group_id ON loans(loan_group_id)")
    except sqlite3.OperationalError:
        pass

    # ── SALARIES ──────────────────────────────────────────────────────────
    conn.execute('''
        CREATE TABLE IF NOT EXISTS salary_groups (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT    NOT NULL,
            user_id INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS salaries (
            id          TEXT    PRIMARY KEY,
            salary_group_id INTEGER NOT NULL,
            person_name TEXT    NOT NULL,
            month       TEXT    NOT NULL,
            gross       REAL    NOT NULL DEFAULT 0,
            net         REAL    NOT NULL DEFAULT 0,
            notes       TEXT,
            FOREIGN KEY (salary_group_id) REFERENCES salary_groups (id) ON DELETE CASCADE
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS salary_items (
            id         TEXT PRIMARY KEY,
            salary_id  TEXT NOT NULL,
            label      TEXT NOT NULL,
            amount     REAL NOT NULL DEFAULT 0,
            item_type  TEXT NOT NULL DEFAULT 'deduction',
            FOREIGN KEY (salary_id) REFERENCES salaries (id) ON DELETE CASCADE
        )
    ''')

    # ── PENSION FUNDS ─────────────────────────────────────────────────────
    conn.execute('''
        CREATE TABLE IF NOT EXISTS pension_fund_groups (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            name    TEXT    NOT NULL,
            user_id INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS pension_funds (
            id                   TEXT PRIMARY KEY,
            pension_fund_group_id INTEGER NOT NULL,
            name                 TEXT NOT NULL,
            provider             TEXT,
            fund_type            TEXT NOT NULL DEFAULT 'category',
            notes                TEXT,
            FOREIGN KEY (pension_fund_group_id) REFERENCES pension_fund_groups (id) ON DELETE CASCADE
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS pension_contributions (
            id            TEXT    PRIMARY KEY,
            fund_id       TEXT    NOT NULL,
            month         TEXT    NOT NULL,
            tfr           REAL    NOT NULL DEFAULT 0,
            worker_contrib REAL   NOT NULL DEFAULT 0,
            employer_contrib REAL NOT NULL DEFAULT 0,
            total_value   REAL    NOT NULL DEFAULT 0,
            notes         TEXT,
            FOREIGN KEY (fund_id) REFERENCES pension_funds (id) ON DELETE CASCADE
        )
    ''')

    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_salaries_group ON salaries(salary_group_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_salary_items_salary ON salary_items(salary_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pension_funds_group ON pension_funds(pension_fund_group_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pension_contributions_fund ON pension_contributions(fund_id)")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()

init_db()

# --- TASK SCHEDULATI (REPORT SETTIMANALE) ---
def generate_snapshot_for_portfolio(portfolio_id):
    conn = get_db_connection()
    transactions = conn.execute('SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY date ASC', (portfolio_id,)).fetchall()
    conn.close()
    if not transactions:
        return None

    transactions_dict = [dict(row) for row in transactions]
    portfolio = {}
    total_dividends = 0.0
    isin_to_ticker = {}

    for t in transactions_dict:
        isin = t['asset_name'].strip().upper()
        ticker = t['ticker'].strip().upper() if t.get('ticker') else isin
        isin_to_ticker[isin] = ticker

        if isin not in portfolio:
            portfolio[isin] = {'shares': 0.0, 'cost': 0.0}

        if t['operation_type'] in ['Acquisto', 'Buy']:
            portfolio[isin]['shares'] += t['quantity']
            portfolio[isin]['cost'] += t['total_value']
        elif t['operation_type'] in ['Vendita', 'Sell']:
            if portfolio[isin]['shares'] > 0:
                pmc = portfolio[isin]['cost'] / portfolio[isin]['shares']
                portfolio[isin]['shares'] -= t['quantity']
                portfolio[isin]['cost'] = portfolio[isin]['shares'] * pmc
        elif t['operation_type'] in ['Dividendo', 'Dividend']:
            total_dividends += t['total_value']

    invested_capital = 0.0
    current_value = 0.0
    allocation = []

    for isin, pos in portfolio.items():
        if pos['shares'] <= 0: continue
        invested_capital += pos['cost']
        fetch_ticker = isin_to_ticker[isin]
        
        prezzo_reale = None
        if re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', fetch_ticker) and fetch_ticker.startswith('IT'):
             data_btp = get_tv_hist_cached(fetch_ticker)
             if data_btp is not None and not data_btp.empty and 'close' in data_btp.columns:
                 prezzo_reale = float(data_btp['close'].iloc[-1])
        else:
             try:
                 url_yahoo = f"https://query1.finance.yahoo.com/v8/finance/chart/{fetch_ticker}"
                 risposta = requests.get(url_yahoo, headers={'User-Agent': 'Mozilla/5.0'})
                 if risposta.status_code == 200:
                     prezzo_reale = risposta.json()['chart']['result'][0]['meta']['regularMarketPrice']
             except Exception:
                 pass
        
        position_value = prezzo_reale * pos['shares'] if prezzo_reale is not None else pos['cost']
        current_value += position_value
        allocation.append(f"{fetch_ticker}: &euro;{position_value:,.2f}")

    capital_gain = current_value - invested_capital
    total_gain = capital_gain + total_dividends
    return_pct = (capital_gain / invested_capital * 100) if invested_capital > 0 else 0.0

    return {
        'invested': f"&euro;{invested_capital:,.2f}",
        'value': f"&euro;{current_value:,.2f}",
        'return_pct': f"{return_pct:.2f}",
        'gain': f"&euro;{total_gain:,.2f}",
        'allocation': "<br>".join(allocation)
    }

def get_portfolio_snapshot_at_date(portfolio_id, target_date=None):
    conn = get_db_connection()
    if target_date:
        transactions = conn.execute(
            'SELECT * FROM transactions WHERE portfolio_id = ? AND date <= ? ORDER BY date ASC',
            (portfolio_id, target_date)
        ).fetchall()
    else:
        transactions = conn.execute(
            'SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY date ASC',
            (portfolio_id,)
        ).fetchall()
    
    if not transactions:
        conn.close()
        return None

    transactions_dict = [dict(row) for row in transactions]
    portfolio = {}
    total_dividends = 0.0
    isin_to_ticker = {}

    for t in transactions_dict:
        isin = t['asset_name'].strip().upper()
        ticker = t['ticker'].strip().upper() if t.get('ticker') else isin
        isin_to_ticker[isin] = ticker

        if isin not in portfolio:
            portfolio[isin] = {'shares': 0.0, 'cost': 0.0}

        if t['operation_type'] in ['Acquisto', 'Buy']:
            portfolio[isin]['shares'] += t['quantity']
            portfolio[isin]['cost'] += t['total_value']
        elif t['operation_type'] in ['Vendita', 'Sell']:
            if portfolio[isin]['shares'] > 0:
                pmc = portfolio[isin]['cost'] / portfolio[isin]['shares']
                portfolio[isin]['shares'] -= t['quantity']
                portfolio[isin]['cost'] = portfolio[isin]['shares'] * pmc
        elif t['operation_type'] in ['Dividendo', 'Dividend']:
            total_dividends += t['total_value']

    invested_capital = 0.0
    current_value = 0.0
    allocation = {}

    for isin, pos in portfolio.items():
        if pos['shares'] <= 0: continue
        invested_capital += pos['cost']
        fetch_ticker = isin_to_ticker[isin]
        
        prezzo_reale = None
        if target_date:
            row = conn.execute(
                'SELECT price FROM price_history WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1',
                (fetch_ticker, target_date)
            ).fetchone()
            if row:
                prezzo_reale = row['price']
        else:
            if re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', fetch_ticker) and fetch_ticker.startswith('IT'):
                 data_btp = get_tv_hist_cached(fetch_ticker)
                 if data_btp is not None and not data_btp.empty and 'close' in data_btp.columns:
                     prezzo_reale = float(data_btp['close'].iloc[-1])
            else:
                 try:
                     url_yahoo = f"https://query1.finance.yahoo.com/v8/finance/chart/{fetch_ticker}"
                     risposta = requests.get(url_yahoo, headers={'User-Agent': 'Mozilla/5.0'})
                     if risposta.status_code == 200:
                         prezzo_reale = risposta.json()['chart']['result'][0]['meta']['regularMarketPrice']
                 except Exception:
                     pass
        
        if prezzo_reale is None:
            prezzo_reale = pos['cost'] / pos['shares'] if pos['shares'] > 0 else 0.0
            
        position_value = prezzo_reale * pos['shares']
        current_value += position_value
        allocation[fetch_ticker] = position_value

    conn.close()

    capital_gain = current_value - invested_capital
    total_gain = capital_gain + total_dividends
    return_pct = (capital_gain / invested_capital * 100) if invested_capital > 0 else 0.0

    return {
        'invested': invested_capital,
        'value': current_value,
        'return_pct': return_pct,
        'gain': total_gain,
        'allocation': allocation
    }

def markdown_to_html(md_text):
    import re
    html = md_text
    
    # Headers
    html = re.sub(r'### (.*?)(?:\n|$)', r'<h4>\1</h4>', html)
    html = re.sub(r'## (.*?)(?:\n|$)', r'<h3>\1</h3>', html)
    html = re.sub(r'# (.*?)(?:\n|$)', r'<h2>\1</h2>', html)
    
    # Bold / Strong
    html = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html)
    
    # Italic
    html = re.sub(r'\*(.*?)\*', r'<em>\1</em>', html)
    
    # Unordered Lists
    lines = html.split('\n')
    in_list = False
    for i, line in enumerate(lines):
        striped = line.strip()
        if striped.startswith('- ') or striped.startswith('* '):
            content = striped[2:]
            if not in_list:
                lines[i] = '<ul><li>' + content + '</li>'
                in_list = True
            else:
                lines[i] = '<li>' + content + '</li>'
        else:
            if in_list:
                lines[i-1] = lines[i-1] + '</ul>'
                in_list = False
    if in_list:
        lines[-1] = lines[-1] + '</ul>'
        
    html = '\n'.join(lines)
    html = html.replace('\n', '<br>')
    return html

def get_gemini_analysis_html(snapshot, portfolio_id=None):
    if not genai or not app.config.get('GEMINI_API_KEY'):
        return "<p>Errore: API Gemini non configurata.</p>"
        
    # Standardize snapshot data
    norm = {
        'invested': snapshot.get('invested'),
        'value': snapshot.get('value'),
        'return_pct': snapshot.get('return_pct'),
        'gain': snapshot.get('gain'),
        'allocation': snapshot.get('allocation')
    }
    if isinstance(norm['allocation'], str):
        norm['allocation'] = norm['allocation'].replace('<br>', '\n').replace('\r', '')

    past_snapshot = None
    if portfolio_id:
        try:
            target_date = (datetime.today() - timedelta(days=30)).strftime('%Y-%m-%d')
            past_snapshot = get_portfolio_snapshot_at_date(portfolio_id, target_date)
        except Exception as e:
            print(f"Errore recupero snapshot storico in get_gemini_analysis_html: {e}")

    # Format prompt data concisely to minimize tokens
    prompt_data = (
        f"T1 (Oggi):\n"
        f"- Capitale Investito: {norm['invested']}\n"
        f"- Valore Attuale: {norm['value']}\n"
        f"- Rendimento: {norm['return_pct']}%\n"
        f"- Guadagno: {norm['gain']}\n"
        f"- Allocazione:\n{norm['allocation']}\n"
    )

    if past_snapshot:
        alloc_past = ", ".join([f"{k}: €{v:,.2f}" for k, v in past_snapshot['allocation'].items()])
        prompt_data += (
            f"\nT0 (30 giorni fa):\n"
            f"- Capitale Investito: €{past_snapshot['invested']:,.2f}\n"
            f"- Valore Attuale: €{past_snapshot['value']:,.2f}\n"
            f"- Rendimento: {past_snapshot['return_pct']:.2f}%\n"
            f"- Guadagno: €{past_snapshot['gain']:,.2f}\n"
            f"- Allocazione: {alloc_past}\n"
        )

    prompt = f"""Role: Professional financial advisor (objective analysis only).
Task: Analyze the portfolio snapshot and perform a concise comparison of performance and allocation changes compared to 30 days ago (if T0 data is present).
Guidelines:
- Be extremely concise and direct (max 150 words).
- Avoid introductory boilerplate, generic phrases, or financial disclaimers.
- Focus only on significant performance changes and asset allocation shifts.
- Format response in Markdown (using headers, bold text, bullet points).
- Respond entirely in Italian.

Portfolio Data:
{prompt_data}"""

    try:
        client = genai.Client(api_key=app.config['GEMINI_API_KEY'])
        try:
            response = client.models.generate_content(
                model=app.config.get('GEMINI_MODEL_PRIMARY', 'gemini-3.5-flash'),
                contents=prompt
            )
        except Exception as primary_e:
            print(f"Errore modello primario in get_gemini_analysis_html: {primary_e}. Tentativo con il fallback.")
            response = client.models.generate_content(
                model=app.config.get('GEMINI_MODEL_FALLBACK', 'gemini-3.1-flash-lite'),
                contents=prompt
            )
        
        markdown_text = response.text.replace("```markdown", "").replace("```html", "").replace("```", "").strip()
        return markdown_to_html(markdown_text)
    except Exception as e:
        return f"<p>Errore durante l'analisi: {str(e)}</p>"

def send_weekly_report():
    with app.app_context():
        conn = get_db_connection()
        users = conn.execute("SELECT * FROM users").fetchall()
        
        for user in users:
            email_destinatario = user['username']
            if email_destinatario.lower() in ['admin', 'admin@admin.com']:
                email_destinatario = app.config.get('MAIL_DEFAULT_SENDER') or app.config.get('SMTP_USERNAME')
                
            if not email_destinatario or '@' not in email_destinatario: continue
                
            portfolios = conn.execute("SELECT * FROM portfolios WHERE user_id = ?", (user['id'],)).fetchall()
            report_html = "<h2>Resoconto Settimanale Portafogli</h2>"
            has_data = False
            
            for p in portfolios:
                snapshot = generate_snapshot_for_portfolio(p['id'])
                if snapshot:
                    has_data = True
                    analisi = get_gemini_analysis_html(snapshot, portfolio_id=p['id'])
                    report_html += f"<div style='background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;'>"
                    report_html += f"<h3>Portafoglio: {p['name']}</h3>"
                    report_html += f"<ul><li><b>Investito:</b> {snapshot['invested']}</li><li><b>Valore Attuale:</b> {snapshot['value']}</li>"
                    report_html += f"<li><b>Rendimento:</b> {snapshot['return_pct']}%</li><li><b>Guadagno Totale:</b> {snapshot['gain']}</li></ul>"
                    report_html += f"</div><div style='margin-bottom: 30px;'><h4>Analisi Intelligenza Artificiale:</h4>{analisi}</div><hr style='border-top: 1px solid #dee2e6;'>"
            
            if has_data and app.config.get('SMTP_SERVER') and app.config.get('SMTP_USERNAME'):
                msg = MIMEMultipart()
                msg['From'] = app.config.get('MAIL_DEFAULT_SENDER') or app.config.get('SMTP_USERNAME')
                msg['To'] = email_destinatario
                msg['Subject'] = "Resoconto Settimanale AI - CoTrack"
                msg.attach(MIMEText(report_html, 'html'))
                try:
                    server = smtplib.SMTP(app.config.get('SMTP_SERVER'), app.config.get('SMTP_PORT'))
                    server.starttls()
                    server.login(app.config.get('SMTP_USERNAME'), app.config.get('SMTP_PASSWORD'))
                    server.send_message(msg)
                    server.quit()
                except Exception as e: print(f"Errore invio report a {email_destinatario}: {e}")
        conn.close()

scheduler = BackgroundScheduler()
scheduler.add_job(func=send_weekly_report, trigger="cron", day_of_week='mon', hour=9, minute=0)
scheduler.start()
atexit.register(lambda: scheduler.shutdown())

# --- 2. ROTTE BASE (HTML e CRUD Transazioni) ---
@app.route('/')
def index():
    return render_template('index.html')

# --- 1.5 AUTENTICAZIONE E PORTAFOGLI ---
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (data.get('username'),)).fetchone()
    conn.close()
    
    if user and check_password_hash(user['password_hash'], data.get('password')):
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({"messaggio": _("Login successful")}), 200
    return jsonify({"errore": _("Invalid credentials")}), 401

def invia_email_benvenuto(destinatario):
    smtp_server = app.config.get('SMTP_SERVER')
    smtp_port = app.config.get('SMTP_PORT')
    smtp_user = app.config.get('SMTP_USERNAME')
    smtp_pass = app.config.get('SMTP_PASSWORD')
    mittente = app.config.get('MAIL_DEFAULT_SENDER') or smtp_user
    if not smtp_server or not smtp_user or not smtp_pass:
        print("Credenziali SMTP mancanti. Email non inviata.")
        return

    msg = MIMEMultipart()
    msg['From'] = mittente
    msg['To'] = destinatario
    msg['Subject'] = "Benvenuto in CoTrack!"
    corpo = f"<h3>Ciao {destinatario},</h3><p>La tua registrazione è andata a buon fine. Inizia subito a tracciare i tuoi investimenti!</p>"
    msg.attach(MIMEText(corpo, 'html'))

    try:
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        print(f"Email di benvenuto inviata con successo a {destinatario}")
    except Exception as e:
        print(f"Errore durante l'invio dell'email a {destinatario}: {e}")

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    conn = get_db_connection()
    try:
        username = data.get('username')
        if not username or '@' not in username:
            return jsonify({"errore": _("Username must be a valid email address")}), 400
            
        conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", 
                     (username, generate_password_hash(data.get('password'))))
        conn.commit()
        
        # Invia l'email in background se SMTP è configurato
        if app.config.get('SMTP_SERVER') and app.config.get('SMTP_USERNAME'):
            threading.Thread(target=invia_email_benvenuto, args=(username,)).start()
            
        return jsonify({"messaggio": _("Registration completed")}), 201
    except sqlite3.IntegrityError:
        return jsonify({"errore": _("Username already in use")}), 400
    finally:
        conn.close()

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"messaggio": _("Logout successful")}), 200

def invia_email_reset(destinatario, reset_link):
    smtp_server = app.config.get('SMTP_SERVER')
    smtp_port = app.config.get('SMTP_PORT')
    smtp_user = app.config.get('SMTP_USERNAME')
    smtp_pass = app.config.get('SMTP_PASSWORD')
    mittente = app.config.get('MAIL_DEFAULT_SENDER') or smtp_user
    if not smtp_server or not smtp_user or not smtp_pass:
        print("Credenziali SMTP mancanti. Email reset non inviata.")
        return

    msg = MIMEMultipart()
    msg['From'] = mittente
    msg['To'] = destinatario
    msg['Subject'] = "Reset Password - CoTrack"
    corpo = f"<h3>Ciao {destinatario},</h3><p>Hai richiesto il reset della tua password.</p><p>Clicca sul seguente link per impostarne una nuova (il link scadrà in 1 ora):</p><p><a href='{reset_link}'>{reset_link}</a></p><p>Se non sei stato tu a richiederlo, puoi ignorare questa email.</p>"
    msg.attach(MIMEText(corpo, 'html'))

    try:
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        print(f"Email di reset inviata con successo a {destinatario}")
    except Exception as e:
        print(f"Errore durante l'invio dell'email di reset a {destinatario}: {e}")

@app.route('/api/auth/forgot_password', methods=['POST'])
def forgot_password():
    email = request.json.get('username')
    if not email or '@' not in email:
        return jsonify({"errore": _("Valid email required")}), 400
        
    conn = get_db_connection()
    user = conn.execute("SELECT id FROM users WHERE username = ?", (email,)).fetchone()
    if user:
        token = secrets.token_urlsafe(32)
        scadenza = (datetime.now() + timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S')
        conn.execute("INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user['id'], scadenza))
        conn.commit()
        reset_link = f"{request.host_url.rstrip('/')}/?reset_token={token}"
        if app.config.get('SMTP_SERVER') and app.config.get('SMTP_USERNAME'):
            threading.Thread(target=invia_email_reset, args=(email, reset_link)).start()
    conn.close()
    return jsonify({"messaggio": _("If the email exists, a reset link has been sent.")}), 200

@app.route('/api/auth/reset_password', methods=['POST'])
def reset_password():
    data = request.json
    token, new_password = data.get('token'), data.get('password')
    if not token or not new_password: return jsonify({"errore": _("Missing data")}), 400
    conn = get_db_connection()
    reset_entry = conn.execute("SELECT user_id, expires_at FROM password_resets WHERE token = ?", (token,)).fetchone()
    if not reset_entry or datetime.now() > datetime.strptime(reset_entry['expires_at'], '%Y-%m-%d %H:%M:%S'):
        conn.close()
        return jsonify({"errore": _("Invalid or expired token")}), 400
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new_password), reset_entry['user_id']))
    conn.execute("DELETE FROM password_resets WHERE user_id = ?", (reset_entry['user_id'],))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": _("Password updated successfully")}), 200

@app.route('/api/auth/me', methods=['GET'])
def me():
    if 'user_id' in session:
        return jsonify({"username": session['username'], "id": session['user_id']})
    return jsonify({"errore": _("Not authenticated")}), 401

@app.route('/api/set_language', methods=['POST'])
def set_language():
    lang = request.json.get('language')
    if lang in app.config['BABEL_SUPPORTED_LOCALES']:
        session['language'] = lang
        return jsonify({"messaggio": "Language updated"}), 200
    return jsonify({"errore": "Invalid language"}), 400

@app.route('/api/resolve_ticker', methods=['GET'])
def resolve_ticker_api():
    """Risolve un ISIN nel ticker Yahoo Finance corrispondente.
    Query params: isin (required), exchange (optional, es. '.MI', '.AS', '.L')
    """
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    isin = request.args.get('isin', '').strip().upper()
    exchange = request.args.get('exchange', None)
    if not isin:
        return jsonify({"errore": "ISIN mancante"}), 400
    ticker = resolve_ticker_from_isin(isin, preferred_exchange=exchange)
    return jsonify({"isin": isin, "ticker": ticker})

@app.route('/api/settings/exchange', methods=['GET', 'POST'])
def settings_exchange():
    """Legge o salva l'exchange di default per la risoluzione ISIN."""
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    if request.method == 'POST':
        exchange = request.json.get('exchange', '.MI').strip().upper()
        if not re.match(r'^\.[A-Z]{1,4}$', exchange):
            conn.close()
            return jsonify({"errore": "Formato exchange non valido (es. .MI, .AS, .L)"}), 400
        conn.execute(
            "INSERT OR REPLACE INTO configurations (key, value) VALUES ('default_exchange', ?)",
            (exchange,)
        )
        conn.commit()
        conn.close()
        global _ticker_resolve_cache
        _ticker_resolve_cache = {}
        return jsonify({"messaggio": f"Exchange aggiornato a {exchange}", "exchange": exchange})
    else:
        row = conn.execute("SELECT value FROM configurations WHERE key = 'default_exchange'").fetchone()
        conn.close()
        return jsonify({"exchange": row['value'] if row and row['value'] else '.MI'})

@app.route('/api/portfolios', methods=['GET', 'POST'])
def manage_portfolios():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    
    if request.method == 'POST':
        nome = request.json.get('name') or request.json.get('nome') or _('New Portfolio')
        cursor = conn.execute("INSERT INTO portfolios (user_id, name) VALUES (?, ?)", (session['user_id'], nome))
        conn.commit()
        portfolio_id = cursor.lastrowid
        conn.close()
        return jsonify({"messaggio": _("Portfolio created"), "id": portfolio_id}), 201
        
    rows = conn.execute("SELECT * FROM portfolios WHERE user_id = ?", (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/portfolios/<int:portfolio_id>', methods=['PUT'])
def rename_portfolio(portfolio_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    
    nuovo_nome = request.json.get('name') or request.json.get('nome')
    if not nuovo_nome or not nuovo_nome.strip():
        return jsonify({"errore": _("Name cannot be empty")}), 400

    conn = get_db_connection()
    cursor = conn.execute(
        'UPDATE portfolios SET name = ? WHERE id = ? AND user_id = ?',
        (nuovo_nome.strip(), portfolio_id, session['user_id'])
    )
    conn.commit()
    
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"errore": _("Portfolio not found or unauthorized")}), 404
    
    conn.close()
    return jsonify({"messaggio": _("Portfolio renamed successfully")}), 200

@app.route('/api/portfolios/<int:portfolio_id>', methods=['DELETE'])
def delete_portfolio(portfolio_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    
    conn = get_db_connection()
    p = conn.execute("SELECT id FROM portfolios WHERE id = ? AND user_id = ?", (portfolio_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({"errore": _("Portfolio not found or unauthorized")}), 404
        
    # Elimina prima le transazioni per non lasciare dati orfani
    conn.execute("DELETE FROM transactions WHERE portfolio_id = ?", (portfolio_id,))
    conn.execute("DELETE FROM portfolios WHERE id = ?", (portfolio_id,))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": _("Portfolio deleted successfully")}), 200

# --- WALLETS CRUD ---
@app.route('/api/wallets', methods=['GET', 'POST'])
def manage_wallets():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    if request.method == 'POST':
        nome = request.json.get('name') or request.json.get('nome') or _('New Wallet')
        cursor = conn.execute("INSERT INTO wallets (user_id, name) VALUES (?, ?)", (session['user_id'], nome))
        conn.commit()
        wallet_id = cursor.lastrowid
        conn.close()
        return jsonify({"messaggio": _("Wallet created"), "id": wallet_id}), 201
    rows = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/wallets/<int:wallet_id>', methods=['PUT'])
def rename_wallet(wallet_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    nuovo_nome = request.json.get('name') or request.json.get('nome')
    if not nuovo_nome or not nuovo_nome.strip():
        return jsonify({"errore": _("Name cannot be empty")}), 400
    conn = get_db_connection()
    cursor = conn.execute(
        'UPDATE wallets SET name = ? WHERE id = ? AND user_id = ?',
        (nuovo_nome.strip(), wallet_id, session['user_id'])
    )
    conn.commit()
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"errore": _("Wallet not found or unauthorized")}), 404
    conn.close()
    return jsonify({"messaggio": _("Wallet renamed successfully")}), 200

@app.route('/api/wallets/<int:wallet_id>', methods=['DELETE'])
def delete_wallet(wallet_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    w = conn.execute("SELECT id FROM wallets WHERE id = ? AND user_id = ?", (wallet_id, session['user_id'])).fetchone()
    if not w:
        conn.close()
        return jsonify({"errore": _("Wallet not found or unauthorized")}), 404
    conn.execute("DELETE FROM wallet_transactions WHERE wallet_id = ?", (wallet_id,))
    conn.execute("DELETE FROM wallet_account_config WHERE wallet_id = ?", (wallet_id,))
    conn.execute("DELETE FROM wallets WHERE id = ?", (wallet_id,))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": _("Wallet deleted successfully")}), 200

# --- BILLS PROFILES CRUD ---
@app.route('/api/bills_profiles', methods=['GET', 'POST'])
def manage_bills_profiles():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    if request.method == 'POST':
        nome = request.json.get('name') or request.json.get('nome') or _('New Bills Group')
        cursor = conn.execute("INSERT INTO bills_profiles (user_id, name) VALUES (?, ?)", (session['user_id'], nome))
        conn.commit()
        bills_id = cursor.lastrowid
        conn.close()
        return jsonify({"messaggio": _("Bills group created"), "id": bills_id}), 201
    rows = conn.execute("SELECT * FROM bills_profiles WHERE user_id = ?", (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/bills_profiles/<int:bills_id>', methods=['PUT'])
def rename_bills_profile(bills_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    nuovo_nome = request.json.get('name') or request.json.get('nome')
    if not nuovo_nome or not nuovo_nome.strip():
        return jsonify({"errore": _("Name cannot be empty")}), 400
    conn = get_db_connection()
    cursor = conn.execute(
        'UPDATE bills_profiles SET name = ? WHERE id = ? AND user_id = ?',
        (nuovo_nome.strip(), bills_id, session['user_id'])
    )
    conn.commit()
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"errore": _("Bills group not found or unauthorized")}), 404
    conn.close()
    return jsonify({"messaggio": _("Bills group renamed successfully")}), 200

@app.route('/api/bills_profiles/<int:bills_id>', methods=['DELETE'])
def delete_bills_profile(bills_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    bp = conn.execute("SELECT id FROM bills_profiles WHERE id = ? AND user_id = ?", (bills_id, session['user_id'])).fetchone()
    if not bp:
        conn.close()
        return jsonify({"errore": _("Bills group not found or unauthorized")}), 404
    conn.execute("DELETE FROM bills WHERE bills_id = ?", (bills_id,))
    conn.execute("DELETE FROM bills_config WHERE bills_id = ?", (bills_id,))
    conn.execute("DELETE FROM bills_profiles WHERE id = ?", (bills_id,))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": _("Bills group deleted successfully")}), 200

# --- GARAGES CRUD ---
@app.route('/api/garages', methods=['GET', 'POST'])
def manage_garages():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    if request.method == 'POST':
        nome = request.json.get('name') or request.json.get('nome') or _('New Garage')
        cursor = conn.execute("INSERT INTO garages (user_id, name) VALUES (?, ?)", (session['user_id'], nome))
        conn.commit()
        garage_id = cursor.lastrowid
        conn.close()
        return jsonify({"messaggio": _("Garage created"), "id": garage_id}), 201
    rows = conn.execute("SELECT * FROM garages WHERE user_id = ?", (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/garages/<int:garage_id>', methods=['PUT'])
def rename_garage(garage_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    nuovo_nome = request.json.get('name') or request.json.get('nome')
    if not nuovo_nome or not nuovo_nome.strip():
        return jsonify({"errore": _("Name cannot be empty")}), 400
    conn = get_db_connection()
    cursor = conn.execute(
        'UPDATE garages SET name = ? WHERE id = ? AND user_id = ?',
        (nuovo_nome.strip(), garage_id, session['user_id'])
    )
    conn.commit()
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"errore": _("Garage not found or unauthorized")}), 404
    conn.close()
    return jsonify({"messaggio": _("Garage renamed successfully")}), 200

@app.route('/api/garages/<int:garage_id>', methods=['DELETE'])
def delete_garage(garage_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    g = conn.execute("SELECT id FROM garages WHERE id = ? AND user_id = ?", (garage_id, session['user_id'])).fetchone()
    if not g:
        conn.close()
        return jsonify({"errore": _("Garage not found or unauthorized")}), 404
    vehicles = conn.execute("SELECT id FROM vehicles WHERE garage_id = ?", (garage_id,)).fetchall()
    for v in vehicles:
        conn.execute("DELETE FROM vehicle_activities WHERE vehicleId = ?", (v['id'],))
    conn.execute("DELETE FROM vehicles WHERE garage_id = ?", (garage_id,))
    conn.execute("DELETE FROM garages WHERE id = ?", (garage_id,))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": _("Garage deleted successfully")}), 200

@app.route('/api/transactions', methods=['GET', 'POST'])
def manage_transactions():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    portfolio_id = request.args.get('portfolio_id')
    
    if request.method == 'POST':
        nuova_transazione = request.json
        isin = nuova_transazione['asset_name'].strip().upper()

        # Il frontend può inviare un ticker esplicito (campo ticker_override);
        # se valorizzato, ha la priorità sulla risoluzione automatica.
        ticker_override = (nuova_transazione.get('ticker') or '').strip()
        if ticker_override:
            ticker = ticker_override
        else:
            # Risoluzione automatica ISIN → ticker Yahoo Finance
            ticker = resolve_ticker_from_isin(isin)

        conn.execute('''
            INSERT INTO transactions (date, asset_name, ticker, operation_type, price_per_share, fees, quantity, total_value, asset_type, portfolio_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            nuova_transazione['date'],
            isin,
            ticker,
            nuova_transazione['operation_type'],
            nuova_transazione['price_per_share'],
            nuova_transazione['fees'],
            nuova_transazione['quantity'],
            nuova_transazione['total_value'],
            nuova_transazione['asset_type'],
            portfolio_id
        ))
        conn.commit()
        conn.close()
        return jsonify({"messaggio": _("Transaction saved successfully!")}), 201
        
    elif request.method == 'GET':
        transactions = conn.execute('SELECT * FROM transactions WHERE portfolio_id = ?', (portfolio_id,)).fetchall()
        conn.close()
        lista_transactions = [dict(row) for row in transactions]
        return jsonify(lista_transactions)

@app.route('/api/transactions/<int:id>', methods=['DELETE'])
def delete_transaction(id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    conn.execute('DELETE FROM transactions WHERE id = ? AND portfolio_id IN (SELECT id FROM portfolios WHERE user_id = ?)', (id, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": _("Transaction deleted!")}), 200

@app.route('/api/transactions/all', methods=['DELETE'])
def delete_all_transactions():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    portfolio_id = request.args.get('portfolio_id')
    conn = get_db_connection()
    conn.execute('DELETE FROM transactions WHERE portfolio_id = ?', (portfolio_id,))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": _("All transactions deleted!")}), 200

@app.route('/api/transactions/asset_type', methods=['PUT'])
def update_asset_type():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    portfolio_id = request.args.get('portfolio_id')
    
    data = request.json
    ticker = data.get('ticker')
    nuovo_tipo_asset = data.get('asset_type')
    
    if not ticker or not nuovo_tipo_asset:
        return jsonify({"errore": _("Missing data")}), 400
        
    conn = get_db_connection()
    conn.execute('UPDATE transactions SET asset_type = ? WHERE asset_name = ? AND portfolio_id = ? AND portfolio_id IN (SELECT id FROM portfolios WHERE user_id = ?)', 
                 (nuovo_tipo_asset, ticker, portfolio_id, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": _("Asset type updated successfully!")}), 200

# --- 2.1 IMPORT / EXPORT CSV ---
@app.route('/api/export_csv', methods=['GET'])
def export_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    portfolio_id = request.args.get('portfolio_id')
    conn = get_db_connection()
    
    # Recupero il nome del portafoglio
    p_row = conn.execute('SELECT name FROM portfolios WHERE id = ?', (portfolio_id,)).fetchone()
    nome_portafoglio = p_row['name'] if p_row else "portfolio"
    
    transactions = conn.execute('SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY date ASC', (portfolio_id,)).fetchall()
    conn.close()

    si = StringIO()
    cw = csv.writer(si)
    # Scriviamo le intestazioni delle colonne
    cw.writerow(['date', 'asset_name', 'ticker', 'operation_type', 'price_per_share', 'fees', 'quantity', 'total_value', 'asset_type'])
    
    # Scriviamo i dati
    for t in transactions:
        cw.writerow([t['date'], t['asset_name'], t['ticker'], t['operation_type'], t['price_per_share'], t['fees'], t['quantity'], t['total_value'], t['asset_type']])

    # Generazione del nome del file dinamico e normalizzato
    data_str = datetime.today().strftime('%Y%m%d')
    username = session.get('username', 'utente')
    nome_safe = "".join(c if c.isalnum() else "_" for c in nome_portafoglio) # Sostituisce spazi e caratteri speciali con underscore
    filename = f"{data_str}_{username}_{nome_safe}.csv"

    output = make_response(si.getvalue())
    output.headers["Content-Disposition"] = f"attachment; filename={filename}"
    output.headers["Content-type"] = "text/csv"
    return output

@app.route('/api/backup_db', methods=['GET'])
def backup_db():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    
    if not os.path.exists(DATABASE_PATH):
        return jsonify({"errore": _("Database not found")}), 404
        
    data_str = datetime.today().strftime('%Y%m%d')
    filename = f"{data_str}_portafoglio_backup.db"
    
    return send_file(os.path.abspath(DATABASE_PATH), as_attachment=True, download_name=filename)

@app.route('/api/import_csv', methods=['POST'])
def import_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    portfolio_id = request.args.get('portfolio_id')
    
    if 'file' not in request.files:
        return jsonify({"errore": _("No file uploaded")}), 400

    file = request.files['file']
    fonte = request.form.get('fonte', 'CoTrack')

    if file.filename == '':
        return jsonify({"errore": _("No file selected")}), 400

    if file and file.filename.endswith('.csv'):
        raw_content = file.stream.read()
        try:
            content = raw_content.decode("utf-8-sig")
        except UnicodeDecodeError:
            content = raw_content.decode("latin1")

        conn = get_db_connection()
        try:
            stream = StringIO(content, newline=None)
            csv_reader = csv.DictReader(stream)

            for row in csv_reader:
                isin = row.get('asset_name', row.get('nomeEtf', '')).strip().upper()
                if not isin: continue

                nome_etf = isin
                ticker = isin # Fallback

                if re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', isin):
                    ticker = resolve_ticker_from_isin(isin)

                esistente = conn.execute('''
                    SELECT 1 FROM transactions 
                    WHERE date = ? AND asset_name = ? AND operation_type = ? 
                        AND price_per_share = ? AND fees = ? AND quantity = ? 
                        AND total_value = ? AND asset_type = ? AND portfolio_id = ?
                ''', (row.get('date', row.get('dataOperazione')), nome_etf, row.get('operation_type', row.get('tipoOperazione')), float(row.get('price_per_share', row.get('prezzoQuota', 0))), float(row.get('fees', row.get('costoCommissioni', 0))), float(row.get('quantity', row.get('numeroQuote', 0))), float(row.get('total_value', row.get('totaleOperazione', 0))), row.get('asset_type', row.get('tipoAsset', 'ETF')), portfolio_id)).fetchone()
                
                if not esistente:
                    conn.execute('''
                        INSERT INTO transactions (date, asset_name, ticker, operation_type, price_per_share, fees, quantity, total_value, asset_type, portfolio_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (row.get('date', row.get('dataOperazione')), nome_etf, ticker, row.get('operation_type', row.get('tipoOperazione')), float(row.get('price_per_share', row.get('prezzoQuota', 0))), float(row.get('fees', row.get('costoCommissioni', 0))), float(row.get('quantity', row.get('numeroQuote', 0))), float(row.get('total_value', row.get('totaleOperazione', 0))), row.get('asset_type', row.get('tipoAsset', 'ETF')), portfolio_id))
            conn.commit()
        except Exception as e:
            conn.rollback()
            return jsonify({"errore": _("CSV format error: %(err)s", err=str(e))}), 500
        finally:
            conn.close()
        return jsonify({"messaggio": _("Import completed successfully!")}), 200

    return jsonify({"errore": _("Invalid file format. Expected CSV.")}), 400

@app.route('/api/preview_csv', methods=['POST'])
def preview_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    
    if 'file' not in request.files:
        return jsonify({"errore": _("No file uploaded")}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"errore": _("No file selected")}), 400

    if file and file.filename.endswith('.csv'):
        raw_content = file.stream.read()
        try:
            content = raw_content.decode("utf-8-sig")
        except UnicodeDecodeError:
            content = raw_content.decode("latin1")
            
        lines = [line for line in content.splitlines() if line.strip()]
        if not lines:
            return jsonify({"errore": _("The uploaded file is empty.")}), 400
            
        header_line = lines[0]
        delimiter = ';' if header_line.count(';') >= header_line.count(',') else ','
        
        stream = StringIO('\n'.join(lines), newline=None)
        csv_reader = csv.reader(stream, delimiter=delimiter)
        
        try:
            headers = next(csv_reader)
            sample_row = next(csv_reader, [])
        except StopIteration:
            return jsonify({"errore": _("CSV format error.")}), 400
            
        return jsonify({"headers": headers, "sample": sample_row, "delimiter": delimiter}), 200

    return jsonify({"errore": _("Invalid file format. Expected CSV.")}), 400

@app.route('/api/import_custom_csv', methods=['POST'])
def import_custom_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    portfolio_id = request.args.get('portfolio_id')
    
    if 'file' not in request.files:
        return jsonify({"errore": _("No file uploaded")}), 400

    file = request.files['file']
    mapping_str = request.form.get('mapping')
    if not mapping_str:
        return jsonify({"errore": _("Missing column mapping")}), 400
        
    try:
        mapping = json.loads(mapping_str)
    except json.JSONDecodeError:
        return jsonify({"errore": _("Invalid mapping format")}), 400

    raw_content = file.stream.read()
    try: content = raw_content.decode("utf-8-sig")
    except UnicodeDecodeError: content = raw_content.decode("latin1")
    
    lines = [line for line in content.splitlines() if line.strip()]
    if not lines: return jsonify({"errore": _("The uploaded file is empty.")}), 400
        
    header_line = lines[0]
    delimiter = ';' if header_line.count(';') >= header_line.count(',') else ','
    
    stream = StringIO('\n'.join(lines), newline=None)
    csv_reader = csv.DictReader(stream, delimiter=delimiter)
    
    conn = get_db_connection()
    try:
        for row in csv_reader:
            col_date, col_asset_name, col_operation_type = mapping.get('date'), mapping.get('asset_name'), mapping.get('operation_type')
            col_price, col_fees, col_quantity, col_total = mapping.get('price_per_share'), mapping.get('fees'), mapping.get('quantity'), mapping.get('total_value')
            
            if not col_date or not col_asset_name: continue
            
            date_val, asset_val = row.get(col_date, ''), row.get(col_asset_name, '')
            if not date_val or not asset_val: continue
            
            try:
                data_op = ""
                for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d', '%m/%d/%Y'):
                    try:
                        data_op = datetime.strptime(date_val.split(' ')[0], fmt).strftime('%Y-%m-%d')
                        break
                    except ValueError: pass
                if not data_op: data_op = date_val.split(' ')[0]
            except: continue
                
            def parse_num(col_name):
                if not col_name: return 0.0
                val_str = str(row.get(col_name, '0')).replace('€', '').replace('$', '').strip()
                if not val_str: return 0.0
                if ',' in val_str and '.' in val_str:
                    if val_str.rfind(',') > val_str.rfind('.'): val_str = val_str.replace('.', '').replace(',', '.')
                    else: val_str = val_str.replace(',', '')
                else:
                    val_str = val_str.replace(',', '.')
                try: return float(val_str)
                except: return 0.0

            raw_total = parse_num(col_total)
            raw_qty = parse_num(col_quantity)
            prezzo = parse_num(col_price)
            commissioni = parse_num(col_fees)
            
            op_val = row.get(col_operation_type, '') if col_operation_type else ''
            tipo = 'Buy'
            if op_val:
                op_lower = str(op_val).lower()
                if 'vendita' in op_lower or 'sell' in op_lower: tipo = 'Sell'
                elif 'dividendo' in op_lower or 'dividend' in op_lower: tipo = 'Dividend'
                elif 'acquisto' in op_lower or 'buy' in op_lower: tipo = 'Buy'
                else:
                    if raw_total < 0: tipo = 'Buy'
                    elif raw_total > 0: tipo = 'Sell'
            else:
                if raw_total < 0: tipo = 'Buy'
                elif raw_total > 0: tipo = 'Sell'

            qty = abs(raw_qty)
            totale = abs(raw_total)

            if (not col_total or totale == 0.0) and qty > 0 and prezzo > 0:
                totale = (prezzo * qty) - commissioni
                
            if (not col_price or prezzo == 0.0) and qty > 0 and totale > 0:
                prezzo = totale / qty
            
            if tipo == 'Dividend':
                qty = prezzo = 0
                
            isin = asset_val.strip().upper()
            # Rispetta la colonna ticker se già valorizzata nel CSV
            ticker_csv = str(row.get(mapping.get('ticker') or '', '') or '').strip()
            if ticker_csv:
                ticker = ticker_csv
            else:
                ticker = resolve_ticker_from_isin(isin)
                
            tipo_asset = 'ETF'
            esistente = conn.execute('''SELECT 1 FROM transactions WHERE date = ? AND asset_name = ? AND operation_type = ? AND price_per_share = ? AND fees = ? AND quantity = ? AND total_value = ? AND portfolio_id = ?''', (data_op, isin, tipo, float(prezzo), float(commissioni), float(qty), float(totale), portfolio_id)).fetchone()
            
            if not esistente:
                conn.execute('''INSERT INTO transactions (date, asset_name, ticker, operation_type, price_per_share, fees, quantity, total_value, asset_type, portfolio_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (data_op, isin, ticker, tipo, float(prezzo), float(commissioni), float(qty), float(totale), tipo_asset, portfolio_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"errore": _("Import error: %(err)s", err=str(e))}), 500
    finally: conn.close()
    return jsonify({"messaggio": _("Custom import completed successfully!")}), 200

# --- 2.2 IMPORT PDF TRANSAZIONE ---
@app.route('/api/import_pdf', methods=['POST'])
def import_pdf():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    portfolio_id = request.args.get('portfolio_id')
    
    if 'file' not in request.files:
        return jsonify({"errore": _("No file uploaded")}), 400
        
    file = request.files['file']
    fonte = request.form.get('fonte', 'Directa')
    
    if file.filename == '':
        return jsonify({"errore": _("No file selected")}), 400
        
    if file and file.filename.lower().endswith('.pdf'):
        if PyPDF2 is None:
            return jsonify({"errore": _("PyPDF2 library not installed. Add it to the server with 'pip install PyPDF2'.")}), 500
            
        try:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
                
            data_op, nome_etf, ticker, tipo = None, None, None, 'Buy'
            prezzo, commissioni, qty, totale = 0.0, 0.0, 0.0, 0.0
            tipo_asset = 'ETF'
            
            def parse_ita_float(val_str):
                if not val_str: return 0.0
                return float(val_str.replace('.', '').replace(',', '.'))
                
            if fonte == 'Directa':
                # Estrazione ISIN
                isin_match = re.search(r'ISIN\s+([A-Z0-9]{12})', text, re.IGNORECASE)
                if not isin_match: return jsonify({"errore": _("ISIN code not found in PDF")}), 400
                isin = isin_match.group(1).upper()
                nome_etf = ticker = isin
                
                ticker = resolve_ticker_from_isin(isin)
                    
                # Tipo Operazione
                tipo_match = re.search(r'Tipo di Operazione:\s+(Acquisto|Vendita)', text, re.IGNORECASE)
                if tipo_match: 
                    tipo = 'Buy' if tipo_match.group(1).capitalize() == 'Acquisto' else 'Sell'
                
                # Estrazione Valori da Riga "Eseguito" (Data, Qta, Totale, Prezzo)
                eseguito_match = re.search(r'(\d{1,2}\.\d{2}\.\d{4})\s+\d{2}:\d{2}:\d{2}\s+Eseguito\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)', text)
                if eseguito_match:
                    data_op = datetime.strptime(eseguito_match.group(1), '%d.%m.%Y').strftime('%Y-%m-%d')
                    qty = parse_ita_float(eseguito_match.group(2))
                    totale = parse_ita_float(eseguito_match.group(3))
                    prezzo = parse_ita_float(eseguito_match.group(4))
                else:
                    return jsonify({"errore": _("Execution data (quantity, price, total) not found in PDF")}), 400
                    
                # Estrazione Commissioni
                comm_match = re.search(r'Commissioni:\s*([\d.,]+)', text)
                if comm_match: commissioni = parse_ita_float(comm_match.group(1))
   
            # Controllo duplicato e Inserimento DB
            if data_op and nome_etf and qty > 0:
                conn = get_db_connection()
                esistente = conn.execute('SELECT 1 FROM transactions WHERE date = ? AND asset_name = ? AND quantity = ? AND portfolio_id = ?', (data_op, nome_etf, qty, portfolio_id)).fetchone()
                if not esistente:
                    conn.execute('INSERT INTO transactions (date, asset_name, ticker, operation_type, price_per_share, fees, quantity, total_value, asset_type, portfolio_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (data_op, nome_etf, ticker, tipo, prezzo, commissioni, qty, totale, tipo_asset, portfolio_id))
                    conn.commit()
                    conn.close()
                    return jsonify({"messaggio": _("Transaction for %(name)s imported successfully!", name=nome_etf)}), 200
                conn.close()
                return jsonify({"errore": _("This transaction has already been imported into the portfolio.")}), 400
                
        except Exception as e:
            return jsonify({"errore": _("Error reading PDF: %(err)s", err=str(e))}), 500
            
    return jsonify({"errore": _("Invalid file format. Expected PDF.")}), 400

@app.route('/api/preview_pdf', methods=['POST'])
def preview_pdf():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    
    if 'file' not in request.files:
        return jsonify({"errore": _("No file uploaded")}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"errore": _("No file selected")}), 400
        
    if file and file.filename.lower().endswith('.pdf'):
        if PyPDF2 is None:
            return jsonify({"errore": _("PyPDF2 library not installed.")}), 500
            
        try:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return jsonify({"text": text}), 200
        except Exception as e:
            return jsonify({"errore": _("Error reading PDF: %(err)s", err=str(e))}), 500
            
    return jsonify({"errore": _("Invalid file format. Expected PDF.")}), 400

@app.route('/api/analyze_portfolio', methods=['POST'])
def analyze_portfolio():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    
    if genai is None:
        return jsonify({"errore": _("Google Generative AI SDK not installed. Run 'pip install google-genai'.")}), 500
        
    api_key = app.config.get('GEMINI_API_KEY')
    if not api_key:
        return jsonify({"errore": _("Gemini API key not configured. Please set GEMINI_API_KEY environment variable.")}), 400

    data = request.json
    locale = get_locale()
    language_name = "Italian" if locale == 'it' else "English"

    # Normalize current data
    invested = data.get('investito') or data.get('invested')
    value = data.get('valore') or data.get('value')
    return_pct = data.get('rendimento') or data.get('return_pct')
    gain = data.get('guadagno') or data.get('gain')
    allocation = data.get('allocazione') or data.get('allocation')
    if isinstance(allocation, str):
        allocation = allocation.replace('<br>', '\n').replace('\r', '')

    portfolio_id = data.get('portfolio_id')
    past_snapshot = None
    if portfolio_id:
        try:
            target_date = (datetime.today() - timedelta(days=30)).strftime('%Y-%m-%d')
            past_snapshot = get_portfolio_snapshot_at_date(int(portfolio_id), target_date)
        except Exception as e:
            print(f"Errore recupero snapshot storico in analyze_portfolio: {e}")

    # Format the prompt data concisely to minimize input tokens
    prompt_data = (
        f"T1 (Oggi):\n"
        f"- Capitale Investito: {invested}\n"
        f"- Valore Attuale: {value}\n"
        f"- Rendimento: {return_pct}%\n"
        f"- Guadagno: {gain}\n"
        f"- Allocazione:\n{allocation}\n"
    )

    if past_snapshot:
        alloc_past = ", ".join([f"{k}: €{v:,.2f}" for k, v in past_snapshot['allocation'].items()])
        prompt_data += (
            f"\nT0 (30 giorni fa):\n"
            f"- Capitale Investito: €{past_snapshot['invested']:,.2f}\n"
            f"- Valore Attuale: €{past_snapshot['value']:,.2f}\n"
            f"- Rendimento: {past_snapshot['return_pct']:.2f}%\n"
            f"- Guadagno: €{past_snapshot['gain']:,.2f}\n"
            f"- Allocazione: {alloc_past}\n"
        )

    prompt = f"""Role: Professional financial advisor (objective analysis only).
Task: Analyze the portfolio snapshot and perform a concise comparison of performance and allocation changes compared to 30 days ago (if T0 data is present).
Guidelines:
- Be extremely concise and direct (max 150 words).
- Avoid introductory boilerplate, generic phrases, or financial disclaimers.
- Focus only on significant performance changes and asset allocation shifts.
- Format response in Markdown (using headers, bold text, bullet points).
- Respond entirely in {language_name}.

Portfolio Data:
{prompt_data}"""

    try:
        client = genai.Client(api_key=api_key)
        try:
            model_name = app.config.get('GEMINI_MODEL_PRIMARY', 'gemini-3.5-flash')
            response = client.models.generate_content(
                model=model_name,
                contents=prompt
            )
        except Exception as primary_e:
            print(f"Errore modello primario in analyze_portfolio: {primary_e}. Tentativo con il fallback.")
            fallback_model = app.config.get('GEMINI_MODEL_FALLBACK', 'gemini-3.1-flash-lite')
            response = client.models.generate_content(
                model=fallback_model,
                contents=prompt
            )
        markdown_text = response.text.replace("```markdown", "").replace("```html", "").replace("```", "").strip()
        return jsonify({"analisi": markdown_text}), 200
    except Exception as e:
        return jsonify({"errore": str(e)}), 500

# --- 3. PREZZI REAL-TIME (OGGI) ---
@app.route('/api/prezzo/<ticker>', methods=['GET'])
def ottieni_prezzo(ticker):
    ticker = ticker.strip().upper()
    headers = {'User-Agent': 'Mozilla/5.0'}

    # Controllo ISIN per BTP
    if re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', ticker):
        if ticker.startswith('IT'):
            try:
                # Recupera i dati storici completi dalla cache (o li scarica se non presenti/scaduti)
                data_btp = get_tv_hist_cached(ticker)
                if data_btp is not None and not data_btp.empty and 'close' in data_btp.columns:
                    prezzo = data_btp['close'].iloc[-1]
                    data_ultima = data_btp.index[-1].strftime('%Y-%m-%d')
                    return jsonify({"prezzo": float(prezzo), "data": data_ultima})
            except Exception as e:
                print(f"Errore tvdatafeed (live) per {ticker}: {e}")
        else:
            ticker = resolve_ticker_from_isin(ticker)
            
    # Fallback su Yahoo Finance
    try:
        url_yahoo = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        risposta = requests.get(url_yahoo, headers=headers)
        if risposta.status_code == 200:
            dati = risposta.json()
            if dati.get('chart') and dati['chart'].get('result'):
                meta = dati['chart']['result'][0]['meta']
                prezzo = meta['regularMarketPrice']
                timestamp = meta.get('regularMarketTime')
                if timestamp:
                    data_ultima = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d')
                else:
                    data_ultima = datetime.today().strftime('%Y-%m-%d')
                return jsonify({"prezzo": prezzo, "data": data_ultima})
    except Exception as e:
         print(f"Errore Yahoo Finance: {e}")

    return jsonify({"prezzo": None, "data": None}), 404


# --- 4. LA MACCHINA DEL TEMPO: SERIE STORICHE ---
@app.route('/api/historical_performance', methods=['GET'])
def historical_performance():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    portfolio_id = request.args.get('portfolio_id')
    
    conn = get_db_connection()
    transactions = conn.execute('SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY date ASC', (portfolio_id,)).fetchall()
    conn.close()

    if not transactions:
        return jsonify({"date": [], "values": [], "invested": [], "tickers": {}, "api_errors": []})

    lista_transactions = [dict(row) for row in transactions]

    # Identifichiamo tutti gli ISIN unici e i loro ticker associati
    tutti_gli_isin_unici = {t['asset_name'].strip().upper() for t in lista_transactions}
    tickers_yahoo = []
    tickers_btp = []
    # Mappa l'ISIN (nomeEtf) al ticker da usare per scaricare i dati.
    isin_to_fetch_ticker_map = {t['asset_name'].strip().upper(): t['ticker'].strip().upper() if t.get('ticker') else t['asset_name'].strip().upper() for t in lista_transactions}

    # Creiamo un set di ISIN che sono classificati come Obbligazioni Singole
    obbligazioni_singole_isin = {
        t['asset_name'].strip().upper() 
        for t in lista_transactions 
        if t.get('asset_type') == 'Single Bonds' or t.get('asset_type') == 'Obbligazioni Singole'
    }

    for isin in tutti_gli_isin_unici:
        fetch_ticker = isin_to_fetch_ticker_map.get(isin, isin)
        
        is_bond = (
            isin.startswith('IT') and 
            re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', isin) and
            isin in obbligazioni_singole_isin
        )

        if is_bond:
            tickers_btp.append(fetch_ticker) # Per i BTP, il fetch_ticker è l'ISIN stesso
        else:
            tickers_yahoo.append(fetch_ticker)

    tickers_benchmarks = ['VWCE.MI', 'VNGA80.MI', 'VNGA60.MI', 'VNGA40.MI', 'VNGA20.MI', 'AGGH.MI']
    tickers_yahoo_lista = list(set(tickers_yahoo + tickers_benchmarks))

    # Definiamo la linea temporale
    data_inizio_str = lista_transactions[0]['date']
    data_inizio = datetime.strptime(data_inizio_str, '%Y-%m-%d')
    oggi = datetime.today()

    api_errors = []
    tutti_i_tickers = list(set(tickers_yahoo_lista + tickers_btp))
    
    # Carica cache dal DB
    conn_db = get_db_connection()
    if tutti_i_tickers:
        placeholders = ','.join(['?'] * len(tutti_i_tickers))
        query = f"SELECT date, ticker, price FROM price_history WHERE date >= ? AND ticker IN ({placeholders})"
        df_db = pd.read_sql_query(query, conn_db, params=[data_inizio_str] + tutti_i_tickers)
    else:
        df_db = pd.DataFrame()
    conn_db.close()

    cache_mercato = pd.DataFrame()
    if not df_db.empty:
        df_db['date'] = pd.to_datetime(df_db['date'])
        cache_mercato = df_db.pivot(index='date', columns='ticker', values='price')

    all_price_series = []
    new_data_frames = []
    oggi_str = oggi.strftime('%Y-%m-%d')

    # Scarichiamo la storia dei prezzi per i ticker supportati da Yahoo
    if tickers_yahoo_lista:
        # Raggruppa i ticker per data di inizio mancante per minimizzare il traffico API
        fetch_groups = {}
        for ticker in tickers_yahoo_lista:
            start_fetch = data_inizio_str
            if not cache_mercato.empty and ticker in cache_mercato.columns:
                valid_dates = cache_mercato[ticker].dropna().index
                if len(valid_dates) > 0:
                    start_fetch = (valid_dates.max() + pd.Timedelta(days=1)).strftime('%Y-%m-%d')
            
            if start_fetch <= oggi_str:
                if start_fetch not in fetch_groups:
                    fetch_groups[start_fetch] = []
                fetch_groups[start_fetch].append(ticker)

        for start_date, tickers_group in fetch_groups.items():
            try:
                data = yf.download(tickers_group, start=start_date, progress=False)
                if not data.empty:
                    close_prices = data.get('Close')
                    if close_prices is not None:
                        if isinstance(close_prices, pd.DataFrame):
                            for ticker in close_prices.columns:
                                s = close_prices[ticker].dropna()
                                if not s.empty:
                                    s.name = ticker
                                    new_data_frames.append(s)
                        elif isinstance(close_prices, pd.Series):
                            s = close_prices.dropna()
                            if not s.empty:
                                s.name = tickers_group[0]
                                new_data_frames.append(s)
                else:
                    api_errors.append(f"yfinance (nessun dato per {tickers_group})")
            except Exception as e:
                print(f"Errore nel download storico da yfinance: {e}")
                api_errors.append("yfinance")

    # Scarichiamo dati storici per BTP con tvdatafeed
    if tickers_btp:
        for ticker in tickers_btp:
            start_fetch = data_inizio_str
            if not cache_mercato.empty and ticker in cache_mercato.columns:
                valid_dates = cache_mercato[ticker].dropna().index
                if len(valid_dates) > 0:
                    start_fetch = (valid_dates.max() + pd.Timedelta(days=1)).strftime('%Y-%m-%d')

            if start_fetch <= oggi_str:
                try:
                    data_btp = get_tv_hist_cached(ticker)
                    if data_btp is not None and not data_btp.empty and 'close' in data_btp.columns:
                        data_btp_copy = data_btp.copy()
                        data_btp_copy.index = data_btp_copy.index.tz_localize(None)
                        btp_series = data_btp_copy['close'].rename(ticker)
                        btp_series = btp_series[btp_series.index >= start_fetch]
                        if not btp_series.empty:
                            new_data_frames.append(btp_series)
                        print(f"Dati storici per BTP {ticker} scaricati con successo.")
                    else:
                        api_errors.append(f"tvdatafeed ({ticker})")
                except Exception as e:
                    print(f"Errore tvdatafeed per {ticker}: {e}. Verrà usato il valore di carico.")
                    api_errors.append(f"tvdatafeed ({ticker})")

    # Combiniamo tutte le serie in un unico DataFrame
    dati_mercato_nuovi = pd.DataFrame()
    if new_data_frames:
        dati_mercato_nuovi = pd.concat(new_data_frames, axis=1, sort=False)
        dati_mercato_nuovi.index = pd.to_datetime(dati_mercato_nuovi.index)
        if getattr(dati_mercato_nuovi.index, 'tz', None) is not None:
            dati_mercato_nuovi.index = dati_mercato_nuovi.index.tz_localize(None)
            
        # Salva i nuovi dati nel database
        records = [(date.strftime('%Y-%m-%d'), str(ticker), float(prezzo)) 
                   for date, row in dati_mercato_nuovi.iterrows() 
                   for ticker, prezzo in row.items() if pd.notna(prezzo)]
        
        if records:
            conn_db = get_db_connection()
            conn_db.executemany('INSERT OR REPLACE INTO price_history (date, ticker, price) VALUES (?, ?, ?)', records)
            conn_db.commit()
            conn_db.close()

    dati_mercato = pd.DataFrame()
    if not cache_mercato.empty:
        if not dati_mercato_nuovi.empty:
            dati_mercato = dati_mercato_nuovi.combine_first(cache_mercato)
        else:
            dati_mercato = cache_mercato
    else:
        dati_mercato = dati_mercato_nuovi

    if not dati_mercato.empty:
        dati_mercato.ffill(inplace=True)

    # Creiamo un calendario giornaliero
    calendario = pd.date_range(start=data_inizio, end=oggi)
    
    quote_attuali = {}
    tickers_history = { isin: {"values": [], "invested": [], "dividends": []} for isin in tutti_gli_isin_unici }
    benchmarks_history = { b: [] for b in tickers_benchmarks }

    # Raggruppiamo le transazioni per data per maggiore velocità
    transactions_by_date = {}
    for t in lista_transactions:
        d = t['date']
        transactions_by_date.setdefault(d, []).append(t)

    # CALCOLO GIORNO PER GIORNO
    date_formattate = []
    storico_valore = []
    storico_investito = []
    storico_dividendi = []
    for giorno in calendario:
        data_str = giorno.strftime('%Y-%m-%d')

        # 1. Controlliamo se in questo giorno abbiamo comprato o venduto qualcosa
        if data_str in transactions_by_date:
            for t in transactions_by_date[data_str]:
                isin = t['asset_name'].strip().upper()
                if isin not in quote_attuali:
                    quote_attuali[isin] = {'quote': 0, 'costo': 0, 'dividendi': 0}

                if t['operation_type'] in ['Acquisto', 'Buy']:
                    quote_attuali[isin]['quote'] += t['quantity']
                    quote_attuali[isin]['costo'] += t['total_value']
                elif t['operation_type'] in ['Vendita', 'Sell']:
                    if quote_attuali[isin]['quote'] > 0:
                        pmc = quote_attuali[isin]['costo'] / quote_attuali[isin]['quote']
                        quote_attuali[isin]['quote'] -= t['quantity']
                        quote_attuali[isin]['costo'] -= pmc * t['quantity']
                elif t['operation_type'] in ['Dividendo', 'Dividend']:
                    quote_attuali[isin]['dividendi'] += t['total_value']

        # 2. Calcoliamo il Valore e l'Investito del portafoglio in questo giorno
        valore_giorno = 0
        investito_giorno = 0
        dividendi_giorno = 0
        for isin in tutti_gli_isin_unici:
            fetch_ticker = isin_to_fetch_ticker_map.get(isin, isin)
            dati = quote_attuali.get(isin, {'quote': 0, 'costo': 0, 'dividendi': 0})
            valore_ticker = 0
            investito_ticker = dati['costo']
            dividendi_ticker = dati['dividendi']
            
            if dati['quote'] > 0:
                # Se abbiamo dati storici per questo ticker, usiamoli
                if not dati_mercato.empty and fetch_ticker in dati_mercato.columns and not dati_mercato[fetch_ticker].dropna().empty:
                    try:
                        # Usiamo 'asof' per trovare l'ultimo prezzo valido fino a quel giorno (gestisce i weekend)
                        prezzo = dati_mercato[fetch_ticker].asof(pd.Timestamp(giorno))
                        if pd.notna(prezzo):
                            valore_ticker = prezzo * dati['quote']
                        else: # Se non ci sono dati storici prima di questa data, usiamo il costo
                            valore_ticker = dati['costo']
                    except Exception as e:
                        print(f"Errore nel calcolo del valore per {isin} il {giorno}: {e}")
                        valore_ticker = dati['costo'] # Fallback in caso di errore
                else:
                    # Altrimenti, usiamo il valore di carico
                    valore_ticker = dati['costo']

            tickers_history[isin]["values"].append(valore_ticker)
            tickers_history[isin]["invested"].append(investito_ticker)
            tickers_history[isin]["dividends"].append(dividendi_ticker)
            
            valore_giorno += valore_ticker
            investito_giorno += investito_ticker
            dividendi_giorno += dividendi_ticker

        # 3. Estraiamo il prezzo dei benchmark
        for b in tickers_benchmarks:
            prezzo_b = 0
            if not dati_mercato.empty and b in dati_mercato.columns and not dati_mercato[b].dropna().empty:
                try:
                    p = dati_mercato[b].asof(pd.Timestamp(giorno))
                    if pd.notna(p):
                        prezzo_b = float(p)
                except Exception:
                    pass
            benchmarks_history[b].append(prezzo_b)

        # Salviamo il "fotogramma" di questa giornata
        date_formattate.append(data_str)
        storico_valore.append(valore_giorno)
        storico_investito.append(investito_giorno)
        storico_dividendi.append(dividendi_giorno)

    # Restituiamo i 3 array pronti per Chart.js!
    return jsonify({
        "date": date_formattate,
        "values": storico_valore,
        "invested": storico_investito,
        "dividends": storico_dividendi,
        "tickers": tickers_history,
        "isin_map": isin_to_fetch_ticker_map,
        "benchmarks": benchmarks_history,
        "api_errors": list(set(api_errors))
    })

# --- 5. INTEGRAZIONE WALLET (BUDGETBAKERS) ---
@app.route('/api/wallet/transactions', methods=['GET'])
def get_wallet_transactions():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    wallet_id = request.args.get('wallet_id')
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM wallet_transactions WHERE wallet_id = ? ORDER BY date DESC', (wallet_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/wallet/transactions/<int:transaction_id>/category', methods=['PUT'])
def update_wallet_transaction_category(transaction_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    
    data = request.json
    new_category = data.get('category')
    
    if not new_category:
        return jsonify({"errore": _("Missing category")}), 400
    
    conn = get_db_connection()
    try:
        conn.execute('UPDATE wallet_transactions SET category = ? WHERE id = ?', (new_category, transaction_id))
        conn.commit()
        return jsonify({"messaggio": _("Category updated successfully")}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"errore": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/wallet/account_config', methods=['GET', 'POST'])
def manage_wallet_account_config():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    wallet_id = request.args.get('wallet_id')
    conn = get_db_connection()
    
    if request.method == 'POST':
        data = request.json
        account = data.get('account')
        initial_balance = data.get('initial_balance', 0)
        excluded = 1 if data.get('excluded') else 0
        
        conn.execute('''
            INSERT OR REPLACE INTO wallet_account_config (wallet_id, account, initial_balance, excluded)
            VALUES (?, ?, ?, ?)
        ''', (wallet_id, account, float(initial_balance), excluded))
        conn.commit()
        conn.close()
        return jsonify({"messaggio": _("Configuration saved!")}), 200
        
    elif request.method == 'GET':
        rows = conn.execute('SELECT * FROM wallet_account_config WHERE wallet_id = ?', (wallet_id,)).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

@app.route('/api/wallet/transactions/all', methods=['DELETE'])
def delete_all_wallet_transactions():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    wallet_id = request.args.get('wallet_id')
    conn = get_db_connection()
    conn.execute('DELETE FROM wallet_transactions WHERE wallet_id = ?', (wallet_id,))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": _("All Wallet transactions deleted!")}), 200

@app.route('/api/wallet/transactions/bulk', methods=['DELETE'])
def delete_bulk_wallet_transactions():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    wallet_id = request.args.get('wallet_id')
    
    data = request.json
    ids = data.get('ids', [])
    
    if not ids:
        return jsonify({"errore": _("No transactions selected")}), 400
        
    conn = get_db_connection()
    try:
        placeholders = ','.join(['?'] * len(ids))
        query = f'DELETE FROM wallet_transactions WHERE wallet_id = ? AND id IN ({placeholders})'
        conn.execute(query, [wallet_id] + ids)
        conn.commit()
        return jsonify({"messaggio": _("Selected transactions deleted!")}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"errore": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/wallet/export_csv', methods=['GET'])
def export_wallet_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    wallet_id = request.args.get('wallet_id')
    conn = get_db_connection()
    
    p_row = conn.execute('SELECT name FROM wallets WHERE id = ? AND user_id = ?', (wallet_id, session['user_id'])).fetchone()
    nome_portafoglio = p_row['name'] if p_row else "portfolio"
    
    transactions = conn.execute('SELECT * FROM wallet_transactions WHERE wallet_id = ? ORDER BY date ASC', (wallet_id,)).fetchall()
    conn.close()

    si = StringIO()
    cw = csv.writer(si)
    cw.writerow(['account', 'category', 'currency', 'amount', 'date', 'note', 'type'])
    
    for t in transactions:
        cw.writerow([t['account'], t['category'], t['currency'], t['amount'], t['date'], t['note'], t['type']])

    data_str = datetime.today().strftime('%Y%m%d')
    username = session.get('username', 'utente')
    nome_safe = "".join(c if c.isalnum() else "_" for c in nome_portafoglio)
    filename = f"{data_str}_{username}_{nome_safe}_wallet.csv"

    output = make_response(si.getvalue())
    output.headers["Content-Disposition"] = f"attachment; filename={filename}"
    output.headers["Content-type"] = "text/csv"
    return output

@app.route('/api/wallet/import_csv', methods=['POST'])
def import_wallet_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    wallet_id = request.args.get('wallet_id')
    if 'file' not in request.files: return jsonify({"errore": _("No file uploaded")}), 400
    file = request.files['file']
    fonte = request.form.get('fonte', 'CoTrack')
    if file.filename == '': return jsonify({"errore": _("No file selected")}), 400
    if file and file.filename.endswith('.csv'):
        raw_content = file.stream.read()
        try: content = raw_content.decode("utf-8-sig")
        except UnicodeDecodeError: content = raw_content.decode("latin1")
        
        lines = [line for line in content.splitlines() if line.strip()]
        if not lines:
            return jsonify({"errore": _("The uploaded file is empty.")}), 400
            
        header_line = lines[0]
        delimiter = ';' if header_line.count(';') >= header_line.count(',') else ','
        
        conn = get_db_connection()
        try:
            # Recuperiamo le transazioni esistenti per non duplicarle
            esistenti = conn.execute('SELECT account, category, currency, amount, date, note, type FROM wallet_transactions WHERE wallet_id = ?', (wallet_id,)).fetchall()
            esistenti_set = set()
            for r in esistenti:
                esistenti_set.add((
                    r['account'] or '',
                    r['category'] or '',
                    r['currency'] or '',
                    round(r['amount'], 2) if r['amount'] is not None else 0.0,
                    r['date'] or '',
                    r['note'] or '',
                    r['type'] or ''
                ))

            stream = StringIO('\n'.join(lines), newline=None)
            csv_reader = csv.DictReader(stream, delimiter=delimiter)
            records = []
            
            total_rows = 0
            parsed_rows = 0
            gia_importati = 0

            if fonte == 'CoTrack':
                for row in csv_reader:
                    if not any(row.values()): continue
                    total_rows += 1
                    
                    account = row.get('account', '')
                    category = row.get('category', '')
                    currency = row.get('currency', '')
                    
                    try: amount = float(row.get('amount', 0))
                    except ValueError: continue
                    
                    data_op = row.get('date', row.get('data_operazione', ''))
                    if not data_op: continue
                    
                    note = row.get('note', '')
                    t_type = row.get('type', '')
                    
                    record_tuple = (account, category, currency, round(amount, 2), data_op, note, t_type)
                    if record_tuple in esistenti_set:
                        gia_importati += 1
                        parsed_rows += 1
                        continue
                        
                    records.append((wallet_id, account, category, currency, amount, data_op, note, t_type))
                    esistenti_set.add(record_tuple)
                    parsed_rows += 1
            else:
                for row in csv_reader:
                    row_lower = {}
                    for k, v in row.items():
                        if k:
                            clean_k = str(k).strip().strip('"\'').lower()
                            clean_v = str(v).strip().strip('"\'') if v else ''
                            row_lower[clean_k] = clean_v
                    
                    if not any(row_lower.values()): continue
                    
                    total_rows += 1

                    account = row_lower.get('account', row_lower.get('conto', ''))
                    category = row_lower.get('category', row_lower.get('categoria', ''))
                    currency = row_lower.get('currency', row_lower.get('valuta', 'EUR'))
                    note = row_lower.get('note', row_lower.get('nota', ''))
                    
                    amount_str = row_lower.get('amount', row_lower.get('importo', ''))
                    if not amount_str:
                        for k, v in row_lower.items():
                            if 'amount' in k or 'importo' in k:
                                amount_str = v
                                break
                    if not amount_str: amount_str = '0'
                    
                    amount_str = amount_str.replace('€', '').replace('$', '').strip()
                    amount_str = amount_str.replace('€', '').replace('$', '').replace('+', '').strip()
                    # Manteniamo il segno meno ma rimuoviamo gli spazi vuoti
                    amount_str = amount_str.replace(' ', '')
                    
                    if ',' in amount_str and '.' in amount_str:
                        if amount_str.rfind(',') > amount_str.rfind('.'):
                            amount_str = amount_str.replace('.', '').replace(',', '.')
                        else:
                            amount_str = amount_str.replace(',', '')
                    else:
                        amount_str = amount_str.replace(',', '.')
                        
                    try: amount = float(amount_str)
                    except ValueError: amount = 0.0
                    except ValueError: 
                        continue # Errore di parsing per l'importo
                    
                    date_str = row_lower.get('date', row_lower.get('data', ''))
                    if not date_str:
                        for k, v in row_lower.items():
                            if 'date' in k or 'data' in k:
                                date_str = v
                                break
                                
                    data_op = ""
                    if date_str:
                        date_str_clean = date_val.split(' ')[0] if 'date_val' in locals() else date_str.split(' ')[0]
                        try: data_op = datetime.strptime(date_str_clean, '%Y-%m-%d').strftime('%Y-%m-%d')
                        except:
                            try: data_op = datetime.strptime(date_str_clean, '%d/%m/%Y').strftime('%Y-%m-%d')
                            except:
                                try: data_op = datetime.strptime(date_str_clean, '%d-%m-%Y').strftime('%Y-%m-%d')
                                except: data_op = date_str_clean
                        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d', '%m/%d/%Y'):
                            try:
                                data_op = datetime.strptime(date_str_clean, fmt).strftime('%Y-%m-%d')
                                break
                            except ValueError:
                                pass
                                
                    if not data_op: continue
                    
                    record_type = row_lower.get('payment type', row_lower.get('tipo pagamento', row_lower.get('type', row_lower.get('tipo', ''))))
                    rt_lower = record_type.lower() if record_type else ''
                    cat_lower = category.lower()
                    
                    is_transfer = any(kw in rt_lower or kw in cat_lower for kw in ['transfer', 'trasferiment', 'trasferisci', 'preleva', 'giroconto'])
                    
                    if is_transfer:
                        t_type = 'Transfer'
                    else:
                        if 'expense' in rt_lower or 'spesa' in rt_lower or 'uscita' in rt_lower:
                            t_type = 'Expense'
                            if amount > 0: amount = -amount
                        elif 'income' in rt_lower or 'entrata' in rt_lower:
                            t_type = 'Income'
                            if amount < 0: amount = -amount
                        else:
                            t_type = 'Expense' if amount < 0 else 'Income'
                    
                    # Controllo Duplicati
                    record_tuple = (account, category, currency, round(amount, 2), data_op, note, t_type)
                    
                    if record_tuple in esistenti_set:
                        gia_importati += 1
                        parsed_rows += 1 # Parsata con successo ma ignorata poiché duplicata
                        continue
                        
                    records.append((wallet_id, account, category, currency, amount, data_op, note, t_type))
                    esistenti_set.add(record_tuple)
                    parsed_rows += 1
                
            if records:
                conn.executemany('''
                    INSERT INTO wallet_transactions (wallet_id, account, category, currency, amount, date, note, type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', records)
                conn.commit()
                
            if parsed_rows < total_rows:
                non_importati = total_rows - parsed_rows
                msg = _("Imported %(count)s new transactions. (Ignored %(ignored)s already present). WARNING: %(errors)s rows were not read correctly.", count=len(records), ignored=gia_importati, errors=non_importati)
            else:
                msg = _("Imported %(count)s new transactions successfully! (Ignored %(ignored)s already present).", count=len(records), ignored=gia_importati)
                
            return jsonify({"messaggio": msg}), 200
        except Exception as e:
            conn.rollback()
            return jsonify({"errore": f"Errore durante l'importazione: {str(e)}"}), 500
        finally: conn.close()
    return jsonify({"errore": _("Invalid file format. Expected CSV.")}), 400

@app.route('/api/wallet/import_custom_csv', methods=['POST'])
def import_custom_wallet_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    wallet_id = request.args.get('wallet_id')
    
    if 'file' not in request.files:
        return jsonify({"errore": _("No file uploaded")}), 400

    file = request.files['file']
    mapping_str = request.form.get('mapping')
    if not mapping_str:
        return jsonify({"errore": _("Missing column mapping")}), 400
        
    try:
        mapping = json.loads(mapping_str)
    except json.JSONDecodeError:
        return jsonify({"errore": _("Invalid mapping format")}), 400

    raw_content = file.stream.read()
    try: content = raw_content.decode("utf-8-sig")
    except UnicodeDecodeError: content = raw_content.decode("latin1")
    
    lines = [line for line in content.splitlines() if line.strip()]
    if not lines: return jsonify({"errore": _("The uploaded file is empty.")}), 400
        
    header_line = lines[0]
    delimiter = ';' if header_line.count(';') >= header_line.count(',') else ','
    
    conn = get_db_connection()
    try:
        esistenti = conn.execute('SELECT account, category, currency, amount, date, note, type FROM wallet_transactions WHERE wallet_id = ?', (wallet_id,)).fetchall()
        esistenti_set = set()
        for r in esistenti:
            esistenti_set.add((
                r['account'] or '',
                r['category'] or '',
                r['currency'] or '',
                round(r['amount'], 2) if r['amount'] is not None else 0.0,
                r['date'] or '',
                r['note'] or '',
                r['type'] or ''
            ))

        stream = StringIO('\n'.join(lines), newline=None)
        csv_reader = csv.DictReader(stream, delimiter=delimiter)
        records = []
        gia_importati = 0
        parsed_rows = 0
        total_rows = 0
        
        for row in csv_reader:
            total_rows += 1
            col_date, col_account, col_amount = mapping.get('date'), mapping.get('account'), mapping.get('amount')
            col_category, col_type, col_note = mapping.get('category'), mapping.get('type'), mapping.get('note')
            
            if not col_date or not col_account or not col_amount: continue
            
            date_val, account = row.get(col_date, ''), row.get(col_account, '')
            if not date_val or not account: continue
            
            data_op = ""
            date_str_clean = date_val.split(' ')[0]
            for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d', '%m/%d/%Y'):
                try:
                    data_op = datetime.strptime(date_str_clean, fmt).strftime('%Y-%m-%d')
                    break
                except ValueError: pass
            if not data_op: continue
            
            val_str = str(row.get(col_amount, '0')).replace('€', '').replace('$', '').replace('+', '').replace(' ', '').strip()
            if not val_str: val_str = '0'
            if ',' in val_str and '.' in val_str:
                if val_str.rfind(',') > val_str.rfind('.'): val_str = val_str.replace('.', '').replace(',', '.')
                else: val_str = val_str.replace(',', '')
            else:
                val_str = val_str.replace(',', '.')
            
            try: amount = float(val_str)
            except ValueError: continue
            
            category = row.get(col_category, '') if col_category else ''
            note = row.get(col_note, '') if col_note else ''
            record_type = row.get(col_type, '') if col_type else ''
            
            rt_lower = record_type.lower()
            cat_lower = category.lower()
            
            is_transfer = any(kw in rt_lower or kw in cat_lower for kw in ['transfer', 'trasferiment', 'trasferisci', 'preleva', 'giroconto'])
            
            if is_transfer: t_type = 'Transfer'
            else:
                if 'expense' in rt_lower or 'spesa' in rt_lower or 'uscita' in rt_lower:
                    t_type = 'Expense'
                    if amount > 0: amount = -amount
                elif 'income' in rt_lower or 'entrata' in rt_lower:
                    t_type = 'Income'
                    if amount < 0: amount = -amount
                else:
                    t_type = 'Expense' if amount < 0 else 'Income'
                    
            record_tuple = (account, category, 'EUR', round(amount, 2), data_op, note, t_type)
            if record_tuple in esistenti_set:
                gia_importati += 1
                parsed_rows += 1
                continue
                
            records.append((wallet_id, account, category, 'EUR', amount, data_op, note, t_type))
            esistenti_set.add(record_tuple)
            parsed_rows += 1
        
        if records:
            conn.executemany('INSERT INTO wallet_transactions (wallet_id, account, category, currency, amount, date, note, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', records)
            conn.commit()
            
        if parsed_rows < total_rows:
            msg = _("Imported %(count)s new transactions. (Ignored %(ignored)s already present). WARNING: %(errors)s rows were not read correctly.", count=len(records), ignored=gia_importati, errors=total_rows - parsed_rows)
        else:
            msg = _("Imported %(count)s new transactions successfully! (Ignored %(ignored)s already present).", count=len(records), ignored=gia_importati)
            
        return jsonify({"messaggio": msg}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"errore": f"Errore durante l'importazione: {str(e)}"}), 500
    finally: conn.close()

# @app.route('/api/config/wallet_token', methods=['GET', 'POST'])
# def gestisci_token():
#     conn = get_db_connection()
#     if request.method == 'POST':
#         token = request.json.get('token', '').strip()
#         conn.execute('INSERT OR REPLACE INTO configurazioni (chiave, valore) VALUES (?, ?)', ('wallet_token', token))
#         conn.commit()
#         conn.close()
#         return jsonify({"messaggio": "Token salvato!"})
#     else:
#         row = conn.execute('SELECT valore FROM configurazioni WHERE chiave = ?', ('wallet_token',)).fetchone()
#         conn.close()
#         return jsonify({"token": row['valore'] if row else ""})

# @app.route('/api/wallet/sync', methods=['POST'])
# def sync_wallet():
#     conn = get_db_connection()
#     try:
#         row = conn.execute('SELECT valore FROM configurazioni WHERE chiave = ?', ('wallet_token',)).fetchone()
#         if not row or not row['valore']:
#             return jsonify({"errore": "Token non configurato"}), 400
        
#         token = row['valore']
#         headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        
#         response = requests.get("https://rest.budgetbakers.com/v1/api/accounts", headers=headers)
#         if response.status_code != 200:
#             return jsonify({"errore": f"Errore API Wallet: {response.text}"}), 400
            
#         accounts_data = response.json()
#         accounts_list = accounts_data if isinstance(accounts_data, list) else accounts_data.get('accounts', [])
        
#         oggi = datetime.today().strftime('%Y-%m-%d')
        
#         for acc in accounts_list:
#             acc_id = str(acc.get('id', ''))
#             acc_name = acc.get('name', 'Sconosciuto')
#             balance = acc.get('initialBalance', 0)
            
#             conn.execute('''
#                 INSERT INTO saldi_conto (data, account_id, account_name, saldo, valuta)
#                 VALUES (?, ?, ?, ?, ?)
#                 ON CONFLICT(data, account_id) DO UPDATE SET 
#                     saldo=excluded.saldo,
#                     account_name=excluded.account_name
#             ''', (oggi, acc_id, acc_name, float(balance), 'EUR'))
            
#         conn.commit()
#         return jsonify({"messaggio": "Sincronizzazione completata!"})
#     except Exception as e:
#         conn.rollback()
#         return jsonify({"errore": str(e)}), 500
#     finally:
#         conn.close()

# @app.route('/api/wallet/saldi', methods=['GET'])
# def get_saldi_storico():
#     conn = get_db_connection()
#     rows = conn.execute('SELECT * FROM saldi_conto ORDER BY data ASC').fetchall()
#     conn.close()
#     return jsonify([dict(row) for row in rows])

# --- 6. GESTIONE BOLLETTE ---
@app.route('/api/bills', methods=['GET', 'POST'])
def manage_bills():
    if 'user_id' not in session: 
        return jsonify({"errore": _("Not authenticated")}), 401
    
    conn = get_db_connection()
    
    if request.method == 'POST':
        data = request.json
        bills_id = data.get('bills_id')
        year = data.get('year')
        month = data.get('month')
        
        if not bills_id or not year or not month:
            conn.close()
            return jsonify({"errore": _("Missing required fields")}), 400
        
        # Verify ownership of bills profile
        p = conn.execute("SELECT id FROM bills_profiles WHERE id = ? AND user_id = ?", (bills_id, session['user_id'])).fetchone()
        if not p:
            conn.close()
            return jsonify({"errore": _("Bills group not found or unauthorized")}), 404
            
        water_price = float(data.get('water_price', 0) or 0)
        water_consumption = float(data.get('water_consumption', 0) or 0)
        electricity_price = float(data.get('electricity_price', 0) or 0)
        electricity_consumption = float(data.get('electricity_consumption', 0) or 0)
        gas_price = float(data.get('gas_price', 0) or 0)
        gas_consumption = float(data.get('gas_consumption', 0) or 0)
        
        try:
            conn.execute('''
                INSERT INTO bills (
                    bills_id, year, month, 
                    water_price, water_consumption, 
                    electricity_price, electricity_consumption, 
                    gas_price, gas_consumption
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(bills_id, year, month) DO UPDATE SET
                    water_price=excluded.water_price,
                    water_consumption=excluded.water_consumption,
                    electricity_price=excluded.electricity_price,
                    electricity_consumption=excluded.electricity_consumption,
                    gas_price=excluded.gas_price,
                    gas_consumption=excluded.gas_consumption
            ''', (
                bills_id, year, month,
                water_price, water_consumption,
                electricity_price, electricity_consumption,
                gas_price, gas_consumption
            ))
            conn.commit()
            return jsonify({"messaggio": _("Bill saved successfully")}), 200
        except Exception as e:
            conn.rollback()
            return jsonify({"errore": str(e)}), 500
        finally:
            conn.close()
            
    # GET method
    bills_id = request.args.get('bills_id')
    if not bills_id:
        conn.close()
        return jsonify({"errore": _("Missing bills_id")}), 400
        
    p = conn.execute("SELECT id FROM bills_profiles WHERE id = ? AND user_id = ?", (bills_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({"errore": _("Bills group not found or unauthorized")}), 404
        
    rows = conn.execute('SELECT * FROM bills WHERE bills_id = ? ORDER BY year DESC, month DESC', (bills_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/bills/<int:bill_id>', methods=['DELETE'])
def delete_bill(bill_id):
    if 'user_id' not in session: 
        return jsonify({"errore": _("Not authenticated")}), 401
        
    conn = get_db_connection()
    # Check if bill belongs to a bills profile owned by this user
    bill = conn.execute('''
        SELECT b.id, b.bills_id FROM bills b 
        JOIN bills_profiles p ON b.bills_id = p.id 
        WHERE b.id = ? AND p.user_id = ?
    ''', (bill_id, session['user_id'])).fetchone()
    
    if not bill:
        conn.close()
        return jsonify({"errore": _("Bill not found or unauthorized")}), 404
        
    try:
        conn.execute('DELETE FROM bills WHERE id = ?', (bill_id,))
        conn.commit()
        return jsonify({"messaggio": _("Bill deleted successfully")}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"errore": str(e)}), 500
    finally:
        conn.close()


@app.route('/api/bills/config', methods=['GET', 'POST'])
def manage_bills_config():
    if 'user_id' not in session: 
        return jsonify({"errore": _("Not authenticated")}), 401
        
    conn = get_db_connection()
    
    if request.method == 'POST':
        data = request.json
        bills_id = data.get('bills_id')
        water_unit = data.get('water_unit', 'm³')
        electricity_unit = data.get('electricity_unit', 'kWh')
        gas_unit = data.get('gas_unit', 'Smc')
        
        if not bills_id:
            conn.close()
            return jsonify({"errore": _("Missing bills_id")}), 400
            
        p = conn.execute("SELECT id FROM bills_profiles WHERE id = ? AND user_id = ?", (bills_id, session['user_id'])).fetchone()
        if not p:
            conn.close()
            return jsonify({"errore": _("Bills group not found or unauthorized")}), 404
            
        try:
            conn.execute('''
                INSERT INTO bills_config (bills_id, water_unit, electricity_unit, gas_unit)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(bills_id) DO UPDATE SET
                    water_unit=excluded.water_unit,
                    electricity_unit=excluded.electricity_unit,
                    gas_unit=excluded.gas_unit
            ''', (bills_id, water_unit, electricity_unit, gas_unit))
            conn.commit()
            return jsonify({"messaggio": _("Config saved successfully")}), 200
        except Exception as e:
            conn.rollback()
            return jsonify({"errore": str(e)}), 500
        finally:
            conn.close()
            
    # GET method
    bills_id = request.args.get('bills_id')
    if not bills_id:
        conn.close()
        return jsonify({"errore": _("Missing bills_id")}), 400
        
    p = conn.execute("SELECT id FROM bills_profiles WHERE id = ? AND user_id = ?", (bills_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({"errore": _("Bills group not found or unauthorized")}), 404
        
    row = conn.execute('SELECT * FROM bills_config WHERE bills_id = ?', (bills_id,)).fetchone()
    conn.close()
    
    if row:
        return jsonify(dict(row))
    else:
        # Default configuration
        return jsonify({
            "bills_id": int(bills_id),
            "water_unit": "m³",
            "electricity_unit": "kWh",
            "gas_unit": "Smc"
        })

@app.route('/api/bills/export_csv', methods=['GET'])
def export_bills_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    bills_id = request.args.get('bills_id')
    conn = get_db_connection()
    
    p_row = conn.execute('SELECT name FROM bills_profiles WHERE id = ? AND user_id = ?', (bills_id, session['user_id'])).fetchone()
    if not p_row:
        conn.close()
        return jsonify({"errore": _("Bills group not found or unauthorized")}), 404
        
    nome_portafoglio = p_row['name']
    
    bills = conn.execute('SELECT * FROM bills WHERE bills_id = ? ORDER BY year ASC, month ASC', (bills_id,)).fetchall()
    conn.close()

    si = StringIO()
    cw = csv.writer(si)
    cw.writerow(['year', 'month', 'water_price', 'water_consumption', 'electricity_price', 'electricity_consumption', 'gas_price', 'gas_consumption'])
    
    for b in bills:
        cw.writerow([
            b['year'], b['month'], 
            b['water_price'], b['water_consumption'], 
            b['electricity_price'], b['electricity_consumption'], 
            b['gas_price'], b['gas_consumption']
        ])

    data_str = datetime.today().strftime('%Y%m%d')
    username = session.get('username', 'utente')
    nome_safe = "".join(c if c.isalnum() else "_" for c in nome_portafoglio)
    filename = f"{data_str}_{username}_{nome_safe}_bollette.csv"

    output = make_response(si.getvalue())
    output.headers["Content-Disposition"] = f"attachment; filename={filename}"
    output.headers["Content-type"] = "text/csv"
    return output

@app.route('/api/bills/import_csv', methods=['POST'])
def import_bills_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    bills_id = request.args.get('bills_id')
    if 'file' not in request.files: return jsonify({"errore": _("No file uploaded")}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({"errore": _("No file selected")}), 400
    
    conn = get_db_connection()
    p_row = conn.execute('SELECT name FROM bills_profiles WHERE id = ? AND user_id = ?', (bills_id, session['user_id'])).fetchone()
    if not p_row:
        conn.close()
        return jsonify({"errore": _("Bills group not found or unauthorized")}), 404
        
    if file and file.filename.endswith('.csv'):
        raw_content = file.stream.read()
        try: content = raw_content.decode("utf-8-sig")
        except UnicodeDecodeError: content = raw_content.decode("latin1")
        
        lines = [line for line in content.splitlines() if line.strip()]
        if not lines:
            conn.close()
            return jsonify({"errore": _("The uploaded file is empty.")}), 400
            
        header_line = lines[0]
        delimiter = ';' if header_line.count(';') >= header_line.count(',') else ','
        
        try:
            stream = StringIO('\n'.join(lines), newline=None)
            csv_reader = csv.DictReader(stream, delimiter=delimiter)
            
            inserted_count = 0
            for row in csv_reader:
                if not any(row.values()): continue
                
                try:
                    year = int(row.get('year'))
                    month = int(row.get('month'))
                except (ValueError, TypeError):
                    continue  # Anno e mese sono obbligatori e devono essere interi
                    
                water_price = float(row.get('water_price', 0) or 0)
                water_consumption = float(row.get('water_consumption', 0) or 0)
                electricity_price = float(row.get('electricity_price', 0) or 0)
                electricity_consumption = float(row.get('electricity_consumption', 0) or 0)
                gas_price = float(row.get('gas_price', 0) or 0)
                gas_consumption = float(row.get('gas_consumption', 0) or 0)
                
                conn.execute('''
                    INSERT INTO bills (
                        bills_id, year, month, 
                        water_price, water_consumption, 
                        electricity_price, electricity_consumption, 
                        gas_price, gas_consumption
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(bills_id, year, month) DO UPDATE SET
                        water_price=excluded.water_price,
                        water_consumption=excluded.water_consumption,
                        electricity_price=excluded.electricity_price,
                        electricity_consumption=excluded.electricity_consumption,
                        gas_price=excluded.gas_price,
                        gas_consumption=excluded.gas_consumption
                ''', (
                    bills_id, year, month,
                    water_price, water_consumption,
                    electricity_price, electricity_consumption,
                    gas_price, gas_consumption
                ))
                inserted_count += 1
                
            conn.commit()
            return jsonify({"messaggio": _("Imported %(count)s bills successfully!", count=inserted_count)}), 200
        except Exception as e:
            conn.rollback()
            return jsonify({"errore": f"Errore durante l'importazione: {str(e)}"}), 500
        finally:
            conn.close()
    else:
        conn.close()
        return jsonify({"errore": _("Invalid file type")}), 400

# ==========================================
# --- VEHICLE MANAGEMENT (FLASK) ---
# ==========================================

import csv
import random
import string

def parse_and_insert_csv(conn, vehicle_id, csv_content):
    import json as _json
    lines = csv_content.splitlines()
    current_section = None
    import_count = {"refuel": 0, "expense": 0, "service": 0}
    max_odometer = 0.0

    # Collect raw rows per section before inserting
    raw_refuels = []
    raw_expenses = []
    raw_services = []  # list of dicts, will be grouped

    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue
        if line_str.startswith('##Refuelling'):
            current_section = 'refuel'
            continue
        elif line_str.startswith('##Expense'):
            current_section = 'expense'
            continue
        elif line_str.startswith('##Service'):
            current_section = 'service'
            continue

        try:
            row = next(csv.reader([line_str]))
        except Exception:
            continue

        if not row or row[0] == '':
            continue
        if 'Contachilometri' in row[0]:
            continue

        odometer_val = 0.0
        try:
            odometer_val = float(row[0])
        except ValueError:
            pass

        if odometer_val > max_odometer:
            max_odometer = odometer_val

        date_val = row[1] if len(row) > 1 and row[1] else datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        if current_section == 'refuel':
            raw_refuels.append((row, odometer_val, date_val))
        elif current_section == 'expense':
            raw_expenses.append((row, odometer_val, date_val))
        elif current_section == 'service':
            cost_val = float(row[2]) if len(row) > 2 and row[2] else 0.0
            description = row[3] if len(row) > 3 and row[3] else 'Altro'
            provider = row[4] if len(row) > 4 else ''
            driver = row[5] if len(row) > 5 else ''
            payment_method = row[6] if len(row) > 6 else ''
            notes = row[7] if len(row) > 7 else ''
            raw_services.append({
                'odometer': odometer_val,
                'date': date_val,
                'cost': cost_val,
                'description': description,
                'provider': provider,
                'driver': driver,
                'payment_method': payment_method,
                'notes': notes,
            })

    # --- INSERT REFUELS ---
    for (row, odometer_val, date_val) in raw_refuels:
        rand_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
        act_id = f"act-refuel-{int(datetime.now().timestamp())}-{rand_suffix}"
        fuel_type = row[2] if len(row) > 2 else ''
        price_unit = float(row[3]) if len(row) > 3 and row[3] else 0.0
        total_cost = float(row[4]) if len(row) > 4 and row[4] else 0.0
        liters = float(row[5]) if len(row) > 5 and row[5] else 0.0
        is_full = 1 if len(row) > 6 and row[6] == 'Sì' else 0
        fuel2 = row[7] if len(row) > 7 else ''
        price_unit2 = float(row[8]) if len(row) > 8 and row[8] else 0.0
        total_cost2 = float(row[9]) if len(row) > 9 and row[9] else 0.0
        liters2 = float(row[10]) if len(row) > 10 and row[10] else 0.0
        is_full2 = 1 if len(row) > 11 and row[11] == 'Sì' else 0
        fuel3 = row[12] if len(row) > 12 else ''
        price_unit3 = float(row[13]) if len(row) > 13 and row[13] else 0.0
        total_cost3 = float(row[14]) if len(row) > 14 and row[14] else 0.0
        liters3 = float(row[15]) if len(row) > 15 and row[15] else 0.0
        is_full3 = 1 if len(row) > 16 and row[16] == 'Sì' else 0
        consumption = row[17] if len(row) > 17 else ''
        distance = float(row[18]) if len(row) > 18 and row[18] else 0.0
        gas_station = row[19] if len(row) > 19 else ''
        driver = row[20] if len(row) > 20 else ''
        reason = row[21] if len(row) > 21 else ''
        payment_method = row[22] if len(row) > 22 else ''
        notes = row[23] if len(row) > 23 else ''
        conn.execute('''
            INSERT INTO vehicle_activities (
                id, vehicleId, type, date, odometer, notes,
                fuelType, priceUnit, totalCost, liters, isFull,
                fuel2, priceUnit2, totalCost2, liters2, isFull2,
                fuel3, priceUnit3, totalCost3, liters3, isFull3,
                consumption, distance, gasStation, driver, reason, paymentMethod
            ) VALUES (?, ?, 'refuel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            act_id, vehicle_id, date_val, odometer_val, notes,
            fuel_type, price_unit, total_cost, liters, is_full,
            fuel2, price_unit2, total_cost2, liters2, is_full2,
            fuel3, price_unit3, total_cost3, liters3, is_full3,
            consumption, distance, gas_station, driver, reason, payment_method
        ))
        import_count["refuel"] += 1

    # --- INSERT EXPENSES ---
    for (row, odometer_val, date_val) in raw_expenses:
        rand_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
        act_id = f"act-expense-{int(datetime.now().timestamp())}-{rand_suffix}"
        total_cost = float(row[2]) if len(row) > 2 and row[2] else 0.0
        category = row[3] if len(row) > 3 and row[3] else 'Altro'
        location = row[4] if len(row) > 4 else ''
        driver = row[5] if len(row) > 5 else ''
        reason = row[6] if len(row) > 6 else ''
        payment_method = row[7] if len(row) > 7 else ''
        notes = row[8] if len(row) > 8 else ''
        conn.execute('''
            INSERT INTO vehicle_activities (
                id, vehicleId, type, date, odometer, notes,
                cost, category, location, driver, reason, paymentMethod
            ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            act_id, vehicle_id, date_val, odometer_val, notes,
            total_cost, category, location, driver, reason, payment_method
        ))
        import_count["expense"] += 1

    # --- INSERT SERVICES (grouped by odometer+date) ---
    # In Drivvo each maintenance item is a separate row with the same odometer+date.
    # CoTrack stores a service as a single entry with description = JSON {"item": cost}
    # and cost = sum of all items. Group rows sharing the same (odometer, date) key.
    from collections import OrderedDict
    service_groups = OrderedDict()  # key=(odometer, date) -> group dict
    for s in raw_services:
        key = (s['odometer'], s['date'])
        if key not in service_groups:
            service_groups[key] = {
                'odometer': s['odometer'],
                'date': s['date'],
                'items': {},          # {description: cost}
                'provider': s['provider'],
                'driver': s['driver'],
                'payment_method': s['payment_method'],
                'notes': s['notes'],
            }
        g = service_groups[key]
        # Accumulate items — if same description appears twice, sum costs
        desc = s['description']
        g['items'][desc] = g['items'].get(desc, 0.0) + s['cost']
        # Take non-empty provider/notes from any row in the group
        if not g['provider'] and s['provider']:
            g['provider'] = s['provider']
        if not g['notes'] and s['notes']:
            g['notes'] = s['notes']

    for g in service_groups.values():
        rand_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
        act_id = f"act-service-{int(datetime.now().timestamp())}-{rand_suffix}"
        total_cost = round(sum(g['items'].values()), 2)
        # Store items as JSON string (CoTrack multi-select format)
        description_json = _json.dumps(g['items'], ensure_ascii=False)
        conn.execute('''
            INSERT INTO vehicle_activities (
                id, vehicleId, type, date, odometer, notes,
                cost, description, provider, driver, paymentMethod
            ) VALUES (?, ?, 'service', ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            act_id, vehicle_id, g['date'], g['odometer'], g['notes'],
            total_cost, description_json, g['provider'], g['driver'], g['payment_method']
        ))
        import_count["service"] += 1

    if max_odometer > 0:
        conn.execute("UPDATE vehicles SET odometer = ? WHERE id = ?", (max_odometer, vehicle_id))
        
    return import_count

@app.route('/api/vehicles', methods=['GET', 'POST'])
def vehicles_route():
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
    
    garage_id = request.args.get('garage_id', type=int) or (request.json.get('garage_id') if request.is_json else None)
    if not garage_id:
        return jsonify({"errore": _("Missing garage_id")}), 400
        
    conn = get_db_connection()
    p = conn.execute("SELECT id FROM garages WHERE id = ? AND user_id = ?", (garage_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({"errore": _("Garage not found or unauthorized")}), 404
        
    if request.method == 'POST':
        data = request.json
        veh_id = data.get('id')
        brand = data.get('brand')
        model = data.get('model')
        v_type = data.get('type', 'Auto')
        fuel = data.get('fuel', '')
        plate = data.get('plate', '')
        year = int(data.get('year')) if data.get('year') else 2020
        odometer = float(data.get('odometer')) if data.get('odometer') else 0.0
        tank_size = float(data.get('tankSize')) if data.get('tankSize') else 40.0
        
        if not veh_id or not brand or not model:
            conn.close()
            return jsonify({"errore": "Missing required fields"}), 400
            
        try:
            conn.execute('''
                INSERT INTO vehicles (id, brand, model, type, fuel, plate, year, odometer, tankSize, garage_id, archived)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (veh_id, brand, model, v_type, fuel, plate, year, odometer, tank_size, garage_id, 0))
            conn.commit()
        except sqlite3.IntegrityError as e:
            conn.close()
            return jsonify({"errore": f"Vehicle already exists: {str(e)}"}), 400
        
        row = conn.execute("SELECT * FROM vehicles WHERE id = ?", (veh_id,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
        
    rows = conn.execute("SELECT * FROM vehicles WHERE garage_id = ?", (garage_id,)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/vehicles/<vehicle_id>', methods=['PUT', 'DELETE'])
def vehicle_detail_route(vehicle_id):
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    conn = get_db_connection()
    v = conn.execute('''
        SELECT v.* FROM vehicles v
        JOIN garages p ON v.garage_id = p.id
        WHERE v.id = ? AND p.user_id = ?
    ''', (vehicle_id, session['user_id'])).fetchone()
    if not v:
        conn.close()
        return jsonify({"errore": _("Vehicle not found or unauthorized")}), 404
        
    if request.method == 'DELETE':
        conn.execute("DELETE FROM vehicle_activities WHERE vehicleId = ?", (vehicle_id,))
        conn.execute("DELETE FROM vehicles WHERE id = ?", (vehicle_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    data = request.json
    brand = data.get('brand', v['brand'])
    model = data.get('model', v['model'])
    v_type = data.get('type', v['type'])
    fuel = data.get('fuel', v['fuel'])
    plate = data.get('plate', v['plate'])
    year = int(data.get('year')) if data.get('year') else v['year']
    odometer = float(data.get('odometer')) if data.get('odometer') else v['odometer']
    tank_size = float(data.get('tankSize')) if data.get('tankSize') else v['tankSize']
    archived = int(data.get('archived', v['archived'])) if 'archived' in data else v['archived']
    
    conn.execute('''
        UPDATE vehicles 
        SET brand = ?, model = ?, type = ?, fuel = ?, plate = ?, year = ?, odometer = ?, tankSize = ?, archived = ?
        WHERE id = ?
    ''', (brand, model, v_type, fuel, plate, year, odometer, tank_size, archived, vehicle_id))
    conn.commit()
    
    row = conn.execute("SELECT * FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route('/api/vehicle-entries', methods=['GET', 'POST'])
def vehicle_entries_route():
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    garage_id = request.args.get('garage_id', type=int) or (request.json.get('garage_id') if request.is_json else None)
    if not garage_id:
        return jsonify({"errore": _("Missing garage_id")}), 400
        
    conn = get_db_connection()
    p = conn.execute("SELECT id FROM garages WHERE id = ? AND user_id = ?", (garage_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({"errore": _("Garage not found or unauthorized")}), 404
        
    if request.method == 'POST':
        data = request.json
        act_id = data.get('id')
        vehicle_id = data.get('vehicleId')
        v_type = data.get('type')
        date_val = data.get('date')
        odometer_val = float(data.get('odometer')) if data.get('odometer') is not None else None
        
        if not act_id or not vehicle_id or not v_type or not date_val:
            conn.close()
            return jsonify({"errore": "Missing required fields"}), 400
            
        v = conn.execute("SELECT id, odometer FROM vehicles WHERE id = ? AND garage_id = ?", (vehicle_id, garage_id)).fetchone()
        if not v:
            conn.close()
            return jsonify({"errore": "Vehicle not found in active garage"}), 404
            
        keys = list(data.keys())
        db_keys = []
        db_vals = []
        for k in keys:
            if k == 'garage_id' or k == 'portfolio_id':
                continue
            val = data[k]
            if isinstance(val, bool):
                val = 1 if val else 0
            db_keys.append(k)
            db_vals.append(val)
            
        fields_str = ', '.join(db_keys)
        placeholders = ', '.join(['?'] * len(db_keys))
        
        conn.execute(f"INSERT INTO vehicle_activities ({fields_str}) VALUES ({placeholders})", db_vals)
        
        if odometer_val is not None and v_type != 'reminder':
            if odometer_val > v['odometer']:
                conn.execute("UPDATE vehicles SET odometer = ? WHERE id = ?", (odometer_val, vehicle_id))
                
        conn.commit()
        row = conn.execute("SELECT * FROM vehicle_activities WHERE id = ?", (act_id,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
        
    vehicle_id = request.args.get('vehicle_id')
    if vehicle_id:
        rows = conn.execute('''
            SELECT a.* FROM vehicle_activities a
            JOIN vehicles v ON a.vehicleId = v.id
            WHERE v.garage_id = ? AND a.vehicleId = ?
            ORDER BY a.date DESC, a.odometer DESC
        ''', (garage_id, vehicle_id)).fetchall()
    else:
        rows = conn.execute('''
            SELECT a.* FROM vehicle_activities a
            JOIN vehicles v ON a.vehicleId = v.id
            WHERE v.garage_id = ?
            ORDER BY a.date DESC, a.odometer DESC
        ''', (garage_id,)).fetchall()
        
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/vehicle-entries/<entry_id>', methods=['PUT', 'DELETE'])
def vehicle_entry_detail_route(entry_id):
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    conn = get_db_connection()
    e = conn.execute('''
        SELECT a.*, v.garage_id FROM vehicle_activities a
        JOIN vehicles v ON a.vehicleId = v.id
        JOIN garages p ON v.garage_id = p.id
        WHERE a.id = ? AND p.user_id = ?
    ''', (entry_id, session['user_id'])).fetchone()
    if not e:
        conn.close()
        return jsonify({"errore": _("Activity not found or unauthorized")}), 404
        
    if request.method == 'DELETE':
        conn.execute("DELETE FROM vehicle_activities WHERE id = ?", (entry_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    data = request.json
    if 'id' in data:
        del data['id']
    if 'type' in data:
        del data['type']
        
    keys = list(data.keys())
    update_pairs = []
    vals = []
    for k in keys:
        val = data[k]
        if isinstance(val, bool):
            val = 1 if val else 0
        update_pairs.append(f"{k} = ?")
        vals.append(val)
        
    vals.append(entry_id)
    update_str = ', '.join(update_pairs)
    
    conn.execute(f"UPDATE vehicle_activities SET {update_str} WHERE id = ?", vals)
    
    updated = conn.execute("SELECT * FROM vehicle_activities WHERE id = ?", (entry_id,)).fetchone()
    if updated and updated['odometer'] is not None and e['type'] != 'reminder':
        v = conn.execute("SELECT odometer FROM vehicles WHERE id = ?", (updated['vehicleId'],)).fetchone()
        if v and updated['odometer'] > v['odometer']:
            conn.execute("UPDATE vehicles SET odometer = ? WHERE id = ?", (updated['odometer'], updated['vehicleId']))
            
    conn.commit()
    conn.close()
    return jsonify(dict(updated))

@app.route('/api/vehicles/import-historical', methods=['POST'])
def vehicles_import_historical():
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    garage_id = request.json.get('garage_id')
    if not garage_id:
        return jsonify({"errore": _("Missing garage_id")}), 400
        
    conn = get_db_connection()
    p = conn.execute("SELECT id FROM garages WHERE id = ? AND user_id = ?", (garage_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({"errore": _("Garage not found or unauthorized")}), 404
        
    try:
        import_dir = os.path.join(os.path.dirname(__file__), 'import')
        if not os.path.exists(import_dir):
            conn.close()
            return jsonify({"errore": "Cartella import/ non trovata"}), 404
            
        files = os.listdir(import_dir)
        csv_files = [f for f in files if f.lower().endswith('.csv')]
        
        imported_stats = {}
        for file in csv_files:
            filepath = os.path.join(import_dir, file)
            match = re.search(r'VEICOLO-(.*)\.csv$', file, re.IGNORECASE)
            name = match.group(1).upper() if match else 'VEICOLO'
            veh_id = f"veh-{name.lower()}-{garage_id}"
            
            brand = name
            model = name
            fuel = 'Benzina'
            plate = 'XX 000 YY'
            tank_size = 40.0
            v_type = 'Auto'
            
            if 'PANDA' in name:
                brand = 'Fiat'
                model = 'Panda'
                fuel = 'Metano'
                plate = 'AB 123 CD'
                tank_size = 38.0
            elif 'SKODA' in name:
                brand = 'Skoda'
                model = 'Kamiq'
                fuel = 'Metano'
                plate = 'XY 987 ZW'
                tank_size = 50.0
                
            conn.execute('''
                INSERT OR REPLACE INTO vehicles (id, brand, model, type, fuel, plate, year, odometer, tankSize, garage_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (veh_id, brand, model, v_type, fuel, plate, 2020, 0.0, tank_size, garage_id))
            
            with open(filepath, 'r', encoding='utf-8') as f:
                csv_content = f.read()
                
            stats = parse_and_insert_csv(conn, veh_id, csv_content)
            imported_stats[name] = stats
            
        conn.commit()
        conn.close()
        return jsonify({"success": True, "imported": imported_stats})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"errore": f"Errore durante l'importazione: {str(e)}"}), 500

@app.route('/api/vehicles/<vehicle_id>/import', methods=['POST'])
def vehicle_custom_import(vehicle_id):
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    csv_content = request.json.get('csvContent')
    if not csv_content:
        return jsonify({"errore": "Missing csvContent"}), 400
        
    conn = get_db_connection()
    v = conn.execute('''
        SELECT v.* FROM vehicles v
        JOIN garages p ON v.garage_id = p.id
        WHERE v.id = ? AND p.user_id = ?
    ''', (vehicle_id, session['user_id'])).fetchone()
    if not v:
        conn.close()
        return jsonify({"errore": "Vehicle not found or unauthorized"}), 404
        
    try:
        stats = parse_and_insert_csv(conn, vehicle_id, csv_content)
        conn.commit()
        conn.close()
        return jsonify({"success": True, "count": stats})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"errore": f"Errore durante l'importazione CSV: {str(e)}"}), 500

@app.route('/api/vehicles/<vehicle_id>/export', methods=['GET'])
def vehicle_custom_export(vehicle_id):
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    conn = get_db_connection()
    v = conn.execute('''
        SELECT v.* FROM vehicles v
        JOIN garages p ON v.garage_id = p.id
        WHERE v.id = ? AND p.user_id = ?
    ''', (vehicle_id, session['user_id'])).fetchone()
    if not v:
        conn.close()
        return "Vehicle not found", 404
        
    try:
        refuels = conn.execute("SELECT * FROM vehicle_activities WHERE vehicleId = ? AND type = 'refuel' ORDER BY odometer DESC, date DESC", (vehicle_id,)).fetchall()
        expenses = conn.execute("SELECT * FROM vehicle_activities WHERE vehicleId = ? AND type = 'expense' ORDER BY odometer DESC, date DESC", (vehicle_id,)).fetchall()
        services = conn.execute("SELECT * FROM vehicle_activities WHERE vehicleId = ? AND type = 'service' ORDER BY odometer DESC, date DESC", (vehicle_id,)).fetchall()
        conn.close()
        
        lines = []
        def q(val):
            if val is None:
                return '""'
            return f'"{str(val).replace(chr(34), chr(34)+chr(34))}"'
            
        lines.append('##Refuelling')
        lines.append('"Contachilometri (km)","Data","Carburante","Prezzo / kg","Costo totale","Volume","Pieno","Secondo carburante","Prezzo / kg","Costo totale","Volume","Pieno" 2,"Terzo carburante","Prezzo / kg","Costo totale","Volume","Pieno" 3,"Consumo","Distanza","Distributore di benzina","Guidatore","Motivo","Metodo di pagamento","Note"')
        for r in refuels:
            lines.append(','.join([
                q(r['odometer']), q(r['date']), q(r['fuelType']), q(r['priceUnit']), q(r['totalCost']), q(r['liters']),
                q('Sì' if r['isFull'] else 'No'), q(r['fuel2']), q(r['priceUnit2']), q(r['totalCost2']), q(r['liters2']),
                q('Sì' if r['isFull2'] else 'No'), q(r['fuel3']), q(r['priceUnit3']), q(r['totalCost3']), q(r['liters3']),
                q('Sì' if r['isFull3'] else 'No'), q(r['consumption']), q(r['distance']), q(r['gasStation']), q(r['driver']),
                q(r['reason']), q(r['paymentMethod']), q(r['notes'])
            ]))
            
        lines.append('')
        
        lines.append('##Expense')
        lines.append('"Contachilometri (km)","Data","Costo totale","Tipologia di spesa","Spesa locale","Guidatore","Motivo","Metodo di pagamento","Note"')
        for e in expenses:
            lines.append(','.join([
                q(e['odometer']), q(e['date']), q(e['cost']), q(e['category']), q(e['location']), q(e['driver']),
                q(e['reason']), q(e['paymentMethod']), q(e['notes'])
            ]))
            
        lines.append('')
        
        lines.append('##Service')
        lines.append('"Contachilometri (km)","Data","Costo totale","Tipologia di manutenzione","Manutenzione locale","Guidatore","Metodo di pagamento","Note"')
        for s in services:
            lines.append(','.join([
                q(s['odometer']), q(s['date']), q(s['cost']), q(s['description']), q(s['provider']), q(s['driver']),
                q(s['paymentMethod']), q(s['notes'])
            ]))
            
        lines.append('')
        csv_content = '\n'.join(lines)
        
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        filename = f"{timestamp}_VEICOLO-{v['brand'].upper()}-{v['model'].upper()}.csv"
        
        response = make_response(csv_content)
        response.headers['Content-Type'] = 'text/csv'
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        return response
    except Exception as e:
        return f"Error: {str(e)}", 500

@app.route('/api/vehicles/reset', methods=['POST'])
def vehicle_reset_route():
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    garage_id = request.json.get('garage_id')
    if not garage_id:
        return jsonify({"errore": _("Missing garage_id")}), 400
        
    conn = get_db_connection()
    p = conn.execute("SELECT id FROM garages WHERE id = ? AND user_id = ?", (garage_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({"errore": _("Garage not found or unauthorized")}), 404
        
    try:
        conn.execute('''
            DELETE FROM vehicle_activities 
            WHERE vehicleId IN (SELECT id FROM vehicles WHERE garage_id = ?)
        ''', (garage_id,))
        conn.execute("DELETE FROM vehicles WHERE garage_id = ?", (garage_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"errore": f"Errore durante il reset: {str(e)}"}), 500

@app.route('/api/vehicles/import-backup', methods=['POST'])
def vehicle_import_backup():
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    garage_id = request.json.get('garage_id')
    vehicles = request.json.get('vehicles', [])
    entries = request.json.get('entries', [])
    
    if not garage_id:
        return jsonify({"errore": _("Missing garage_id")}), 400
        
    conn = get_db_connection()
    p = conn.execute("SELECT id FROM garages WHERE id = ? AND user_id = ?", (garage_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({"errore": _("Garage not found or unauthorized")}), 404
        
    try:
        conn.execute("DELETE FROM vehicle_activities WHERE vehicleId IN (SELECT id FROM vehicles WHERE garage_id = ?)", (garage_id,))
        conn.execute("DELETE FROM vehicles WHERE garage_id = ?", (garage_id,))
        
        for v in vehicles:
            conn.execute('''
                INSERT INTO vehicles (id, brand, model, type, fuel, plate, year, odometer, tankSize, garage_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (v['id'], v['brand'], v['model'], v['type'], v['fuel'], v.get('plate'), v.get('year'), v.get('odometer', 0.0), v.get('tankSize'), garage_id))
            
        for e in entries:
            keys = [k for k in e.keys() if k != 'garage_id' and k != 'portfolio_id']
            vals = []
            for k in keys:
                val = e[k]
                if isinstance(val, bool):
                    val = 1 if val else 0
                vals.append(val)
                
            fields_str = ', '.join(keys)
            placeholders = ', '.join(['?'] * len(keys))
            conn.execute(f"INSERT INTO vehicle_activities ({fields_str}) VALUES ({placeholders})", vals)
            
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"errore": f"Errore durante l'importazione backup: {str(e)}"}), 500

# --- API PRESTITI (LOANS) ---

# --- LOAN GROUPS CRUD ---
@app.route('/api/loan_groups', methods=['GET', 'POST'])
def manage_loan_groups():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    if request.method == 'POST':
        nome = request.json.get('name') or request.json.get('nome') or 'Nuovo Gruppo'
        cursor = conn.execute("INSERT INTO loan_groups (user_id, name) VALUES (?, ?)", (session['user_id'], nome))
        conn.commit()
        group_id = cursor.lastrowid
        conn.close()
        return jsonify({"messaggio": "Group created", "id": group_id}), 201
    rows = conn.execute("SELECT * FROM loan_groups WHERE user_id = ?", (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/loan_groups/<int:group_id>', methods=['PUT'])
def rename_loan_group(group_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    nuovo_nome = request.json.get('name') or request.json.get('nome')
    if not nuovo_nome or not nuovo_nome.strip():
        return jsonify({"errore": "Name cannot be empty"}), 400
    conn = get_db_connection()
    cursor = conn.execute(
        'UPDATE loan_groups SET name = ? WHERE id = ? AND user_id = ?',
        (nuovo_nome.strip(), group_id, session['user_id'])
    )
    conn.commit()
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"errore": "Loan group not found or unauthorized"}), 404
    conn.close()
    return jsonify({"messaggio": "Group renamed successfully"}), 200

@app.route('/api/loan_groups/<int:group_id>', methods=['DELETE'])
def delete_loan_group(group_id):
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    conn = get_db_connection()
    g = conn.execute("SELECT id FROM loan_groups WHERE id = ? AND user_id = ?", (group_id, session['user_id'])).fetchone()
    if not g:
        conn.close()
        return jsonify({"errore": "Loan group not found or unauthorized"}), 404
    loans = conn.execute("SELECT id FROM loans WHERE loan_group_id = ?", (group_id,)).fetchall()
    for l in loans:
        conn.execute("DELETE FROM loan_payments WHERE loan_id = ?", (l['id'],))
    conn.execute("DELETE FROM loans WHERE loan_group_id = ?", (group_id,))
    conn.execute("DELETE FROM loan_groups WHERE id = ?", (group_id,))
    conn.commit()
    conn.close()
    return jsonify({"messaggio": "Loan group deleted successfully"}), 200

@app.route('/api/loans', methods=['GET', 'POST'])
def loans_route():
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    loan_group_id = request.args.get('loan_group_id', type=int) or (request.json.get('loan_group_id') if (request.is_json and request.json) else None)
    if not loan_group_id:
        return jsonify({"errore": "Missing loan_group_id"}), 400
        
    conn = get_db_connection()
    gp = conn.execute("SELECT id FROM loan_groups WHERE id = ? AND user_id = ?", (loan_group_id, session['user_id'])).fetchone()
    if not gp:
        conn.close()
        return jsonify({"errore": "Loan group not found or unauthorized"}), 404
        
    if request.method == 'POST':
        data = request.json
        loan_id = data.get('id') or f"loan-{int(time.time() * 1000)}"
        name = data.get('name')
        principal = float(data.get('principal', 0))
        interest_rate = float(data.get('interest_rate', 0))
        term_months = int(data.get('term_months', 0))
        start_date = data.get('start_date')
        monthly_payment = data.get('monthly_payment')
        rate_type = data.get('rate_type', 'fixed')
        if monthly_payment is not None and monthly_payment != '':
            monthly_payment = float(monthly_payment)
        else:
            monthly_payment = None
            
        if not name or principal <= 0 or interest_rate < 0 or term_months <= 0 or not start_date:
            conn.close()
            return jsonify({"errore": "Missing or invalid required fields"}), 400
            
        try:
            conn.execute('''
                INSERT INTO loans (id, name, principal, interest_rate, term_months, start_date, monthly_payment, user_id, loan_group_id, rate_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (loan_id, name, principal, interest_rate, term_months, start_date, monthly_payment, session['user_id'], loan_group_id, rate_type))
            conn.commit()
        except sqlite3.IntegrityError as e:
            conn.close()
            return jsonify({"errore": f"Loan already exists or database error: {str(e)}"}), 400
            
        row = conn.execute("SELECT * FROM loans WHERE id = ?", (loan_id,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
        
    rows = conn.execute("SELECT * FROM loans WHERE loan_group_id = ? AND user_id = ? ORDER BY name ASC", (loan_group_id, session['user_id'])).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/loans/<loan_id>', methods=['PUT', 'DELETE'])
def loan_detail_route(loan_id):
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    conn = get_db_connection()
    loan = conn.execute("SELECT * FROM loans WHERE id = ? AND user_id = ?", (loan_id, session['user_id'])).fetchone()
    if not loan:
        conn.close()
        return jsonify({"errore": _("Loan not found or unauthorized")}), 404
        
    if request.method == 'DELETE':
        conn.execute("DELETE FROM loan_payments WHERE loan_id = ?", (loan_id,))
        conn.execute("DELETE FROM loans WHERE id = ?", (loan_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    data = request.json
    name = data.get('name', loan['name'])
    principal = float(data.get('principal', loan['principal']))
    interest_rate = float(data.get('interest_rate', loan['interest_rate']))
    term_months = int(data.get('term_months', loan['term_months']))
    start_date = data.get('start_date', loan['start_date'])
    monthly_payment = data.get('monthly_payment')
    if monthly_payment is not None and monthly_payment != '':
        monthly_payment = float(monthly_payment)
    else:
        monthly_payment = None
    loan_group_id = data.get('loan_group_id', loan['loan_group_id'])
    rate_type = data.get('rate_type', loan['rate_type'])
        
    conn.execute('''
        UPDATE loans 
        SET name = ?, principal = ?, interest_rate = ?, term_months = ?, start_date = ?, monthly_payment = ?, loan_group_id = ?, rate_type = ?
        WHERE id = ?
    ''', (name, principal, interest_rate, term_months, start_date, monthly_payment, loan_group_id, rate_type, loan_id))
    conn.commit()
    
    row = conn.execute("SELECT * FROM loans WHERE id = ?", (loan_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route('/api/loans/<loan_id>/payments', methods=['GET', 'POST'])
def loan_payments_route(loan_id):
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    conn = get_db_connection()
    # verify ownership of the loan
    loan = conn.execute("SELECT * FROM loans WHERE id = ? AND user_id = ?", (loan_id, session['user_id'])).fetchone()
    if not loan:
        conn.close()
        return jsonify({"errore": _("Loan not found or unauthorized")}), 404
        
    if request.method == 'POST':
        data = request.json
        payment_id = data.get('id') or f"pay-{int(time.time() * 1000)}"
        date = data.get('date')
        amount = float(data.get('amount', 0))
        p_type = data.get('type', 'regular') # 'regular' or 'extra'
        notes = data.get('notes', '')
        
        if not date or amount <= 0:
            conn.close()
            return jsonify({"errore": "Missing or invalid payment fields"}), 400
            
        # Evita duplicati (stessa data, tipo e importo per lo stesso prestito)
        duplicato = conn.execute('''
            SELECT id FROM loan_payments
            WHERE loan_id = ? AND date = ? AND type = ? AND amount = ?
        ''', (loan_id, date, p_type, amount)).fetchone()
        
        if duplicato:
            conn.close()
            return jsonify({"errore": "Pagamento duplicato", "duplicato": True}), 409
            
        try:
            conn.execute('''
                INSERT INTO loan_payments (id, loan_id, date, amount, type, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (payment_id, loan_id, date, amount, p_type, notes))
            conn.commit()
        except sqlite3.IntegrityError as e:
            conn.close()
            return jsonify({"errore": f"Payment error: {str(e)}"}), 400
            
        row = conn.execute("SELECT * FROM loan_payments WHERE id = ?", (payment_id,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
        
    rows = conn.execute("SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY date ASC, id ASC", (loan_id,)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/loans/payments/<payment_id>', methods=['PUT', 'DELETE'])
def loan_payment_detail_route(payment_id):
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
        
    conn = get_db_connection()
    # verify ownership through join
    payment = conn.execute('''
        SELECT p.* FROM loan_payments p
        JOIN loans l ON p.loan_id = l.id
        WHERE p.id = ? AND l.user_id = ?
    ''', (payment_id, session['user_id'])).fetchone()
    
    if not payment:
        conn.close()
        return jsonify({"errore": _("Payment not found or unauthorized")}), 404
        
    if request.method == 'DELETE':
        conn.execute("DELETE FROM loan_payments WHERE id = ?", (payment_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    data = request.json
    date = data.get('date', payment['date'])
    amount = float(data.get('amount', payment['amount']))
    p_type = data.get('type', payment['type'])
    notes = data.get('notes', payment['notes'])
    
    conn.execute('''
        UPDATE loan_payments 
        SET date = ?, amount = ?, type = ?, notes = ?
        WHERE id = ?
    ''', (date, amount, p_type, notes, payment_id))
    conn.commit()
    
    row = conn.execute("SELECT * FROM loan_payments WHERE id = ?", (payment_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route('/api/loans/parse_statement_pdf', methods=['POST'])
def parse_statement_pdf():
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401

    if 'file' not in request.files:
        return jsonify({"errore": "No file uploaded"}), 400

    pdf_file = request.files['file']
    if not pdf_file.filename.lower().endswith('.pdf'):
        return jsonify({"errore": "File must be a PDF"}), 400

    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"

        if not text.strip():
            return jsonify({"errore": "Could not extract text from PDF (it might be an image/scanned PDF)"}), 400

        # Now, call Gemini
        api_key = app.config.get('GEMINI_API_KEY') or os.environ.get('GEMINI_API_KEY')
        if not genai or not api_key:
            # Simple rule-based regex parser fallback for safety
            import re
            transactions = []
            lines = text.split('\n')
            for line in lines:
                date_match = re.search(r'(\d{2})[/\.-](\d{2})[/\.-](\d{4})', line)
                money_matches = re.findall(r'([-+]?\s*\d+[\.,]\d{2})', line)
                if date_match and money_matches:
                    day, month, year = date_match.groups()
                    iso_date = f"{year}-{month}-{day}"
                    for m in money_matches:
                        cleaned = m.replace(' ', '').replace('€', '').replace(',', '.')
                        try:
                            val = abs(float(cleaned))
                            if val > 0:
                                transactions.append({
                                    "date": iso_date,
                                    "amount": val,
                                    "type": "regular",
                                    "notes": f"Rilevato: {line.strip()[:40]}"
                                })
                                break
                        except ValueError:
                            pass
            return jsonify({"transactions": transactions, "method": "regex_fallback"})

        client = genai.Client(api_key=api_key)
        model_name = app.config.get('GEMINI_MODEL_PRIMARY', 'gemini-3.5-flash')
        
        prompt = (
            "Sei un assistente contabile esperto. Analizza il seguente testo estratto da un "
            "estratto conto / documento finanziario di un intermediario di prestiti/finanziamenti.\n"
            "Trova tutte le transazioni di rimborso del debito (rate mensili pagate, pagamenti di addebito SDD, "
            "o eventuali rimborsi anticipati/straordinari).\n\n"
            "Restituisci esclusivamente un array JSON valido con oggetti strutturati in questo modo (non aggiungere markdown o altro testo prima o dopo):\n"
            "[\n"
            "  {\n"
            "    \"date\": \"YYYY-MM-DD\",\n"
            "    \"amount\": float,\n"
            "    \"type\": \"regular\" o \"extra\",\n"
            "    \"notes\": \"descrizione breve (es. Rata Prestito, Rimborso Straordinario)\"\n"
            "  }\n"
            "]\n\n"
            "Note per il parsing:\n"
            "- Il campo 'type' deve essere 'regular' per le rate periodiche ordinarie e 'extra' per pagamenti straordinari/rimborsi parziali.\n"
            "- Converti le date nel formato YYYY-MM-DD.\n"
            "- L'importo deve essere un valore numerico positivo (float).\n\n"
            f"Testo estratto:\n{text}"
        )

        response = client.models.generate_content(
            model=model_name,
            contents=prompt
        )

        resp_text = response.text
        if resp_text.startswith("```"):
            lines = resp_text.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            resp_text = "\n".join(lines)

        import json
        transactions = json.loads(resp_text.strip())
        return jsonify({"transactions": transactions, "method": "gemini"})

    except Exception as e:
        print(f"Error in parse_statement_pdf: {e}")
        return jsonify({"errore": f"Errore durante l'elaborazione del PDF: {str(e)}"}), 500



# ═══════════════════════════════════════════════════════════════════════════════
# STIPENDI API
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/salary_groups', methods=['GET', 'POST'])
def salary_groups_route():
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    if request.method == 'POST':
        data = request.json
        name = (data.get('name') or '').strip()
        if not name:
            conn.close()
            return jsonify({"errore": "Nome gruppo mancante"}), 400
        cur = conn.execute("INSERT INTO salary_groups (name, user_id) VALUES (?, ?)", (name, session['user_id']))
        conn.commit()
        row = conn.execute("SELECT * FROM salary_groups WHERE id = ?", (cur.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    rows = conn.execute("SELECT * FROM salary_groups WHERE user_id = ? ORDER BY name", (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/salary_groups/<int:group_id>', methods=['PUT', 'DELETE'])
def salary_group_detail(group_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    g = conn.execute("SELECT id FROM salary_groups WHERE id = ? AND user_id = ?", (group_id, session['user_id'])).fetchone()
    if not g:
        conn.close()
        return jsonify({"errore": "Gruppo non trovato"}), 404
    if request.method == 'DELETE':
        conn.execute("DELETE FROM salary_groups WHERE id = ?", (group_id,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    data = request.json
    conn.execute("UPDATE salary_groups SET name = ? WHERE id = ?", (data.get('name','').strip(), group_id))
    conn.commit()
    row = conn.execute("SELECT * FROM salary_groups WHERE id = ?", (group_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route('/api/salary_groups/<int:group_id>/salaries', methods=['GET', 'POST'])
def salaries_route(group_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    g = conn.execute("SELECT id FROM salary_groups WHERE id = ? AND user_id = ?", (group_id, session['user_id'])).fetchone()
    if not g:
        conn.close()
        return jsonify({"errore": "Gruppo non trovato"}), 404
    if request.method == 'POST':
        data = request.json
        sid = f"sal-{int(time.time()*1000)}"
        conn.execute(
            "INSERT INTO salaries (id, salary_group_id, person_name, month, gross, net, notes) VALUES (?,?,?,?,?,?,?)",
            (sid, group_id, data.get('person_name',''), data.get('month',''), float(data.get('gross',0)), float(data.get('net',0)), data.get('notes',''))
        )
        conn.commit()
        row = conn.execute("SELECT * FROM salaries WHERE id = ?", (sid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    rows = conn.execute("SELECT * FROM salaries WHERE salary_group_id = ? ORDER BY month DESC, person_name", (group_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/salaries/<salary_id>', methods=['PUT', 'DELETE'])
def salary_detail(salary_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    s = conn.execute("SELECT s.* FROM salaries s JOIN salary_groups g ON s.salary_group_id=g.id WHERE s.id=? AND g.user_id=?", (salary_id, session['user_id'])).fetchone()
    if not s:
        conn.close()
        return jsonify({"errore": "Busta paga non trovata"}), 404
    if request.method == 'DELETE':
        conn.execute("DELETE FROM salaries WHERE id = ?", (salary_id,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    data = request.json
    conn.execute("UPDATE salaries SET person_name=?, month=?, gross=?, net=?, notes=? WHERE id=?",
                 (data.get('person_name',''), data.get('month',''), float(data.get('gross',0)), float(data.get('net',0)), data.get('notes',''), salary_id))
    conn.commit()
    row = conn.execute("SELECT * FROM salaries WHERE id=?", (salary_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route('/api/salaries/<salary_id>/items', methods=['GET', 'POST'])
def salary_items_route(salary_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    if request.method == 'POST':
        data = request.json
        iid = f"si-{int(time.time()*1000)}"
        conn.execute("INSERT INTO salary_items (id, salary_id, label, amount, item_type) VALUES (?,?,?,?,?)",
                     (iid, salary_id, data.get('label',''), float(data.get('amount',0)), data.get('item_type','deduction')))
        conn.commit()
        row = conn.execute("SELECT * FROM salary_items WHERE id=?", (iid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    rows = conn.execute("SELECT * FROM salary_items WHERE salary_id=? ORDER BY item_type, label", (salary_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/salary_items/<item_id>', methods=['PUT', 'DELETE'])
def salary_item_detail(item_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    if request.method == 'DELETE':
        conn.execute("DELETE FROM salary_items WHERE id=?", (item_id,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    data = request.json
    conn.execute("UPDATE salary_items SET label=?, amount=?, item_type=? WHERE id=?",
                 (data.get('label',''), float(data.get('amount',0)), data.get('item_type','deduction'), item_id))
    conn.commit()
    row = conn.execute("SELECT * FROM salary_items WHERE id=?", (item_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route('/api/salaries/parse_pdf', methods=['POST'])
def parse_payroll_pdf():
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    if 'file' not in request.files:
        return jsonify({"errore": "Nessun file caricato"}), 400
    pdf_file = request.files['file']
    if not pdf_file.filename.lower().endswith('.pdf'):
        return jsonify({"errore": "Il file deve essere un PDF"}), 400
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
        if not text.strip():
            return jsonify({"errore": "Impossibile estrarre testo dal PDF"}), 400

        def clean_amount(s):
            if not s:
                return 0.0
            s = re.sub(r'[^\d\.,\-]', '', s)
            if not s:
                return 0.0
            is_negative = False
            if s.endswith('-'):
                is_negative = True
                s = s[:-1]
            elif s.startswith('-'):
                is_negative = True
                s = s[1:]
            
            if ',' in s and '.' in s:
                if s.rfind(',') > s.rfind('.'):
                    s = s.replace('.', '').replace(',', '.')
                else:
                    s = s.replace(',', '')
            elif ',' in s:
                s = s.replace(',', '.')
            
            try:
                val = float(s)
                return -val if is_negative else val
            except ValueError:
                return 0.0

        import datetime
        month_tags_raw = request.form.get('month_tags', 'competenza, periodo, mese, cedolino, mensilità, retribuzione')
        person_tags_raw = request.form.get('person_tags', 'dipendente, lavoratore, collaboratore, cognome e nome, nome e cognome, nominativo, anagrafica dipendente')
        gross_tags_raw = request.form.get('gross_tags', 'totale competenze, lordo mensile, totale lordo, retribuzione lorda, lordo, imponibile fiscale, imponibile inps, imponibile previdenziale, imponibile')
        net_tags_raw = request.form.get('net_tags', 'netto in busta, netto da pagare, netto a pagare, totale netto, netto cedolino, netto dovuto, netto spettante, totale a pagare, netto')

        month_tags = [t.strip().lower() for t in month_tags_raw.split(',') if t.strip()]
        person_tags = [t.strip().lower() for t in person_tags_raw.split(',') if t.strip()]
        gross_tags = [t.strip().lower() for t in gross_tags_raw.split(',') if t.strip()]
        net_tags = [t.strip().lower() for t in net_tags_raw.split(',') if t.strip()]

        month_escaped = '|'.join(re.escape(t) for t in month_tags) if month_tags else 'competenza|periodo|mese|cedolino|mensilità|retribuzione'
        person_escaped = '|'.join(re.escape(t) for t in person_tags) if person_tags else 'dipendente|lavoratore|collaboratore|cognome\\s*e\\s*nome|nome\\s*e\\s*cognome|nominativo|anagrafica\\s+dipendente'
        gross_escaped = '|'.join(re.escape(t) for t in gross_tags) if gross_tags else 'totale\\s+competenze|lordo\\s+mensile|totale\\s+lordo|retribuzione\\s+lorda|lordo|imponibile\\s+fiscale|imponibile\\s+inps|imponibile\\s+previdenziale|imponibile'
        net_escaped = '|'.join(re.escape(t) for t in net_tags) if net_tags else 'netto\\s+in\\s+busta|netto\\s+da\\s+pagare|netto\\s+a\\s+pagare|totale\\s+netto|netto\\s+cedolino|netto\\s+dovuto|netto\\s+spettante|totale\\s+a\\s+pagare|netto'

        def find_money_in_line(line_str):
            matches = re.findall(r'\b\d[\d\.,]*\b', line_str)
            vals = []
            for m in matches:
                if ',' in m or '.' in m:
                    val = clean_amount(m)
                    if val > 0:
                        vals.append(val)
            return vals

        month = None
        months_it = {
            'gennaio': '01', 'febbraio': '02', 'marzo': '03', 'aprile': '04',
            'maggio': '05', 'giugno': '06', 'luglio': '07', 'agosto': '08',
            'settembre': '09', 'ottobre': '10', 'novembre': '11', 'dicembre': '12',
            'gen': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'mag': '05', 'giu': '06',
            'lug': '07', 'ago': '08', 'set': '09', 'ott': '10', 'nov': '11', 'dic': '12'
        }

        # 1. Month detection (robust line-by-line)
        lines = text.split('\n')
        for line in lines:
            for m_it, m_num in months_it.items():
                if re.search(r'\b' + m_it + r'\b', line, re.I):
                    m_year = re.search(r'\b(20\d{2})\b', line)
                    if m_year:
                        month = f"{m_year.group(1)}-{m_num}"
                        break
            if month:
                break

        # Fallback patterns for month
        if not month:
            m_date_numeric = re.search(r'\b(0[1-9]|1[0-2])[\/-](20\d{2})\b', text)
            if m_date_numeric:
                month = f"{m_date_numeric.group(2)}-{m_date_numeric.group(1)}"

        if not month:
            m_date_iso = re.search(r'\b(20\d{2})[\/-](0[1-9]|1[0-2])\b', text)
            if m_date_iso:
                month = f"{m_date_iso.group(1)}-{m_date_iso.group(2)}"

        if not month:
            month = datetime.date.today().strftime("%Y-%m")

        # 2. Employee/Person detection
        person_name = ""
        person_line_idx = -1
        for idx, line in enumerate(lines):
            line_lower = line.lower()
            if any(t in line_lower for t in person_tags):
                parts = re.split(r'[:\-]', line)
                if len(parts) > 1:
                    cand = parts[1].strip()
                    cand_cleaned = re.sub(r'[^A-Za-zÀ-ÿ\s]', '', cand).strip()
                    if len(cand_cleaned) > 3:
                        person_name = cand_cleaned
                        person_line_idx = idx
                        break

        # Fallback: scan for ID + Uppercase words (e.g. "65 CORRENTE MATTIA")
        if not person_name:
            for idx, line in enumerate(lines):
                line_clean = line.strip()
                m = re.match(r'^(\d+)\s+([A-Z\s\-]{3,35})$', line_clean)
                if m:
                    emp_id = m.group(1)
                    emp_name = m.group(2).strip()
                    if len(emp_id) != 5: # Skip zip codes
                        if not any(w in emp_name for w in ["MINIMO", "IMPORTO", "DIPENDENTE", "RETRIBUZIONE", "PAGINA", "LIVELLO"]):
                            person_name = emp_name
                            person_line_idx = idx
                            break

        # 3. Gross detection
        gross = 0.0
        for idx, line in enumerate(lines):
            line_lower = line.lower()
            if any(t in line_lower for t in gross_tags):
                # Check same line
                vals = find_money_in_line(line)
                if vals:
                    gross = vals[-1]
                    break
                # Check line above
                if idx > 0:
                    vals = find_money_in_line(lines[idx-1])
                    if vals:
                        gross = vals[-1]
                        break
                # Check line below
                if idx < len(lines) - 1:
                    vals = find_money_in_line(lines[idx+1])
                    if vals:
                        gross = vals[-1]
                        break

        # 4. Net detection
        net = 0.0
        for idx, line in enumerate(lines):
            line_lower = line.lower()
            if any(t in line_lower for t in net_tags):
                # Check same line
                vals = find_money_in_line(line)
                if vals:
                    net = vals[-1]
                    break
                # Check line above
                if idx > 0:
                    vals = find_money_in_line(lines[idx-1])
                    if vals:
                        net = vals[-1]
                        break
                # Check line below
                if idx < len(lines) - 1:
                    vals = find_money_in_line(lines[idx+1])
                    if vals:
                        net = vals[-1]
                        break

        # Fallback A for Net: Search near employee name (since Net is often near name in header boxes)
        if net == 0.0 and person_line_idx != -1:
            for check_idx in [person_line_idx+1, person_line_idx+2, person_line_idx, person_line_idx-1]:
                if 0 <= check_idx < len(lines):
                    vals = find_money_in_line(lines[check_idx])
                    vals = [v for v in vals if 500.0 <= v <= 10000.0 and v != gross]
                    if vals:
                        net = vals[-1]
                        break

        # Fallback B for Net: Search near IBAN/Bank line
        if net == 0.0:
            for idx, line in enumerate(lines):
                if re.search(r'\bIT\d{2}[A-Z\d\s\/-]{10,}\b', line, re.I):
                    net_candidates = []
                    for check_idx in range(max(0, idx-2), min(len(lines), idx+3)):
                        vals = find_money_in_line(lines[check_idx])
                        vals = [v for v in vals if v != gross]
                        if vals:
                            net_candidates.extend(vals)
                    if net_candidates:
                        net = net_candidates[-1]
                        break

        items = []
        item_keywords = [
            {"label": "Assegno Unico", "pattern": r'\b(?:assegno\s+unico|assegni\s+familiari)\b', "type": "bonus"},
            {"label": "Rimborso Spese", "pattern": r'\b(?:rimborso\s+spese|rimborsi|piè\s+di\s+lista)\b', "type": "allowance"},
            {"label": "Superminimo", "pattern": r'\b(?:superminimo)\b', "type": "bonus"},
            {"label": "Tredicesima", "pattern": r'\b(?:tredicesima|13ma|13ª)\b', "type": "bonus"},
            {"label": "Quattordicesima", "pattern": r'\b(?:quattordicesima|14ma|14ª)\b', "type": "bonus"},
            {"label": "Trattenuta Sindacale", "pattern": r'\b(?:sindacato|sindacale|trattenuta\s+sind)\b', "type": "deduction"},
            {"label": "Addizionale Regionale", "pattern": r'\b(?:addizionale\s+regionale|addiz\s+reg)\b', "type": "deduction"},
            {"label": "Addizionale Comunale", "pattern": r'\b(?:addizionale\s+comunale|addiz\s+com)\b', "type": "deduction"},
            {"label": "IRPEF", "pattern": r'\b(?:irpef|ritenuta\s+irpef|imposta\s+irpef)\b', "type": "deduction"},
            {"label": "INPS", "pattern": r'\b(?:contributi\s+inps|inps|ritenuta\s+previdenziale)\b', "type": "deduction"},
        ]

        for line in text.split('\n'):
            line_clean = line.strip()
            for kw in item_keywords:
                if re.search(kw["pattern"], line_clean, re.I):
                    m_amt = re.search(r'([-\d\.,]+)\s*$', line_clean)
                    if not m_amt:
                        amounts = re.findall(r'(\d+[\.,]\d{2}(?:-)?)\b', line_clean)
                        if amounts:
                            m_amt_val = amounts[-1]
                        else:
                            m_amt_val = None
                    else:
                        m_amt_val = m_amt.group(1)
                    
                    if m_amt_val:
                        amt = abs(clean_amount(m_amt_val))
                        if amt > 0:
                            if not any(i["label"] == kw["label"] and i["amount"] == amt for i in items):
                                items.append({
                                    "label": kw["label"],
                                    "amount": amt,
                                    "item_type": kw["type"]
                                })

        return jsonify({
            "type": "payslip",
            "salaries": [{
                "month": month,
                "person_name": person_name,
                "gross": gross,
                "net": net,
                "items": items,
                "notes": "Rilevato tramite estrazione testo"
            }],
            "method": "rules"
        })
    except Exception as e:
        return jsonify({"errore": str(e)}), 500

# ═══════════════════════════════════════════════════════════════════════════════
# FONDO PENSIONE API
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/pension_fund_groups', methods=['GET', 'POST'])
def pension_fund_groups_route():
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    if request.method == 'POST':
        data = request.json
        name = (data.get('name') or '').strip()
        if not name:
            conn.close()
            return jsonify({"errore": "Nome mancante"}), 400
        cur = conn.execute("INSERT INTO pension_fund_groups (name, user_id) VALUES (?,?)", (name, session['user_id']))
        conn.commit()
        row = conn.execute("SELECT * FROM pension_fund_groups WHERE id=?", (cur.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    rows = conn.execute("SELECT * FROM pension_fund_groups WHERE user_id=? ORDER BY name", (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/pension_fund_groups/<int:group_id>', methods=['PUT', 'DELETE'])
def pension_fund_group_detail(group_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    g = conn.execute("SELECT id FROM pension_fund_groups WHERE id=? AND user_id=?", (group_id, session['user_id'])).fetchone()
    if not g:
        conn.close()
        return jsonify({"errore": "Gruppo non trovato"}), 404
    if request.method == 'DELETE':
        conn.execute("DELETE FROM pension_fund_groups WHERE id=?", (group_id,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    data = request.json
    conn.execute("UPDATE pension_fund_groups SET name=? WHERE id=?", (data.get('name','').strip(), group_id))
    conn.commit()
    row = conn.execute("SELECT * FROM pension_fund_groups WHERE id=?", (group_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route('/api/pension_fund_groups/<int:group_id>/funds', methods=['GET', 'POST'])
def pension_funds_route(group_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    g = conn.execute("SELECT id FROM pension_fund_groups WHERE id=? AND user_id=?", (group_id, session['user_id'])).fetchone()
    if not g:
        conn.close()
        return jsonify({"errore": "Gruppo non trovato"}), 404
    if request.method == 'POST':
        data = request.json
        fid = f"pf-{int(time.time()*1000)}"
        conn.execute("INSERT INTO pension_funds (id, pension_fund_group_id, name, provider, fund_type, notes) VALUES (?,?,?,?,?,?)",
                     (fid, group_id, data.get('name',''), data.get('provider',''), data.get('fund_type','category'), data.get('notes','')))
        conn.commit()
        row = conn.execute("SELECT * FROM pension_funds WHERE id=?", (fid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    rows = conn.execute("SELECT * FROM pension_funds WHERE pension_fund_group_id=? ORDER BY name", (group_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/pension_funds/<fund_id>', methods=['PUT', 'DELETE'])
def pension_fund_detail(fund_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    f = conn.execute("SELECT pf.* FROM pension_funds pf JOIN pension_fund_groups pg ON pf.pension_fund_group_id=pg.id WHERE pf.id=? AND pg.user_id=?", (fund_id, session['user_id'])).fetchone()
    if not f:
        conn.close()
        return jsonify({"errore": "Fondo non trovato"}), 404
    if request.method == 'DELETE':
        conn.execute("DELETE FROM pension_funds WHERE id=?", (fund_id,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    data = request.json
    conn.execute("UPDATE pension_funds SET name=?, provider=?, fund_type=?, notes=? WHERE id=?",
                 (data.get('name',''), data.get('provider',''), data.get('fund_type','category'), data.get('notes',''), fund_id))
    conn.commit()
    row = conn.execute("SELECT * FROM pension_funds WHERE id=?", (fund_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route('/api/pension_funds/<fund_id>/contributions', methods=['GET', 'POST'])
def pension_contributions_route(fund_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    if request.method == 'POST':
        data = request.json
        cid = f"pc-{int(time.time()*1000)}"
        tfr = float(data.get('tfr', 0))
        wc  = float(data.get('worker_contrib', 0))
        ec  = float(data.get('employer_contrib', 0))
        tv  = float(data.get('total_value', tfr + wc + ec))
        conn.execute("INSERT INTO pension_contributions (id, fund_id, month, tfr, worker_contrib, employer_contrib, total_value, notes) VALUES (?,?,?,?,?,?,?,?)",
                     (cid, fund_id, data.get('month',''), tfr, wc, ec, tv, data.get('notes','')))
        conn.commit()
        row = conn.execute("SELECT * FROM pension_contributions WHERE id=?", (cid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    rows = conn.execute("SELECT * FROM pension_contributions WHERE fund_id=? ORDER BY month DESC", (fund_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/pension_contributions/<contrib_id>', methods=['PUT', 'DELETE'])
def pension_contribution_detail(contrib_id):
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    conn = get_db_connection()
    if request.method == 'DELETE':
        conn.execute("DELETE FROM pension_contributions WHERE id=?", (contrib_id,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    data = request.json
    tfr = float(data.get('tfr', 0))
    wc  = float(data.get('worker_contrib', 0))
    ec  = float(data.get('employer_contrib', 0))
    tv  = float(data.get('total_value', tfr + wc + ec))
    conn.execute("UPDATE pension_contributions SET month=?, tfr=?, worker_contrib=?, employer_contrib=?, total_value=?, notes=? WHERE id=?",
                 (data.get('month',''), tfr, wc, ec, tv, data.get('notes',''), contrib_id))
    conn.commit()
    row = conn.execute("SELECT * FROM pension_contributions WHERE id=?", (contrib_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route('/api/pension_funds/parse_pdf', methods=['POST'])
def parse_pension_pdf():
    if 'user_id' not in session:
        return jsonify({"errore": "Non autenticato"}), 401
    if 'file' not in request.files:
        return jsonify({"errore": "Nessun file caricato"}), 400
    pdf_file = request.files['file']
    if not pdf_file.filename.lower().endswith('.pdf'):
        return jsonify({"errore": "Il file deve essere un PDF"}), 400
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
        if not text.strip():
            return jsonify({"errore": "Impossibile estrarre testo dal PDF (potrebbe essere una scansione o un file protetto)"}), 400

        def clean_float(val):
            if not val: return 0.0
            val = val.replace('.', '').replace(',', '.')
            try: return float(val)
            except: return 0.0

        def run_pension_pdf_regex_fallback(pdf_text):
            # Try statement pattern regex first (e.g. Cometa)
            pattern = r'\b(Contributo|Distribuzione|Switch\s+\w+)\b\s+([-\d\.,]+)\s+(\w+)\s+([-\d\.,]+)\s+([-\d\.,]+)\s+([-\d\.,]+)\s+([-\d\.,]+)\s+([-\d\.,]+)\s+([-\d\.,]+)\s+(\d{2}/\d{2}/\d{4})'
            matches = re.findall(pattern, pdf_text)
            
            if len(matches) > 0:
                contribs = []
                for m in matches:
                    op, tfr_str, comp, worker_str, employer_str, altro_str, nq, vq, spese, date_str = m
                    tfr = clean_float(tfr_str)
                    worker = clean_float(worker_str)
                    employer = clean_float(employer_str)
                    total = tfr + worker + employer
                    
                    day, month, year = date_str.split('/')
                    month_key = f"{year}-{month}"
                    
                    if tfr == 0.0 and worker == 0.0 and employer == 0.0:
                        continue
                        
                    contribs.append({
                        "month": month_key,
                        "tfr": tfr,
                        "worker_contrib": worker,
                        "employer_contrib": employer,
                        "total_value": total,
                        "notes": f"Rilevato da PDF: {op} ({comp})"
                    })
                
                contribs.sort(key=lambda x: x["month"], reverse=True)
                return jsonify({
                    "type": "statement",
                    "contributions": contribs,
                    "method": "regex"
                })
                
            # Single-payslip regex fallback
            import datetime
            t_tfr = 0.0
            wc = 0.0
            ec = 0.0
            month = datetime.date.today().strftime("%Y-%m")
            
            months_it = {
                'gennaio': '01', 'febbraio': '02', 'marzo': '03', 'aprile': '04',
                'maggio': '05', 'giugno': '06', 'luglio': '07', 'agosto': '08',
                'settembre': '09', 'ottobre': '10', 'novembre': '11', 'dicembre': '12'
            }
            for m_it, m_num in months_it.items():
                if re.search(r'\b' + m_it + r'\b', pdf_text, re.I):
                    m_year = re.search(r'\b(20\d{2})\b', pdf_text)
                    if m_year:
                        month = f"{m_year.group(1)}-{m_num}"
                        break
            
            for line in pdf_text.split('\n'):
                if re.search(r'\b(tfr|trattamento\s+fine\s+rapporto)\b', line, re.I):
                    m = re.search(r'(\d+[\.,]\d{2})', line)
                    if m:
                        try: t_tfr = clean_float(m.group(1))
                        except: pass
                if re.search(r'\b(contrib\S*\s+dip\S*|lavoratore|aderente|c/dip\S*|quota\s+aderente)\b', line, re.I):
                    m = re.search(r'(\d+[\.,]\d{2})', line)
                    if m:
                        try: wc = clean_float(m.group(1))
                        except: pass
                if re.search(r'\b(contrib\S*\s+az\S*|azienda|datore|c/az\S*|quota\s+datore)\b', line, re.I):
                    m = re.search(r'(\d+[\.,]\d{2})', line)
                    if m:
                        try: ec = clean_float(m.group(1))
                        except: pass
                        
            return jsonify({
                "type": "payslip",
                "contributions": [{
                    "month": month,
                    "tfr": t_tfr,
                    "worker_contrib": wc,
                    "employer_contrib": ec,
                    "total_value": t_tfr + wc + ec,
                    "notes": "Rilevato tramite Regex (no API Key)"
                }],
                "method": "regex"
            })

        api_key = app.config.get('GEMINI_API_KEY') or os.environ.get('GEMINI_API_KEY')
        if not genai or not api_key:
            return run_pension_pdf_regex_fallback(text)

        try:
            client = genai.Client(api_key=api_key)
            model_name = app.config.get('GEMINI_MODEL_PRIMARY', 'gemini-3.5-flash')
            prompt = (
                "Sei un esperto contabile italiano. Analizza il testo estratto da un documento che può essere una busta paga italiana o un estratto conto di un fondo pensione (es. Cometa, Fonchim, Fonte, Secondapensione, ecc.).\n"
                "Estrai tutti i contributi versati al fondo pensione (TFR, quota lavoratore/aderente, quota azienda/datore).\n"
                "Restituisci SOLO un oggetto JSON valido (senza markdown o altri blocchi di codice) con questa struttura:\n"
                "{\n"
                "  \"type\": \"payslip\" o \"statement\",\n"
                "  \"contributions\": [\n"
                "    {\n"
                "      \"month\": \"YYYY-MM\",\n"
                "      \"tfr\": float,\n"
                "      \"worker_contrib\": float,\n"
                "      \"employer_contrib\": float,\n"
                "      \"total_value\": float,\n"
                "      \"notes\": string\n"
                "    }\n"
                "  ]\n"
                "}\n"
                "Nota:\n"
                "- Il mese deve essere nel formato YYYY-MM.\n"
                "- Se un valore non è presente, impostalo a 0.0.\n"
                "- Se è una busta paga (payslip), di solito c'è un solo mese e un solo contributo.\n"
                "- Se è un estratto conto (statement), estrai la lista storica dei contributi mese per mese presenti nel documento.\n\n"
                f"Testo:\n{text}"
            )
            response = client.models.generate_content(model=model_name, contents=prompt)
            resp_text = response.text.strip()
            
            if "```" in resp_text:
                first_idx = resp_text.find("```")
                start_idx = resp_text.find("\n", first_idx)
                if start_idx == -1:
                    start_idx = first_idx + 3
                else:
                    start_idx += 1
                last_idx = resp_text.rfind("```")
                if last_idx != -1 and last_idx > start_idx:
                    resp_text = resp_text[start_idx:last_idx].strip()
                else:
                    resp_text = resp_text[start_idx:].strip()
            
            import json as json_mod
            result = json_mod.loads(resp_text)
            return jsonify({**result, "method": "gemini"})
        except Exception as gemini_err:
            print(f"Gemini processing error: {gemini_err}. Falling back to regex.")
            return run_pension_pdf_regex_fallback(text)
    except Exception as e:
        print(f"Error in parse_pension_pdf: {e}")
        return jsonify({"errore": f"Errore durante l'elaborazione del PDF: {str(e)}"}), 500

@app.route('/api/extract_pdf_text', methods=['POST'])
def extract_pdf_text_route():
    if 'user_id' not in session:
        return jsonify({"errore": _("Not authenticated")}), 401
    if 'file' not in request.files:
        return jsonify({"errore": _("No file uploaded")}), 400
    pdf_file = request.files['file']
    if not pdf_file.filename.lower().endswith('.pdf'):
        return jsonify({"errore": _("The file must be a PDF")}), 400
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
        return jsonify({"text": text})
    except Exception as e:
        return jsonify({"errore": f"Errore nell'estrazione del testo: {str(e)}"}), 500

@app.route('/api/salaries/import_custom_csv', methods=['POST'])
def import_custom_salaries_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    salary_group_id = request.args.get('salary_group_id')
    if not salary_group_id:
        return jsonify({"errore": "ID gruppo stipendi mancante"}), 400
        
    if 'file' not in request.files:
        return jsonify({"errore": _("No file uploaded")}), 400

    file = request.files['file']
    mapping_str = request.form.get('mapping')
    if not mapping_str:
        return jsonify({"errore": _("Missing column mapping")}), 400
        
    try:
        mapping = json.loads(mapping_str)
    except json.JSONDecodeError:
        return jsonify({"errore": _("Invalid mapping format")}), 400

    raw_content = file.stream.read()
    try: content = raw_content.decode("utf-8-sig")
    except UnicodeDecodeError: content = raw_content.decode("latin1")
    
    lines = [line for line in content.splitlines() if line.strip()]
    if not lines: return jsonify({"errore": _("The uploaded file is empty.")}), 400
        
    header_line = lines[0]
    delimiter = ';' if header_line.count(';') >= header_line.count(',') else ','
    
    conn = get_db_connection()
    try:
        stream = StringIO('\n'.join(lines), newline=None)
        csv_reader = csv.DictReader(stream, delimiter=delimiter)
        import random
        imported = 0
        updated = 0
        
        for row in csv_reader:
            month = (row.get(mapping.get('month')) or '').strip()
            person_name = (row.get(mapping.get('person_name')) or '').strip()
            if not month or not person_name:
                continue
                
            def parse_float(val):
                if not val: return 0.0
                val = val.replace('€', '').replace('$', '').strip()
                if '.' in val and ',' in val:
                    val = val.replace('.', '').replace(',', '.')
                elif ',' in val:
                    val = val.replace(',', '.')
                try: return float(val)
                except: return 0.0

            gross = parse_float(row.get(mapping.get('gross')))
            net = parse_float(row.get(mapping.get('net')))
            notes = (row.get(mapping.get('notes')) or '').strip()
            
            existing = conn.execute("SELECT id FROM salaries WHERE salary_group_id=? AND person_name=? AND month=?", (salary_group_id, person_name, month)).fetchone()
            if existing:
                conn.execute("UPDATE salaries SET gross=?, net=?, notes=? WHERE id=?", (gross, net, notes, existing['id']))
                updated += 1
            else:
                sid = f"sal-{int(time.time()*1000)}-{random.randint(1000, 9999)}"
                conn.execute("INSERT INTO salaries (id, salary_group_id, person_name, month, gross, net, notes) VALUES (?,?,?,?,?,?,?)",
                             (sid, salary_group_id, person_name, month, gross, net, notes))
                imported += 1
                
        conn.commit()
        return jsonify({"messaggio": f"Importazione completata: {imported} stipendi importati, {updated} aggiornati."})
    except Exception as e:
        print(f"Error in import_custom_salaries_csv: {e}")
        return jsonify({"errore": f"Errore durante l'importazione: {str(e)}"}), 500
    finally: conn.close()

@app.route('/api/pension_funds/import_custom_csv', methods=['POST'])
def import_custom_pension_csv():
    if 'user_id' not in session: return jsonify({"errore": _("Not authenticated")}), 401
    fund_id = request.args.get('fund_id')
    if not fund_id:
        return jsonify({"errore": "ID fondo pensione mancante"}), 400
        
    if 'file' not in request.files:
        return jsonify({"errore": _("No file uploaded")}), 400

    file = request.files['file']
    mapping_str = request.form.get('mapping')
    if not mapping_str:
        return jsonify({"errore": _("Missing column mapping")}), 400
        
    try:
        mapping = json.loads(mapping_str)
    except json.JSONDecodeError:
        return jsonify({"errore": _("Invalid mapping format")}), 400

    raw_content = file.stream.read()
    try: content = raw_content.decode("utf-8-sig")
    except UnicodeDecodeError: content = raw_content.decode("latin1")
    
    lines = [line for line in content.splitlines() if line.strip()]
    if not lines: return jsonify({"errore": _("The uploaded file is empty.")}), 400
        
    header_line = lines[0]
    delimiter = ';' if header_line.count(';') >= header_line.count(',') else ','
    
    conn = get_db_connection()
    try:
        stream = StringIO('\n'.join(lines), newline=None)
        csv_reader = csv.DictReader(stream, delimiter=delimiter)
        import random
        imported = 0
        updated = 0
        
        for row in csv_reader:
            month = (row.get(mapping.get('month')) or '').strip()
            if not month:
                continue
                
            def parse_float(val):
                if not val: return 0.0
                val = val.replace('€', '').replace('$', '').strip()
                if '.' in val and ',' in val:
                    val = val.replace('.', '').replace(',', '.')
                elif ',' in val:
                    val = val.replace(',', '.')
                try: return float(val)
                except: return 0.0

            tfr = parse_float(row.get(mapping.get('tfr')))
            worker_contrib = parse_float(row.get(mapping.get('worker_contrib')))
            employer_contrib = parse_float(row.get(mapping.get('employer_contrib')))
            total_value = parse_float(row.get(mapping.get('total_value')))
            if total_value == 0:
                total_value = tfr + worker_contrib + employer_contrib
            notes = (row.get(mapping.get('notes')) or '').strip()
            
            existing = conn.execute("SELECT id FROM pension_contributions WHERE fund_id=? AND month=?", (fund_id, month)).fetchone()
            if existing:
                conn.execute("UPDATE pension_contributions SET tfr=?, worker_contrib=?, employer_contrib=?, total_value=?, notes=? WHERE id=?",
                             (tfr, worker_contrib, employer_contrib, total_value, notes, existing['id']))
                updated += 1
            else:
                cid = f"pc-{int(time.time()*1000)}-{random.randint(1000, 9999)}"
                conn.execute("INSERT INTO pension_contributions (id, fund_id, month, tfr, worker_contrib, employer_contrib, total_value, notes) VALUES (?,?,?,?,?,?,?,?)",
                             (cid, fund_id, month, tfr, worker_contrib, employer_contrib, total_value, notes))
                imported += 1
                
        conn.commit()
        return jsonify({"messaggio": f"Importazione completata: {imported} contributi importati, {updated} aggiornati."})
    except Exception as e:
        print(f"Error in import_custom_pension_csv: {e}")
        return jsonify({"errore": f"Errore durante l'importazione: {str(e)}"}), 500
    finally: conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5001)