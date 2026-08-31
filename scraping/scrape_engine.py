import re
import json
import urllib.parse
import requests
import calendar
import datetime
from bs4 import BeautifulSoup

# ── HELPER FUNCTIONS ──────────────────────────────────────────────────────────

def clean_html(text):
    return re.sub(r'\s+', ' ', text).strip()

def parse_date_it(date_str):
    months_map = {
        'gen': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'mag': 5, 'giu': 6, 'lug': 7, 'ago': 8, 'set': 9,
        'ott': 10, 'nov': 11, 'dic': 12
    }
    date_str = date_str.replace(',', ' ').lower().strip()
    parts = date_str.split()
    if len(parts) == 3:
        month_val = None
        day_val = None
        year_val = None
        for part in parts:
            if part.isdigit():
                val = int(part)
                if val > 1900:
                    year_val = val
                else:
                    day_val = val
            else:
                for m_name, m_num in months_map.items():
                    if part.startswith(m_name):
                        month_val = m_num
                        break
        if year_val and month_val and day_val:
            return f"{year_val}-{month_val:02d}-{day_val:02d}"
            
    if len(parts) == 2:
        # e.g., "maggio 2026"
        month_val = None
        year_val = None
        for part in parts:
            if part.isdigit() and len(part) == 4:
                year_val = int(part)
            else:
                for m_name, m_num in months_map.items():
                    if part.startswith(m_name):
                        month_val = m_num
                        break
        if year_val and month_val:
            try:
                last_day = calendar.monthrange(year_val, month_val)[1]
                return f"{year_val}-{month_val:02d}-{last_day:02d}"
            except Exception:
                return f"{year_val}-{month_val:02d}-28"
                
    # Try ISO YYYY-MM-DD
    iso_match = re.search(r'(\d{4})[-/\.](\d{1,2})[-/\.](\d{1,2})', date_str)
    if iso_match:
        return f"{iso_match.group(1)}-{int(iso_match.group(2)):02d}-{int(iso_match.group(3)):02d}"
        
    # Try DD-MM-YYYY
    it_match = re.search(r'(\d{1,2})[-/\.](\d{1,2})[-/\.](\d{4})', date_str)
    if it_match:
        return f"{it_match.group(3)}-{int(it_match.group(2)):02d}-{int(it_match.group(1)):02d}"
        
    # Try MM-YYYY (e.g. 12/1998)
    my_match = re.search(r'^(\d{1,2})[-/\.](\d{4})$', date_str)
    if my_match:
        month = int(my_match.group(1))
        year = int(my_match.group(2))
        try:
            last_day = calendar.monthrange(year, month)[1]
            return f"{year}-{month:02d}-{last_day:02d}"
        except Exception:
            return f"{year}-{month:02d}-28"
        
    return None

def parse_price(price_str):
    price_str = price_str.strip()
    if not price_str:
        return 0.0
    # Strip currency symbols and non-numeric characters except dots, commas, and minus
    price_str = re.sub(r'[^\d\.,\-]', '', price_str)
    if not price_str:
        return 0.0
    if ',' in price_str and '.' in price_str:
        if price_str.index(',') > price_str.index('.'):
            price_str = price_str.replace('.', '').replace(',', '.')
        else:
            price_str = price_str.replace(',', '')
    elif ',' in price_str:
        if price_str.count(',') == 1:
            price_str = price_str.replace(',', '.')
        else:
            price_str = price_str.replace(',', '')
    try:
        return float(price_str)
    except ValueError:
        return 0.0

def get_compartment_name(compartment_id, conn_provider):
    if not conn_provider:
        return None
    try:
        conn = conn_provider()
        row = conn.execute("SELECT name FROM pension_fund_compartments WHERE id=?", (compartment_id,)).fetchone()
        conn.close()
        if row:
            return row[0].strip().lower()
    except Exception:
        pass
    return None

# ── SCRAPER ADAPTERS (STRATEGY PATTERN) ───────────────────────────────────────

