import os
import re
import uuid
import time
import logging
import hashlib
import threading
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()


logger = logging.getLogger("drivvo_sync")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] [DRIVVO] %(levelname)s: %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

BASE_URL = "https://api.drivvo.com"

def clean_plate(plate: str) -> str:
    """Rimuove spazi, trattini, punti e converte in maiuscolo."""
    if not plate:
        return ""
    return re.sub(r"[\s\-_.:/]", "", str(plate)).upper()

def format_datetime(date_str: str) -> str:
    """Formatta una data per Drivvo (YYYY-MM-DD HH:MM:SS)."""
    if not date_str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    date_str = str(date_str).strip()
    if len(date_str) == 10 and date_str.count("-") == 2:
        # Se è solo data YYYY-MM-DD, aggiungiamo ora attuale
        now_time = datetime.now().strftime("%H:%M:%S")
        return f"{date_str} {now_time}"
    
    if "T" in date_str:
        # Formato ISO
        date_str = date_str.replace("T", " ").split(".")[0]
        
    return date_str


class DrivvoSyncService:
    def __init__(self):
        self._lock = threading.Lock()
        self._token = None
        self._token_expiry = 0
        self._vehicles_cache = []
        self._vehicles_cache_time = 0
        self._fuels_cache = []
        self._expense_types_cache = []
        self._service_types_cache = []
        self._income_types_cache = []
        
    @property
    def email(self) -> str:
        return os.environ.get("DRIVVO_EMAIL", "").strip()
        
    @property
    def password(self) -> str:
        return os.environ.get("DRIVVO_PASSWORD", "").strip()
        
    def is_configured(self) -> bool:
        enabled = os.environ.get("DRIVVO_ENABLED", "true").lower() in ("true", "1", "yes")
        return enabled and bool(self.email) and bool(self.password)

    def _get_base_headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "App-Version": "4",
            "App-Platform": "Web",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Origin": "https://web.drivvo.com",
            "Referer": "https://web.drivvo.com/"
        }

    def login(self, force_refresh: bool = False) -> str:
        if not self.is_configured():
            return None
            
        with self._lock:
            now = time.time()
            if not force_refresh and self._token and now < self._token_expiry:
                return self._token

            try:
                password_md5 = hashlib.md5(self.password.encode("utf-8")).hexdigest()
                url = f"{BASE_URL}/autenticacao/login"
                payload = {
                    "email": self.email,
                    "senha": password_md5,
                    "idioma": "it"
                }
                
                resp = requests.post(url, json=payload, headers=self._get_base_headers(), timeout=15)
                resp.raise_for_status()
                data = resp.json()
                
                self._token = data.get("token")
                # Token scade normalmente dopo diverse ore; impostiamo 25 minuti di cache sicura
                self._token_expiry = now + (25 * 60)
                logger.info("Login a Drivvo eseguito con successo.")
                return self._token
            except Exception as e:
                logger.error(f"Errore durante il login a Drivvo: {e}")
                return None

    def _auth_headers(self) -> dict:
        token = self.login()
        if not token:
            return None
        headers = self._get_base_headers()
        headers["X-Token"] = token
        return headers

    def get_vehicles(self, force_refresh: bool = False) -> list:
        now = time.time()
        if not force_refresh and self._vehicles_cache and (now - self._vehicles_cache_time < 300):
            return self._vehicles_cache
            
        headers = self._auth_headers()
        if not headers:
            return []
            
        try:
            resp = requests.get(f"{BASE_URL}/veiculo/web", headers=headers, timeout=15)
            if resp.status_code == 401:
                # Token scaduto, riprova con login forzato
                self.login(force_refresh=True)
                headers = self._auth_headers()
                resp = requests.get(f"{BASE_URL}/veiculo/web", headers=headers, timeout=15)
                
            resp.raise_for_status()
            self._vehicles_cache = resp.json()
            self._vehicles_cache_time = now
            return self._vehicles_cache
        except Exception as e:
            logger.error(f"Errore nel recupero veicoli da Drivvo: {e}")
            return self._vehicles_cache or []

    def find_vehicle(self, plate: str = None, brand: str = None, model: str = None) -> dict:
        """Cerca il veicolo Drivvo corrispondente, prioritariamente tramite targa, con fallback su marca/modello."""
        vehicles = self.get_vehicles()
        if not vehicles:
            vehicles = self.get_vehicles(force_refresh=True)
            
        clean_target_plate = clean_plate(plate)
        
        # 1. Ricerca prioritaria per targa
        if clean_target_plate:
            for v in vehicles:
                v_plate = clean_plate(v.get("placa"))
                if v_plate and v_plate == clean_target_plate:
                    return v

        # 2. Fallback su Marca e Modello
        search_terms = []
        if brand:
            search_terms.extend(brand.strip().lower().split())
        if model:
            search_terms.extend(model.strip().lower().split())
            
        if search_terms:
            for v in vehicles:
                v_name = (v.get("nome") or "").lower()
                v_brand = (v.get("marca") or "").lower()
                v_model = (v.get("modelo") or "").lower()
                full_v_str = f"{v_brand} {v_model} {v_name}"
                if all(term in full_v_str for term in search_terms):
                    return v

        return None

    def get_fuels(self, force_refresh: bool = False) -> list:
        if not force_refresh and self._fuels_cache:
            return self._fuels_cache
            
        headers = self._auth_headers()
        if not headers:
            return []
            
        try:
            resp = requests.get(f"{BASE_URL}/combustivel", headers=headers, timeout=15)
            resp.raise_for_status()
            self._fuels_cache = resp.json()
            return self._fuels_cache
        except Exception as e:
            logger.error(f"Errore nel recupero tipi carburante da Drivvo: {e}")
            return self._fuels_cache or []

    def find_fuel(self, fuel_name: str, vehicle_drivvo: dict = None) -> dict:
        fuels = self.get_fuels()
        if not fuels:
            fuels = self.get_fuels(force_refresh=True)
            
        if not fuel_name:
            if vehicle_drivvo:
                # Usa il carburante principale del veicolo
                veh_fuel_id = vehicle_drivvo.get("id_tipo_combustivel")
                for f in fuels:
                    if f.get("id_tipo_combustivel") == veh_fuel_id:
                        return f
            return fuels[0] if fuels else None

        f_lower = fuel_name.strip().lower()
        
        # Mappatura sinonimi comuni
        synonyms = {
            "metano": "metano",
            "cng": "metano",
            "benzina": "benzina",
            "petrol": "benzina",
            "gasoline": "benzina",
            "diesel": "diesel",
            "gasolio": "diesel",
            "gpl": "gpl",
            "lpg": "gpl",
            "elettrico": "elettric",
            "elettrica": "elettric",
            "electric": "elettric"
        }
        
        target_keyword = None
        for k, v in synonyms.items():
            if k in f_lower:
                target_keyword = v
                break
                
        for f in fuels:
            f_nome = (f.get("nome") or "").lower()
            if target_keyword and target_keyword in f_nome:
                return f
            if f_lower in f_nome or f_nome in f_lower:
                return f
                
        return fuels[0] if fuels else None

    def get_expense_types(self, force_refresh: bool = False) -> list:
        if not force_refresh and self._expense_types_cache:
            return self._expense_types_cache
        headers = self._auth_headers()
        if not headers:
            return []
        try:
            resp = requests.get(f"{BASE_URL}/tipoDespesa", headers=headers, timeout=15)
            resp.raise_for_status()
            self._expense_types_cache = resp.json()
            return self._expense_types_cache
        except Exception as e:
            logger.error(f"Errore recupero tipi spesa da Drivvo: {e}")
            return self._expense_types_cache or []

    def find_or_create_expense_type(self, name: str) -> int:
        if not name:
            name = "Altro"
        types = self.get_expense_types()
        name_clean = name.strip()
        name_lower = name_clean.lower()
        
        for t in types:
            if t.get("nome", "").strip().lower() == name_lower:
                return t.get("id_tipo_despesa")
                
        # Crea nuovo tipo spesa su Drivvo
        headers = self._auth_headers()
        if headers:
            try:
                payload = {"nome": name_clean, "id_unico": str(uuid.uuid4())}
                resp = requests.post(f"{BASE_URL}/tipoDespesa", json=payload, headers=headers, timeout=15)
                resp.raise_for_status()
                data = resp.json()
                new_id = data.get("id_tipo_despesa") or data.get("id")
                self.get_expense_types(force_refresh=True)
                return new_id
            except Exception as e:
                logger.warning(f"Impossibile creare tipo spesa '{name_clean}' su Drivvo: {e}")
                
        return types[0]["id_tipo_despesa"] if types else None

    def get_service_types(self, force_refresh: bool = False) -> list:
        if not force_refresh and self._service_types_cache:
            return self._service_types_cache
        headers = self._auth_headers()
        if not headers:
            return []
        try:
            resp = requests.get(f"{BASE_URL}/tipoServico", headers=headers, timeout=15)
            resp.raise_for_status()
            self._service_types_cache = resp.json()
            return self._service_types_cache
        except Exception as e:
            logger.error(f"Errore recupero tipi servizio da Drivvo: {e}")
            return self._service_types_cache or []

    def find_or_create_service_type(self, name: str) -> int:
        if not name:
            name = "Costo manutenzione"
        types = self.get_service_types()
        name_clean = name.strip()
        name_lower = name_clean.lower()
        
        for t in types:
            t_nome = t.get("nome", "").strip().lower()
            if t_nome == name_lower:
                return t.get("id_tipo_servico")
            # Tolleranza su corrispondenze parziali
            if name_lower in t_nome or t_nome in name_lower:
                return t.get("id_tipo_servico")
                
        # Crea nuovo tipo servizio
        headers = self._auth_headers()
        if headers:
            try:
                payload = {"nome": name_clean, "id_unico": str(uuid.uuid4())}
                resp = requests.post(f"{BASE_URL}/tipoServico", json=payload, headers=headers, timeout=15)
                resp.raise_for_status()
                data = resp.json()
                new_id = data.get("id_tipo_servico") or data.get("id")
                self.get_service_types(force_refresh=True)
                return new_id
            except Exception as e:
                logger.warning(f"Impossibile creare tipo servizio '{name_clean}' su Drivvo: {e}")
                
        return types[0]["id_tipo_servico"] if types else None

    def get_income_types(self, force_refresh: bool = False) -> list:
        if not force_refresh and self._income_types_cache:
            return self._income_types_cache
        headers = self._auth_headers()
        if not headers:
            return []
        try:
            resp = requests.get(f"{BASE_URL}/tipoReceita", headers=headers, timeout=15)
            resp.raise_for_status()
            self._income_types_cache = resp.json()
            return self._income_types_cache
        except Exception as e:
            logger.error(f"Errore recupero tipi entrata da Drivvo: {e}")
            return self._income_types_cache or []

    def find_or_create_income_type(self, name: str) -> int:
        if not name:
            name = "Rimborso"
        types = self.get_income_types()
        name_clean = name.strip()
        name_lower = name_clean.lower()
        
        for t in types:
            if t.get("nome", "").strip().lower() == name_lower:
                return t.get("id_tipo_receita")
                
        headers = self._auth_headers()
        if headers:
            try:
                payload = {"nome": name_clean, "id_unico": str(uuid.uuid4())}
                resp = requests.post(f"{BASE_URL}/tipoReceita", json=payload, headers=headers, timeout=15)
                resp.raise_for_status()
                data = resp.json()
                new_id = data.get("id_tipo_receita") or data.get("id")
                self.get_income_types(force_refresh=True)
                return new_id
            except Exception as e:
                logger.warning(f"Impossibile creare tipo entrata '{name_clean}' su Drivvo: {e}")
                
        return types[0]["id_tipo_receita"] if types else None

    def sync_refuel(self, entry: dict, vehicle_drivvo: dict) -> dict:
        headers = self._auth_headers()
        if not headers:
            return None
            
        fuel_obj = self.find_fuel(entry.get("fuelType"), vehicle_drivvo)
        fuel_id = fuel_obj.get("id_combustivel") if fuel_obj else None
        
        price = float(entry.get("priceUnit") or 0.0)
        total_cost = float(entry.get("totalCost") or 0.0)
        liters = float(entry.get("liters") or 0.0)
        if liters == 0.0 and price > 0:
            liters = round(total_cost / price, 3)
            
        is_full = bool(entry.get("isFull", 1))
        missed = bool(entry.get("missedPrevious", 0))
        odometer = int(float(entry.get("odometer") or 0))
        
        payload = {
            "id_unico": str(uuid.uuid4()),
            "id_veiculo": vehicle_drivvo["id_veiculo"],
            "odometro": odometer,
            "data": format_datetime(entry.get("date")),
            "id_combustivel": fuel_id,
            "preco": price,
            "valor_total": total_cost,
            "volume": liters,
            "sem_custo": False,
            "tanque_cheio": is_full,
            "esqueceu_anterior": missed,
            "id_posto_combustivel": None,
            "observacao": entry.get("notes") or "Inserito tramite CoTrack"
        }
        
        # Gestione ricarica elettrica se presente
        if entry.get("batteryStart") is not None:
            payload["bateria_inicial_pct"] = int(entry.get("batteryStart") or 0)
        if entry.get("batteryEnd") is not None:
            payload["bateria_final_pct"] = int(entry.get("batteryEnd") or 0)

        resp = requests.post(f"{BASE_URL}/abastecimento", json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        logger.info(f"Rifornimento sincronizzato su Drivvo per veicolo {vehicle_drivvo.get('nome')}: ID {resp.json().get('id_abastecimento')}")
        return resp.json()

    def sync_expense(self, entry: dict, vehicle_drivvo: dict) -> dict:
        headers = self._auth_headers()
        if not headers:
            return None
            
        category_name = entry.get("category") or "Altro"
        exp_type_id = self.find_or_create_expense_type(category_name)
        cost = float(entry.get("cost") or entry.get("totalCost") or 0.0)
        odometer = int(float(entry.get("odometer") or 0)) if entry.get("odometer") is not None else None
        
        payload = {
            "id_unico": str(uuid.uuid4()),
            "id_veiculo": vehicle_drivvo["id_veiculo"],
            "odometro": odometer,
            "data": format_datetime(entry.get("date")),
            "observacao": entry.get("notes") or "",
            "id_local": None,
            "id_tipo_motivo": None,
            "id_forma_pagamento": None,
            "id_motorista": None,
            "tipos_despesa": [
                {
                    "id_tipo_despesa": exp_type_id,
                    "valor": cost,
                    "id_unico": str(uuid.uuid4())
                }
            ]
        }
        
        resp = requests.post(f"{BASE_URL}/despesa", json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        logger.info(f"Spesa sincronizzata su Drivvo per veicolo {vehicle_drivvo.get('nome')}: ID {resp.json().get('id_despesa')}")
        return resp.json()

    def sync_service(self, entry: dict, vehicle_drivvo: dict) -> dict:
        headers = self._auth_headers()
        if not headers:
            return None
            
        odometer = int(float(entry.get("odometer") or 0)) if entry.get("odometer") is not None else None
        desc = entry.get("description") or ""
        total_cost = float(entry.get("cost") or entry.get("totalCost") or 0.0)
        
        items_list = []
        # In CoTrack description può essere un dizionario JSON con i dettagli {"Filtro Olio": 20, "Manodopera": 50}
        import json as _json
        try:
            parsed = _json.loads(desc)
            if isinstance(parsed, dict) and parsed:
                for item_name, item_cost in parsed.items():
                    tid = self.find_or_create_service_type(item_name)
                    items_list.append({
                        "id_tipo_servico": tid,
                        "valor": float(item_cost or 0.0),
                        "id_unico": str(uuid.uuid4())
                    })
        except Exception:
            pass
            
        if not items_list:
            tid = self.find_or_create_service_type(desc if desc else "Costo manutenzione")
            items_list.append({
                "id_tipo_servico": tid,
                "valor": total_cost,
                "id_unico": str(uuid.uuid4())
            })
            
        payload = {
            "id_unico": str(uuid.uuid4()),
            "id_veiculo": vehicle_drivvo["id_veiculo"],
            "odometro": odometer,
            "data": format_datetime(entry.get("date")),
            "observacao": entry.get("notes") or "",
            "id_local": None,
            "id_tipo_motivo": None,
            "id_forma_pagamento": None,
            "id_motorista": None,
            "tipos_servico": items_list
        }
        
        resp = requests.post(f"{BASE_URL}/servico", json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        logger.info(f"Manutenzione sincronizzata su Drivvo per veicolo {vehicle_drivvo.get('nome')}: ID {resp.json().get('id_servico')}")
        return resp.json()

    def sync_income(self, entry: dict, vehicle_drivvo: dict) -> dict:
        headers = self._auth_headers()
        if not headers:
            return None
            
        category_name = entry.get("category") or "Rimborso"
        inc_type_id = self.find_or_create_income_type(category_name)
        amount = float(entry.get("amount") or entry.get("totalCost") or 0.0)
        odometer = int(float(entry.get("odometer") or 0)) if entry.get("odometer") is not None else None
        
        payload = {
            "id_unico": str(uuid.uuid4()),
            "id_veiculo": vehicle_drivvo["id_veiculo"],
            "valor": amount,
            "id_tipo_receita": inc_type_id,
            "odometro": odometer,
            "data": format_datetime(entry.get("date")),
            "observacao": entry.get("notes") or "",
            "id_motorista": None
        }
        
        resp = requests.post(f"{BASE_URL}/receita", json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        logger.info(f"Entrata sincronizzata su Drivvo per veicolo {vehicle_drivvo.get('nome')}: ID {resp.json().get('id_receita')}")
        return resp.json()

    def sync_reminder(self, entry: dict, vehicle_drivvo: dict) -> dict:
        headers = self._auth_headers()
        if not headers:
            return None
            
        desc = entry.get("description") or "Promemoria"
        svc_type_id = self.find_or_create_service_type(desc)
        
        is_recurring = bool(entry.get("isRecurring", 0))
        target_odo = int(float(entry.get("targetOdometer") or 0)) if entry.get("targetOdometer") else 0
        target_date = entry.get("targetDate") or entry.get("date")
        
        # In Drivvo: unico_repetir (True=Singolo, False=Ricorrente)
        # periodo: 1=giorni, 2=mesi, 3=anni
        unit_map = {"days": 1, "months": 2, "years": 3}
        recurrence_unit_code = unit_map.get(entry.get("recurrenceUnit"), 2)
        recurrence_val = int(entry.get("recurrenceVal") or 0)
        recurrence_km = int(float(entry.get("recurrenceKm") or 0))
        
        payload = {
            "id_unico": str(uuid.uuid4()),
            "id_veiculo": vehicle_drivvo["id_veiculo"],
            "id_tipo_servico": svc_type_id,
            "id_tipo_despesa": None,
            "unico_repetir": not is_recurring,
            "odometro": target_odo if not is_recurring else 0,
            "data": format_datetime(target_date) if target_date else None,
            "repetir_tempo": recurrence_val if is_recurring else 0,
            "periodo": recurrence_unit_code if is_recurring else 0,
            "repetir_distancia": recurrence_km if is_recurring else 0,
            "observacao": entry.get("notes") or ""
        }
        
        resp = requests.post(f"{BASE_URL}/lembrete", json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        logger.info(f"Promemoria sincronizzato su Drivvo per veicolo {vehicle_drivvo.get('nome')}: ID {resp.json().get('id_lembrete')}")
        return resp.json()

    def sync_activity(self, entry: dict, vehicle_plate: str = None, vehicle_brand: str = None, vehicle_model: str = None, plate: str = None, brand: str = None, model: str = None) -> dict:
        """Sincronizza una qualsiasi attività CoTrack verso Drivvo."""
        if not self.is_configured():
            return None
            
        p = vehicle_plate or plate
        b = vehicle_brand or brand
        m = vehicle_model or model
            
        vehicle_drivvo = self.find_vehicle(plate=p, brand=b, model=m)
        if not vehicle_drivvo:
            logger.warning(f"Veicolo non trovato su Drivvo per targa '{p}' o {b} {m}. Sincronizzazione saltata.")
            return None
            
        act_type = entry.get("type", "").lower()
        if act_type == "refuel":
            return self.sync_refuel(entry, vehicle_drivvo)
        elif act_type == "expense":
            return self.sync_expense(entry, vehicle_drivvo)
        elif act_type == "service":
            return self.sync_service(entry, vehicle_drivvo)
        elif act_type == "income":
            return self.sync_income(entry, vehicle_drivvo)
        elif act_type == "reminder":
            return self.sync_reminder(entry, vehicle_drivvo)
        else:
            logger.warning(f"Tipo attività '{act_type}' non gestito per la sincronizzazione Drivvo.")
            return None

    def sync_activity_async(self, entry: dict, vehicle_plate: str = None, vehicle_brand: str = None, vehicle_model: str = None, plate: str = None, brand: str = None, model: str = None):
        """Esegue la sincronizzazione in un thread separato in background."""
        if not self.is_configured():
            return

        p = vehicle_plate or plate
        b = vehicle_brand or brand
        m = vehicle_model or model

        def _worker():
            try:
                self.sync_activity(entry, vehicle_plate=p, vehicle_brand=b, vehicle_model=m)
            except Exception as e:
                logger.error(f"Eccezione durante la sincronizzazione asincrona verso Drivvo: {e}", exc_info=True)

        t = threading.Thread(target=_worker, daemon=True)
        t.start()


drivvo_service = DrivvoSyncService()