class BaseScraperAdapter:
    """Base class for all scraping strategies."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        raise NotImplementedError("Subclasses must implement scrape()")

class InvestingScraperAdapter(BaseScraperAdapter):
    """Adapter for Investing.com table parsing."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        tables = soup.find_all('table')
        target_table = None
        for table in tables:
            headers = [th.get_text(strip=True).lower() for th in table.find_all('th')]
            if len(headers) >= 2:
                is_date = headers[0] in ['data', 'date', 'datum', 'date.']
                is_price = headers[1] in ['ultimo', 'price', 'close', 'ultimo val.', 'valore', 'schluß']
                if is_date and is_price:
                    target_table = table
                    break
                    
        if not target_table:
            for table in tables:
                rows = table.find_all('tr')
                if len(rows) > 1:
                    first_tds = [td.get_text(strip=True) for td in rows[1].find_all('td')]
                    if len(first_tds) >= 2:
                        if parse_date_it(first_tds[0]):
                            target_table = table
                            break
                            
        if target_table:
            rows = target_table.find_all('tr')[1:]
            for r in rows:
                tds = r.find_all('td')
                if len(tds) >= 2:
                    d_raw = tds[0].get_text(strip=True)
                    p_raw = tds[1].get_text(strip=True)
                    d_parsed = parse_date_it(d_raw)
                    p_parsed = parse_price(p_raw)
                    if d_parsed and p_parsed > 0:
                        prices.append((d_parsed, p_parsed))
        return prices

class FonTeScraperAdapter(BaseScraperAdapter):
    """Adapter for Fondo Fon.Te. specific accordion toggle tables."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        headers = soup.find_all(class_='toggle-acf')
        for h in headers:
            year_text = h.get_text(strip=True)
            if year_text.isdigit() and len(year_text) == 4:
                year = int(year_text)
                content_div = h.find_next_sibling(class_='toggle-content-acf')
                if content_div:
                    rows = content_div.find_all(class_='toggle_element_row')
                    for r in rows:
                        spans = r.find_all('span')
                        if len(spans) >= 2:
                            month_name = spans[0].get_text(strip=True).lower()
                            price_raw = spans[1].get_text(strip=True)
                            
                            months_map = {
                                'gen': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'mag': 5, 'giu': 6, 
                                'lug': 7, 'ago': 8, 'set': 9, 'ott': 10, 'nov': 11, 'dic': 12,
                                'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 
                                'giugno': 6, 'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 
                                'novembre': 11, 'dicembre': 12
                            }
                            
                            month_val = None
                            for m_name, m_num in months_map.items():
                                if month_name.startswith(m_name):
                                    month_val = m_num
                                    break
                                    
                            p_val = parse_price(price_raw)
                            if month_val and p_val > 0:
                                try:
                                    last_day = calendar.monthrange(year, month_val)[1]
                                    date_str = f"{year}-{month_val:02d}-{last_day:02d}"
                                except Exception:
                                    date_str = f"{year}-{month_val:02d}-28"
                                prices.append((date_str, p_val))
        return prices

class FonchimScraperAdapter(BaseScraperAdapter):
    """Adapter for Fonchim JSON values endpoint."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        comp_name = get_compartment_name(compartment_id, conn_provider)
        if not comp_name:
            # Fallback keyword match from ID or URL if name query failed
            comp_name = "stabilità" if "stabil" in compartment_id.lower() else "garantito"
            
        try:
            # Fetch the JSON directly
            api_url = "https://www.fonchim.it/grafici/quota.json.php"
            res = requests.get(api_url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
            if res.ok:
                data = res.json()
                for item in data:
                    target_comp = item.get('comparto', '').lower()
                    # Fuzzy match the compartment name (e.g. stabilità, garantito)
                    if comp_name in target_comp or target_comp in comp_name:
                        for d_str, p_str in item.get('quote', {}).items():
                            p_val = parse_price(p_str)
                            d_parsed = parse_date_it(d_str)
                            if d_parsed and p_val > 0:
                                prices.append((d_parsed, p_val))
                        break
        except Exception:
            pass
        return prices

class FopenScraperAdapter(BaseScraperAdapter):
    """Adapter for Fopen values (valori-quota pages)."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        comp_name = get_compartment_name(compartment_id, conn_provider)
        if not comp_name:
            comp_name = "azionario"
            
        # Discover year links on the page (e.g. valori-quota-2026, valori-quota-2025)
        year_links = []
        for a in soup.find_all('a'):
            href = a.get('href', '')
            if 'valori-quota-20' in href:
                full_url = urllib.parse.urljoin(url, href)
                year_links.append(full_url)
                
        if not year_links:
            year_links = [url]
        else:
            year_links.append(url)
            
        year_links = list(set(year_links))
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        }
        
        for y_link in year_links:
            try:
                r_page = requests.get(y_link, headers=headers, timeout=10)
                if not r_page.ok:
                    continue
                y_soup = BeautifulSoup(r_page.text, 'html.parser')
                table = y_soup.find('table')
                if not table:
                    continue
                    
                rows = table.find_all('tr')
                if len(rows) < 3:
                    continue
                    
                # Match the column index from the first row
                col_headers = [td.get_text(strip=True).lower() for td in rows[0].find_all(['td', 'th'])]
                target_col = None
                
                # Keywords map for matching Fopen headers
                # Headers: ['CompartoObbligazionarioGarantito', 'CompartoBilanciatoObbligazionario', 'CompartoBilanciato Azionario']
                # Compartment names: 'obbligazionario garantito', 'bilanciato obbligazionario', 'bilanciato azionario'
                for idx, h_text in enumerate(col_headers):
                    h_clean = h_text.replace('comparto', '')
                    if "obbligazionario" in comp_name and "garantito" in comp_name:
                        # Must match the column that contains BOTH keywords
                        if "obbligazionario" in h_clean and "garantito" in h_clean:
                            target_col = idx
                            break
                    elif "garantito" in comp_name:
                        if "garantito" in h_clean:
                            target_col = idx
                            break
                    elif "obbligazionario" in comp_name:
                        if "obbligazionario" in h_clean and "garantito" not in h_clean:
                            target_col = idx
                            break
                    elif "azionario" in comp_name:
                        if "azionario" in h_clean:
                            target_col = idx
                            break
                        
                if target_col is None:
                    # Fallback to column index mapping
                    if "garantito" in comp_name: target_col = 1
                    elif "obbligazionario" in comp_name: target_col = 2
                    else: target_col = 3
                    
                # Map column header index to actual td values index
                # Table values row structure: ['31-12-2025', '14,147', '', '23,268', '', '28,416', '']
                # Col 1 is header 1 -> td index 1
                # Col 2 is header 2 -> td index 3
                # Col 3 is header 3 -> td index 5
                val_index = 1 + (target_col - 1) * 2
                
                for row in rows[3:]:
                    tds = [td.get_text(strip=True) for td in row.find_all('td')]
                    if len(tds) > val_index:
                        d_str = tds[0]
                        p_str = tds[val_index]
                        d_parsed = parse_date_it(d_str)
                        p_val = parse_price(p_str)
                        if d_parsed and p_val > 0:
                            prices.append((d_parsed, p_val))
            except Exception:
                pass
                
        return prices

class MefopJsonScraperAdapter(BaseScraperAdapter):
    """Adapter for MEFOP JSON tables (e.g. Espero, and others)."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        try:
            data = json.loads(html_text)
            if isinstance(data, list) and len(data) > 0:
                first = data[0]
                if isinstance(first, dict) and 'data' in first and 'valore' in first:
                    for item in data:
                        d_raw = item.get('data', '')
                        p_raw = item.get('valore', '')
                        d_parsed = parse_date_it(d_raw)
                        p_parsed = parse_price(str(p_raw))
                        if d_parsed and p_parsed > 0:
                            prices.append((d_parsed, p_parsed))
        except Exception:
            pass
        return prices

class FondosanitaScraperAdapter(BaseScraperAdapter):
    """Adapter for Fondosanità multi-compartment yearly tables."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        comp_name = get_compartment_name(compartment_id, conn_provider)
        if not comp_name:
            comp_name = "scudo"
            
        tables = soup.find_all('table')
        # Tables 2-28 contain yearly data (year = 2000 + (table_index - 2))
        # Headers: ['', 'SCUDO', 'PROGRESSIONE', 'ESPANSIONE']
        # Data rows: ['31/01', '10.596', '10.291', '9.887']
        for idx in range(2, len(tables)):
            table = tables[idx]
            rows = table.find_all('tr')
            if len(rows) < 2:
                continue
            # Check if this is a compartment data table
            headers = [td.get_text(strip=True).lower() for td in rows[0].find_all(['td', 'th'])]
            if len(headers) < 3:
                continue
            if 'scudo' not in ' '.join(headers) and 'progressione' not in ' '.join(headers):
                continue
                
            year = 2000 + (idx - 2)
            
            # Find the target column
            target_col = None
            for h_idx, h_text in enumerate(headers):
                if comp_name in h_text:
                    target_col = h_idx
                    break
            if target_col is None:
                continue
                
            for row in rows[1:]:
                tds = [td.get_text(strip=True) for td in row.find_all('td')]
                if len(tds) > target_col:
                    d_raw = tds[0]
                    p_raw = tds[target_col]
                    # Date is DD/MM without year - add the year
                    d_match = re.match(r'(\d{1,2})/(\d{1,2})', d_raw)
                    if d_match:
                        day = int(d_match.group(1))
                        month = int(d_match.group(2))
                        date_str = f"{year}-{month:02d}-{day:02d}"
                    else:
                        date_str = parse_date_it(d_raw)
                    p_val = parse_price(p_raw)
                    if date_str and p_val > 0:
                        prices.append((date_str, p_val))
        return prices

class CometaScraperAdapter(BaseScraperAdapter):
    """Adapter for Cometa table parsing (DATA, QUOTA, ANDP columns)."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        tables = soup.find_all('table')
        # Look for the main quota table (headers: DATA, QUOTA, ANDP)
        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 10:
                continue
            headers = [th.get_text(strip=True).lower() for th in rows[0].find_all(['th', 'td'])]
            if 'data' not in headers or 'quota' not in headers:
                continue
            date_col = headers.index('data')
            quota_col = headers.index('quota')
            for row in rows[1:]:
                tds = [td.get_text(strip=True) for td in row.find_all(['td', 'th'])]
                if len(tds) > max(date_col, quota_col):
                    d_parsed = parse_date_it(tds[date_col])
                    p_val = parse_price(tds[quota_col])
                    if d_parsed and p_val > 0:
                        prices.append((d_parsed, p_val))
            if prices:
                break
        return prices

class MultiTableYearlyScraperAdapter(BaseScraperAdapter):
    """Adapter for pages with multiple 'Data/Valore' tables, one per year (e.g. Previmoda)."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:
                continue
            headers = [th.get_text(strip=True).lower() for th in rows[0].find_all(['th', 'td'])]
            if len(headers) >= 2 and ('data' in headers[0] or 'date' in headers[0]) and ('valor' in headers[1] or 'quot' in headers[1]):
                for row in rows[1:]:
                    tds = [td.get_text(strip=True) for td in row.find_all(['td', 'th'])]
                    if len(tds) >= 2:
                        d_parsed = parse_date_it(tds[0])
                        p_val = parse_price(tds[1])
                        if d_parsed and p_val > 0:
                            prices.append((d_parsed, p_val))
        return prices

class GenericTableScraperAdapter(BaseScraperAdapter):
    """Adapter for generic HTML table structures mapping Date/Price."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            if len(rows) > 1:
                candidate_prices = []
                for r in rows:
                    tds = r.find_all('td')
                    if len(tds) >= 2:
                        d_raw = tds[0].get_text(strip=True)
                        p_raw = tds[1].get_text(strip=True)
                        d_parsed = parse_date_it(d_raw)
                        p_parsed = parse_price(p_raw)
                        if d_parsed and p_parsed > 0:
                            candidate_prices.append((d_parsed, p_parsed))
                if candidate_prices:
                    prices = candidate_prices
                    break
        return prices

class HighchartsScraperAdapter(BaseScraperAdapter):
    """Adapter for Highcharts and JSON datasets embedded in inline scripts."""
    def scrape(self, html_text, soup, url="", compartment_id="", conn_provider=None):
        prices = []
        # Pattern 1: Date.UTC(2025, 0, 15), 12.34
        utc_pattern = re.findall(r'Date\.UTC\((\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\)\s*,\s*([\d\.]+)', html_text)
        for year, month, day, price in utc_pattern:
            date_str = f"{year}-{int(month)+1:02d}-{int(day):02d}"
            p_val = parse_price(price)
            if p_val > 0:
                prices.append((date_str, p_val))
                
        # Pattern 2: [1736928000000, 12.34] (ms) or [1736928000, 12.34] (sec)
        ts_pattern = re.findall(r'\[\s*(\d{10,13})\s*,\s*([\d\.]+)\s*\]', html_text)
        for ts_str, price in ts_pattern:
            ts = int(ts_str)
            if len(ts_str) == 13:
                ts = ts / 1000
            try:
                date_str = datetime.datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
                p_val = parse_price(price)
                if p_val > 0:
                    prices.append((date_str, p_val))
            except Exception:
                pass
                
        return prices

# ── SCRAPER REGISTRY & ORCHESTRATION ──────────────────────────────────────────

class ScraperRegistry:
    def __init__(self):
        # Specific site-to-adapter registrations
        self.rules = [
            (r'investing\.com', InvestingScraperAdapter()),
            (r'fondofonte\.it', FonTeScraperAdapter()),
            (r'fonchim\.it', FonchimScraperAdapter()),
            (r'fondofopen\.it', FopenScraperAdapter()),
            (r'fondosanita\.it', FondosanitaScraperAdapter()),
            (r'cometafondo\.it', CometaScraperAdapter()),
            (r'tabella\.php', MefopJsonScraperAdapter()),
        ]
        # Generic pipeline to try if no match is found, or as fallbacks
        self.fallback_pipeline = [
            MultiTableYearlyScraperAdapter(),
            GenericTableScraperAdapter(),
            HighchartsScraperAdapter(),
            MefopJsonScraperAdapter(),
        ]
        
    def get_prices(self, url, html_text, soup, compartment_id="", conn_provider=None):
        # 1. Try matched adapters first
        for pattern, adapter in self.rules:
            if re.search(pattern, url, re.IGNORECASE):
                prices = adapter.scrape(html_text, soup, url, compartment_id, conn_provider)
                if prices:
                    return prices
                    
        # 2. Try the fallback pipeline in sequence
        for adapter in self.fallback_pipeline:
            prices = adapter.scrape(html_text, soup, url, compartment_id, conn_provider)
            if prices:
                return prices
                
        return []

# ── EXPOSED BACKWARD COMPATIBLE API ───────────────────────────────────────────

def scrape_pension_fund_prices(compartment_id, link, conn_provider):
    if not link or not link.strip():
        return 0
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    
    try:
        res = requests.get(link.strip(), headers=headers, timeout=15)
        if not res.ok:
            return 0
            
        soup = BeautifulSoup(res.text, 'html.parser')
        registry = ScraperRegistry()
        prices = registry.get_prices(link.strip(), res.text, soup, compartment_id, conn_provider)
        
        if prices:
            conn = conn_provider()
            inserted = 0
            for d, p in prices:
                conn.execute("""
                    INSERT OR REPLACE INTO pension_fund_prices (compartment_id, date, price)
                    VALUES (?, ?, ?)
                """, (compartment_id, d, p))
                inserted += 1
            conn.commit()
            conn.close()
            return inserted
            
    except Exception as e:
        print(f"Exception scraping {link} for compartment {compartment_id}: {e}")
        
    return 0


# ── VEHICLE RECALL CHECKERS ───────────────────────────────────────────────────

def check_vin_recall(brand, vin):
    """
    Checks for open vehicle safety recalls based on brand and VIN (chassis number).
    Currently supports:
      - Škoda / VAG vehicles with TMB/WV/etc. chassis or brand 'skoda' / 'škoda'
    """
    b = (brand or "").strip().lower()
    v = (vin or "").strip().upper()
    
    if not v:
        return {
            "status": "no_vin",
            "has_recall": False,
            "details": "Nessun numero di telaio (VIN) specificato per il veicolo."
        }
        
    # Škoda check
    if "skoda" in b or "škoda" in b or v.startswith("TMB"):
        url = "https://recall.skoda-auto.com/it-it/Client/CheckVIN"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "text/html, */*; q=0.01"
        }
        try:
            resp = requests.post(url, data={"VINToCheck": v}, headers=headers, timeout=12)
            if not resp.ok:
                return {
                    "status": "error",
                    "has_recall": False,
                    "details": f"Risposta del server non valida (HTTP {resp.status_code})"
                }
                
            text = resp.text
            soup = BeautifulSoup(text, "html.parser")
            msg = clean_html(soup.get_text(separator=" ", strip=True))
            
            if "vcr_VinFound" in text:
                return {
                    "status": "found",
                    "has_recall": True,
                    "details": msg or "Campagna di richiamo attiva rilevata per questo telaio."
                }
            elif "vcr_VinNotFound" in text:
                return {
                    "status": "not_found",
                    "has_recall": False,
                    "details": msg or "Il veicolo non risulta interessato da campagne di richiamo aperte."
                }
            elif "vcr_VinNotValid" in text:
                return {
                    "status": "invalid_vin",
                    "has_recall": False,
                    "details": msg or "Numero di telaio non valido o non riconosciuto dal portale."
                }
            elif "vcr_ServiceUnavailable" in text:
                return {
                    "status": "error",
                    "has_recall": False,
                    "details": "Il servizio verifica richiami del costruttore è momentaneamente non disponibile."
                }
            else:
                return {
                    "status": "unknown",
                    "has_recall": False,
                    "details": msg or text[:250]
                }
        except requests.exceptions.Timeout:
            return {
                "status": "error",
                "has_recall": False,
                "details": "Timeout durante la connessione al portale di verifica richiami."
            }
        except Exception as e:
            return {
                "status": "error",
                "has_recall": False,
                "details": f"Errore durante la verifica: {str(e)}"
            }
            
    return {
        "status": "unsupported",
        "has_recall": False,
        "details": f"Verifica automatica richiami online non ancora disponibile per la marca {brand or 'specificata'}."
    }

