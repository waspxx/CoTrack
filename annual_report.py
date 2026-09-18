# -*- coding: utf-8 -*-
"""
CoTrack - Modulo Resoconto Finanziario Annuale
Genera un riepilogo annuale completo basato su valori numerici calcolati da tutte le tabelle,
senza l'uso di AI, formattato in una email HTML chiara e comprensibile anche per non esperti.
"""

import os
import re
import sqlite3
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

def calculate_amortization_schedule(principal, annual_rate, term_months, start_date_str, custom_monthly_payment=None, payments=None, additional_charges=0.0, payment_day='last', strategy='term'):
    """Calcola il piano di ammortamento di un prestito/mutuo compatibile con app.py e prestiti.js."""
    if payments is None:
        payments = []

    def get_payment_date(date_str, t, p_day):
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            try:
                dt = datetime.strptime(date_str.split(' ')[0], '%Y-%m-%d')
            except Exception:
                return date_str
        month = dt.month - 1 + t
        year = dt.year + month // 12
        month = month % 12 + 1
        max_day = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
        if p_day == 'last' or p_day == 'Ultimo del mese':
            day = max_day
        elif p_day and str(p_day).isdigit():
            day = min(int(p_day), max_day)
        else:
            day = min(dt.day, max_day)
        return f"{year:04d}-{month:02d}-{day:02d}"

    def get_month_diff(d1_str, d2_str):
        try:
            d1 = datetime.strptime(d1_str.split(' ')[0], '%Y-%m-%d')
            d2 = datetime.strptime(d2_str.split(' ')[0], '%Y-%m-%d')
            return (d2.year - d1.year) * 12 + d2.month - d1.month
        except Exception:
            return 0

    extra_payments = [p for p in payments if p.get('type') in ('extra', 'Rimborso', 'Rimborso Straordinario')]
    rate_changes = sorted([p for p in payments if p.get('type') == 'rate_change'], key=lambda x: x.get('date') or '')

    current_annual_rate = annual_rate
    current_monthly_rate = (current_annual_rate / 12) / 100
    additional_charges_val = float(additional_charges or 0.0)

    if custom_monthly_payment and custom_monthly_payment > 0:
        base_installment = custom_monthly_payment
    else:
        if current_monthly_rate > 0:
            base_installment = principal * (current_monthly_rate * ((1 + current_monthly_rate) ** term_months)) / (((1 + current_monthly_rate) ** term_months) - 1)
        else:
            base_installment = principal / term_months

    schedule = []
    remaining_principal = principal
    t = 1

    extras_by_month = {}
    for p in extra_payments:
        m_index = get_month_diff(start_date_str, p.get('date') or '')
        if m_index > 0:
            extras_by_month[m_index] = extras_by_month.get(m_index, 0.0) + float(p.get('amount') or 0.0)

    while remaining_principal > 0.01 and t <= 1200:
        date = get_payment_date(start_date_str, t, payment_day)
        rate_changed = False
        for rc in rate_changes:
            if rc.get('date') and rc['date'] <= date and rc.get('amount') != current_annual_rate:
                current_annual_rate = rc['amount']
                rate_changed = True

        if rate_changed:
            current_monthly_rate = (current_annual_rate / 12) / 100
            remaining_term = term_months - (t - 1)
            if remaining_term > 0 and (not custom_monthly_payment or custom_monthly_payment <= 0):
                if current_monthly_rate > 0:
                    base_installment = remaining_principal * (current_monthly_rate * ((1 + current_monthly_rate) ** remaining_term)) / (((1 + current_monthly_rate) ** remaining_term) - 1)
                else:
                    base_installment = remaining_principal / remaining_term

        interest_portion = remaining_principal * current_monthly_rate
        installment = base_installment
        if remaining_principal + interest_portion < installment:
            installment = remaining_principal + interest_portion

        extra_amount = extras_by_month.get(t, 0.0)
        principal_portion = installment - interest_portion
        if principal_portion > remaining_principal:
            principal_portion = remaining_principal
            installment = principal_portion + interest_portion

        principal_paid_total = principal_portion + extra_amount
        if principal_paid_total > remaining_principal:
            principal_paid_total = remaining_principal

        remaining_principal -= principal_paid_total
        if remaining_principal < 0:
            remaining_principal = 0.0

        schedule.append({
            'date': date,
            'remaining': remaining_principal,
            'principal': principal_portion,
            'interest': interest_portion,
            'installment': installment + additional_charges_val,
            'extra': extra_amount
        })

        if strategy == 'payment' and extra_amount > 0 and remaining_principal > 0.01:
            remaining_term = term_months - t
            if remaining_term > 0:
                if current_monthly_rate > 0:
                    base_installment = remaining_principal * (current_monthly_rate * ((1 + current_monthly_rate) ** remaining_term)) / (((1 + current_monthly_rate) ** remaining_term) - 1)
                else:
                    base_installment = remaining_principal / remaining_term

        t += 1

    return schedule


def get_annual_report_data(conn, user_id, year, include_prev=True):
    """
    Raccoglie ed elabora tutti i dati numerici dalle varie tabelle del database per un dato anno.
    Se include_prev=True, calcola ricorsivamente anche i dati dell'anno precedente per il calcolo delle differenze (diff).
    """
    now = datetime.now()
    is_current_year = (year == now.year)
    months_count = now.month if is_current_year else 12
    if months_count <= 0:
        months_count = 12

    # Verifica tab attivi per l'utente
    tabs_keys = [
        'tab_investimenti_active', 'tab_wallet_active', 'tab_bollette_active',
        'tab_veicoli_active', 'tab_prestiti_active', 'tab_stipendi_active', 'tab_fondopensione_active'
    ]
    active_tabs = {}
    for key in tabs_keys:
        row = conn.execute("SELECT value FROM configurations WHERE key = ?", (f"user_config:{user_id}:{key}",)).fetchone()
        active_tabs[key] = (row['value'] == 'true') if row else True

    # Info utente
    user = conn.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
    username = user['username'] if user else ""
    row_email = conn.execute("SELECT value FROM configurations WHERE key = ?", (f"user_config:{user_id}:annual_report_email",)).fetchone()
    if row_email and row_email['value'] and '@' in row_email['value']:
        username = row_email['value'].strip()

    # -------------------------------------------------------------
    # 1. STIPENDI & REDDITI DA LAVORO
    # -------------------------------------------------------------
    salaries_data = {
        'total_net': 0.0,
        'total_gross': 0.0,
        'total_withholdings': 0.0,
        'tax_rate': 0.0,
        'slips_count': 0,
        'people': []
    }

    if active_tabs.get('tab_stipendi_active', True):
        sal_rows = conn.execute('''
            SELECT s.* FROM salaries s
            JOIN salary_groups sg ON s.salary_group_id = sg.id
            WHERE sg.user_id = ? AND s.month LIKE ?
            ORDER BY s.month ASC
        ''', (user_id, f"{year}-%")).fetchall()

        if sal_rows:
            people_names = sorted(list(set(r['person_name'] for r in sal_rows if r['person_name'])))
            for p_name in people_names:
                p_rows = [r for r in sal_rows if r['person_name'] == p_name]
                p_net = sum(r['net'] or 0.0 for r in p_rows)
                p_gross = sum(r['gross'] or 0.0 for r in p_rows)
                p_withholdings = p_gross - p_net
                p_tax_rate = (p_withholdings / p_gross * 100) if p_gross > 0 else 0.0
                p_avg_net = p_net / len(p_rows) if p_rows else 0.0
                p_rimborsi = sum(r['rimborso_spese'] or 0.0 for r in p_rows)
                p_premi_net = sum(r['premio_produzione_netto'] or 0.0 for r in p_rows)
                p_conguaglio = sum(r['conguaglio_fiscale'] or 0.0 for r in p_rows)
                p_tfr = sum(r['tfr_liquidato'] or 0.0 for r in p_rows)
                p_tredicesime = sum(1 for r in p_rows if r['tredicesima'] and r['tredicesima'] > 0)

                salaries_data['people'].append({
                    'name': p_name,
                    'slips_count': len(p_rows),
                    'net': p_net,
                    'gross': p_gross,
                    'withholdings': p_withholdings,
                    'tax_rate': p_tax_rate,
                    'avg_monthly_net': p_avg_net,
                    'extra_reimbursements': p_rimborsi,
                    'production_bonus_net': p_premi_net,
                    'tax_adjustment': p_conguaglio,
                    'tfr_paid': p_tfr,
                    'thirteenth_count': p_tredicesime
                })

            salaries_data['total_net'] = sum(p['net'] for p in salaries_data['people'])
            salaries_data['total_gross'] = sum(p['gross'] for p in salaries_data['people'])
            salaries_data['total_withholdings'] = salaries_data['total_gross'] - salaries_data['total_net']
            salaries_data['tax_rate'] = (salaries_data['total_withholdings'] / salaries_data['total_gross'] * 100) if salaries_data['total_gross'] > 0 else 0.0
            salaries_data['slips_count'] = len(sal_rows)

    # -------------------------------------------------------------
    # 2. WALLET (ENTRATE E SPESE QUOTIDIANE)
    # -------------------------------------------------------------
    wallet_data = {
        'total_income': 0.0,
        'total_expense': 0.0,
        'net_savings': 0.0,
        'savings_rate': 0.0,
        'monthly_expense_avg': 0.0,
        'tx_count': 0,
        'top_categories': [],
        'wallets': []
    }

    if active_tabs.get('tab_wallet_active', True):
        w_rows = conn.execute('''
            SELECT wt.*, w.name as wallet_name FROM wallet_transactions wt
            JOIN wallets w ON wt.wallet_id = w.id
            WHERE w.user_id = ? AND wt.date LIKE ?
            ORDER BY wt.date ASC
        ''', (user_id, f"{year}-%")).fetchall()

        cat_expenses = {}
        wallet_sums = {}

        for t in w_rows:
            t_type = (t['type'] or '').lower()
            t_cat = (t['category'] or 'Altro').strip()
            w_name = t['wallet_name'] or 'Principale'

            if w_name not in wallet_sums:
                wallet_sums[w_name] = {'income': 0.0, 'expense': 0.0}

            # Escludi i trasferimenti interni per non duplicare entrate/uscite
            if 'transfer' in t_type or 'trasf' in t_type or 'transfer' in t_cat.lower() or 'trasf' in t_cat.lower() or 'giroconto' in t_cat.lower():
                continue

            wallet_data['tx_count'] += 1
            amt = abs(t['amount'] or 0.0)

            is_exp = 'uscita' in t_type or 'spesa' in t_type or 'expense' in t_type or (t['amount'] or 0.0) < 0
            if is_exp:
                wallet_data['total_expense'] += amt
                wallet_sums[w_name]['expense'] += amt
                cat_expenses[t_cat] = cat_expenses.get(t_cat, 0.0) + amt
            else:
                wallet_data['total_income'] += amt
                wallet_sums[w_name]['income'] += amt

        wallet_data['net_savings'] = wallet_data['total_income'] - wallet_data['total_expense']
        if wallet_data['total_income'] > 0:
            wallet_data['savings_rate'] = (wallet_data['net_savings'] / wallet_data['total_income']) * 100
        wallet_data['monthly_expense_avg'] = wallet_data['total_expense'] / months_count

        # Salva dizionario completo per confronti
        wallet_data['cat_expenses'] = cat_expenses

        # Top categorie di spesa
        sorted_cats = sorted(cat_expenses.items(), key=lambda x: x[1], reverse=True)
        for cat, amt in sorted_cats[:6]:
            pct = (amt / wallet_data['total_expense'] * 100) if wallet_data['total_expense'] > 0 else 0.0
            wallet_data['top_categories'].append({
                'category': cat,
                'amount': amt,
                'pct': pct
            })

        for w_name, s in wallet_sums.items():
            wallet_data['wallets'].append({
                'name': w_name,
                'income': s['income'],
                'expense': s['expense'],
                'net': s['income'] - s['expense']
            })

    # -------------------------------------------------------------
    # 3. BOLLETTE, UTENZE & FOTOVOLTAICO
    # -------------------------------------------------------------
    bills_data = {
        'total_cost': 0.0,
        'electricity_cost': 0.0,
        'electricity_kwh': 0.0,
        'gas_cost': 0.0,
        'gas_smc': 0.0,
        'water_cost': 0.0,
        'water_m3': 0.0,
        'waste_cost': 0.0,
        'monthly_avg': 0.0,
        'solar_production_kwh': 0.0,
        'grid_feed_in_kwh': 0.0,
        'self_consumption_kwh': 0.0,
        'self_consumption_pct': 0.0,
        'self_sufficiency_pct': 0.0,
        'solar_incentives_total': 0.0,
        'solar_incentives': [],
        'net_energy_balance': 0.0,
        'appliances': []
    }

    if active_tabs.get('tab_bollette_active', True):
        b_rows = conn.execute('''
            SELECT b.* FROM bills b
            JOIN bills_profiles bp ON b.bills_id = bp.id
            WHERE bp.user_id = ? AND b.year = ?
            ORDER BY b.month ASC
        ''', (user_id, year)).fetchall()

        if b_rows:
            bills_data['electricity_cost'] = sum(r['electricity_price'] or 0.0 for r in b_rows)
            bills_data['electricity_kwh'] = sum(r['electricity_consumption'] or 0.0 for r in b_rows)
            bills_data['gas_cost'] = sum(r['gas_price'] or 0.0 for r in b_rows)
            bills_data['gas_smc'] = sum(r['gas_consumption'] or 0.0 for r in b_rows)
            bills_data['water_cost'] = sum(r['water_price'] or 0.0 for r in b_rows)
            bills_data['water_m3'] = sum(r['water_consumption'] or 0.0 for r in b_rows)
            bills_data['waste_cost'] = sum(r['waste_price'] or 0.0 for r in b_rows if 'waste_price' in r.keys())
            bills_data['solar_production_kwh'] = sum(r['solar_production'] or 0.0 for r in b_rows if 'solar_production' in r.keys())
            bills_data['grid_feed_in_kwh'] = sum(r['grid_feed_in'] or 0.0 for r in b_rows if 'grid_feed_in' in r.keys())

            bills_data['total_cost'] = (
                bills_data['electricity_cost'] +
                bills_data['gas_cost'] +
                bills_data['water_cost'] +
                bills_data['waste_cost']
            )
            bills_data['monthly_avg'] = bills_data['total_cost'] / len(b_rows)

            # Calcoli Solari
            self_cons = max(0.0, bills_data['solar_production_kwh'] - bills_data['grid_feed_in_kwh'])
            bills_data['self_consumption_kwh'] = self_cons
            if bills_data['solar_production_kwh'] > 0:
                bills_data['self_consumption_pct'] = (self_cons / bills_data['solar_production_kwh']) * 100
            tot_consumed_home = self_cons + bills_data['electricity_kwh']
            if tot_consumed_home > 0:
                bills_data['self_sufficiency_pct'] = (self_cons / tot_consumed_home) * 100

        # Incentivi GSE (Conto Energia / Scambio sul Posto)
        inc_rows = conn.execute('''
            SELECT si.type, SUM(si.amount) as tot_amt, COUNT(*) as cnt
            FROM bills_solar_incentives si
            JOIN bills_profiles bp ON si.bills_id = bp.id
            WHERE bp.user_id = ? AND si.payment_date LIKE ?
            GROUP BY si.type
        ''', (user_id, f"{year}-%")).fetchall()

        for inc in inc_rows:
            bills_data['solar_incentives'].append({
                'type': inc['type'],
                'amount': inc['tot_amt'] or 0.0,
                'count': inc['cnt']
            })
            bills_data['solar_incentives_total'] += (inc['tot_amt'] or 0.0)

        bills_data['net_energy_balance'] = bills_data['solar_incentives_total'] - bills_data['electricity_cost']

        # Elettrodomestici
        appl_rows = conn.execute('''
            SELECT a.name, SUM(c.consumption) as total_kwh
            FROM bills_appliance_consumptions c
            JOIN bills_appliances a ON c.appliance_id = a.id
            JOIN bills_profiles bp ON a.bills_id = bp.id
            WHERE bp.user_id = ? AND c.year = ?
            GROUP BY a.name
            ORDER BY total_kwh DESC
        ''', (user_id, year)).fetchall()

        for a in appl_rows:
            kwh = a['total_kwh'] or 0.0
            pct = (kwh / bills_data['electricity_kwh'] * 100) if bills_data['electricity_kwh'] > 0 else 0.0
            bills_data['appliances'].append({
                'name': a['name'],
                'kwh': kwh,
                'pct': pct
            })

    # -------------------------------------------------------------
    # 4. VEICOLI & TRASPORTI
    # -------------------------------------------------------------
    vehicles_data = {
        'total_cost': 0.0,
        'total_fuel_cost': 0.0,
        'total_service_cost': 0.0,
        'total_other_cost': 0.0,
        'total_km_driven': 0.0,
        'vehicles': []
    }

    if active_tabs.get('tab_veicoli_active', True):
        vehs = conn.execute('''
            SELECT v.* FROM vehicles v
            JOIN garages g ON v.garage_id = g.id
            WHERE g.user_id = ?
        ''', (user_id,)).fetchall()

        for v in vehs:
            acts = conn.execute('''
                SELECT * FROM vehicle_activities
                WHERE vehicleId = ? AND date LIKE ?
                ORDER BY date ASC
            ''', (v['id'], f"{year}-%")).fetchall()

            if not acts:
                continue

            v_fuel_cost = 0.0
            v_fuel_units = 0.0
            v_refuel_count = 0
            v_service_cost = 0.0
            v_service_count = 0
            v_other_cost = 0.0
            v_other_count = 0

            odometers = []

            for a in acts:
                a_type = a['type']
                if a['odometer'] is not None and a['odometer'] > 0:
                    odometers.append(a['odometer'])

                if a_type == 'refuel':
                    cost = (a['totalCost'] or 0.0) + (a['totalCost2'] or 0.0) + (a['totalCost3'] or 0.0)
                    units = (a['liters'] or 0.0) + (a['liters2'] or 0.0) + (a['liters3'] or 0.0)
                    v_fuel_cost += cost
                    v_fuel_units += units
                    v_refuel_count += 1
                elif a_type == 'service':
                    cost = (a['cost'] or 0.0) or (a['totalCost'] or 0.0)
                    v_service_cost += cost
                    v_service_count += 1
                elif a_type == 'expense':
                    cost = (a['cost'] or 0.0) or (a['totalCost'] or 0.0)
                    v_other_cost += cost
                    v_other_count += 1

            v_tot = v_fuel_cost + v_service_cost + v_other_cost
            min_odo = min(odometers) if odometers else 0.0
            max_odo = max(odometers) if odometers else 0.0
            km = (max_odo - min_odo) if (max_odo > min_odo) else 0.0
            cost_per_km = (v_tot / km) if km > 0 else 0.0
            avg_fuel_price = (v_fuel_cost / v_fuel_units) if v_fuel_units > 0 else 0.0

            vehicles_data['vehicles'].append({
                'id': v['id'],
                'brand': v['brand'],
                'model': v['model'],
                'plate': v['plate'] or '',
                'fuel': v['fuel'] or '',
                'total_cost': v_tot,
                'fuel_cost': v_fuel_cost,
                'fuel_units': v_fuel_units,
                'refuels_count': v_refuel_count,
                'avg_fuel_price': avg_fuel_price,
                'service_cost': v_service_cost,
                'service_count': v_service_count,
                'other_cost': v_other_cost,
                'other_count': v_other_count,
                'km_driven': km,
                'cost_per_km': cost_per_km
            })

            vehicles_data['total_cost'] += v_tot
            vehicles_data['total_fuel_cost'] += v_fuel_cost
            vehicles_data['total_service_cost'] += v_service_cost
            vehicles_data['total_other_cost'] += v_other_cost
            vehicles_data['total_km_driven'] += km

    # -------------------------------------------------------------
    # 5. PRESTITI & MUTUI
    # -------------------------------------------------------------
    loans_data = {
        'total_installments_paid': 0.0,
        'total_principal_paid': 0.0,
        'total_interest_paid': 0.0,
        'total_remaining_debt': 0.0,
        'loans': []
    }

    if active_tabs.get('tab_prestiti_active', True):
        target_date = f"{year}-12-31" if not is_current_year else now.strftime('%Y-%m-%d')
        loans = conn.execute("SELECT * FROM loans WHERE user_id = ?", (user_id,)).fetchall()
        for l in loans:
            pmts = conn.execute("SELECT * FROM loan_payments WHERE loan_id = ?", (l['id'],)).fetchall()
            sched = calculate_amortization_schedule(
                l['principal'], l['interest_rate'], l['term_months'], l['start_date'],
                custom_monthly_payment=l['monthly_payment'],
                payments=[dict(p) for p in pmts],
                additional_charges=l['additional_charges'] or 0.0,
                payment_day=l['payment_day'] or 'last'
            )

            yr_sched = [s for s in sched if s['date'].startswith(str(year)) and s['date'] <= target_date]
            yr_extra = sum(s.get('extra', 0.0) for s in yr_sched)
            inst_paid = sum(s['installment'] for s in yr_sched) + yr_extra
            princ_paid = sum(s['principal'] for s in yr_sched) + yr_extra
            int_paid = sum(s['interest'] for s in yr_sched)

            # Debito residuo alla data target (fine anno o oggi)
            if (l['start_date'] or '') > target_date:
                rem_end = 0.0
            else:
                past_inst = [s for s in sched if s['date'] <= target_date]
                if past_inst:
                    rem_end = past_inst[-1]['remaining']
                else:
                    rem_end = l['principal']

            pct_done = ((l['principal'] - rem_end) / l['principal'] * 100) if l['principal'] > 0 else 0.0

            # Mesi residui alla data target
            future_sched = [s for s in sched if s['date'] > target_date and s['remaining'] > 0]
            months_left = len(future_sched)

            # Detrazione IRPEF 19% stimata sugli interessi passivi (max 4.000€ per mutuo prima casa)
            irpef_saving_19 = min(4000.0, int_paid) * 0.19

            loans_data['loans'].append({
                'id': l['id'],
                'name': l['name'],
                'principal_initial': l['principal'],
                'interest_rate': l['interest_rate'],
                'year_installments': inst_paid,
                'year_principal': princ_paid,
                'year_interest': int_paid,
                'year_extra': yr_extra,
                'remaining_debt': rem_end,
                'percent_repaid': pct_done,
                'months_remaining': months_left,
                'irpef_saving_19': irpef_saving_19
            })

            loans_data['total_installments_paid'] += inst_paid
            loans_data['total_principal_paid'] += princ_paid
            loans_data['total_interest_paid'] += int_paid
            loans_data['total_remaining_debt'] += rem_end

    # -------------------------------------------------------------
    # 6. FONDI PENSIONE & PREVIDENZA
    # -------------------------------------------------------------
    pension_data = {
        'total_contributions': 0.0,
        'total_worker': 0.0,
        'total_employer': 0.0,
        'total_tfr': 0.0,
        'total_fees': 0.0,
        'total_deductible': 0.0,
        'deductible_limit': 5164.57,
        'deductible_pct': 0.0,
        'remaining_deductible_margin': 5164.57,
        'tax_saving_estimate_23': 0.0,
        'tax_saving_estimate_35': 0.0,
        'total_fund_value': 0.0,
        'funds': []
    }

    if active_tabs.get('tab_fondopensione_active', True):
        funds = conn.execute('''
            SELECT pf.* FROM pension_funds pf
            JOIN pension_fund_groups pfg ON pf.pension_fund_group_id = pfg.id
            WHERE pfg.user_id = ?
        ''', (user_id,)).fetchall()

        for f in funds:
            c_rows = conn.execute('''
                SELECT * FROM pension_contributions
                WHERE fund_id = ? AND month LIKE ?
                ORDER BY month ASC
            ''', (f['id'], f"{year}-%")).fetchall()

            worker = sum(r['worker_contrib'] or 0.0 for r in c_rows)
            employer = sum(r['employer_contrib'] or 0.0 for r in c_rows)
            tfr = sum(r['tfr'] or 0.0 for r in c_rows)
            fees = sum(r['spese'] or 0.0 for r in c_rows)
            tot_contrib = worker + employer + tfr

            # Ultimo valore posizione registrato per il fondo
            last_c = conn.execute('''
                SELECT total_value, month FROM pension_contributions
                WHERE fund_id = ? AND month <= ?
                ORDER BY month DESC LIMIT 1
            ''', (f['id'], f"{year}-12")).fetchone()
            val = last_c['total_value'] if last_c and last_c['total_value'] else 0.0

            pension_data['funds'].append({
                'id': f['id'],
                'name': f['name'],
                'provider': f['provider'] or '',
                'worker': worker,
                'employer': employer,
                'tfr': tfr,
                'total': tot_contrib,
                'fees': fees,
                'last_valuation': val,
                'contrib_count': len(c_rows)
            })

            pension_data['total_worker'] += worker
            pension_data['total_employer'] += employer
            pension_data['total_tfr'] += tfr
            pension_data['total_fees'] += fees
            pension_data['total_contributions'] += tot_contrib
            pension_data['total_fund_value'] += val

        pension_data['total_deductible'] = pension_data['total_worker'] + pension_data['total_employer']
        pension_data['deductible_pct'] = min(100.0, (pension_data['total_deductible'] / pension_data['deductible_limit']) * 100)
        pension_data['remaining_deductible_margin'] = max(0.0, pension_data['deductible_limit'] - pension_data['total_deductible'])
        pension_data['tax_saving_estimate_23'] = pension_data['total_deductible'] * 0.23
        pension_data['tax_saving_estimate_35'] = pension_data['total_deductible'] * 0.35

    # -------------------------------------------------------------
    # 7. INVESTIMENTI & PORTAFOGLI
    # -------------------------------------------------------------
    investments_data = {
        'total_invested': 0.0,
        'total_value': 0.0,
        'total_gain': 0.0,
        'return_pct': 0.0,
        'year_buys': 0.0,
        'year_buys_count': 0,
        'year_sells': 0.0,
        'year_sells_count': 0,
        'year_dividends': 0.0,
        'year_dividends_count': 0,
        'year_fees': 0.0,
        'portfolios': []
    }

    if active_tabs.get('tab_investimenti_active', True):
        target_date = f"{year}-12-31" if not is_current_year else now.strftime('%Y-%m-%d')
        portfolios = conn.execute("SELECT * FROM portfolios WHERE user_id = ?", (user_id,)).fetchall()
        for p in portfolios:
            txs = conn.execute('''
                SELECT * FROM transactions
                WHERE portfolio_id = ? AND date LIKE ?
                ORDER BY date ASC
            ''', (p['id'], f"{year}-%")).fetchall()

            buys = sum(t['total_value'] or 0.0 for t in txs if t['operation_type'] in ('Buy', 'Acquisto'))
            buys_cnt = sum(1 for t in txs if t['operation_type'] in ('Buy', 'Acquisto'))
            sells = sum(t['total_value'] or 0.0 for t in txs if t['operation_type'] in ('Sell', 'Vendita'))
            sells_cnt = sum(1 for t in txs if t['operation_type'] in ('Sell', 'Vendita'))
            divs = sum(t['total_value'] or 0.0 for t in txs if t['operation_type'] in ('Dividend', 'Dividendo'))
            divs_cnt = sum(1 for t in txs if t['operation_type'] in ('Dividend', 'Dividendo'))
            fees = sum(t['fees'] or 0.0 for t in txs)

            # Calcolo posizione a fine anno (o data odierna) per singolo strumento finanziario
            all_txs_to_date = conn.execute('''
                SELECT * FROM transactions
                WHERE portfolio_id = ? AND date <= ?
                ORDER BY date ASC
            ''', (p['id'], target_date)).fetchall()

            portfolio_positions = {}
            total_divs_portfolio = 0.0
            isin_to_ticker = {}

            for t in all_txs_to_date:
                isin = (t['asset_name'] or '').strip().upper()
                ticker = (t['ticker'].strip().upper() if 'ticker' in t.keys() and t['ticker'] else isin)
                isin_to_ticker[isin] = ticker

                if isin not in portfolio_positions:
                    portfolio_positions[isin] = {'shares': 0.0, 'cost': 0.0}

                op = t['operation_type']
                if op in ('Buy', 'Acquisto'):
                    portfolio_positions[isin]['shares'] += (t['quantity'] or 0.0)
                    portfolio_positions[isin]['cost'] += (t['total_value'] or 0.0)
                elif op in ('Sell', 'Vendita'):
                    if portfolio_positions[isin]['shares'] > 0:
                        pmc = portfolio_positions[isin]['cost'] / portfolio_positions[isin]['shares']
                        qty = t['quantity'] or 0.0
                        portfolio_positions[isin]['shares'] -= qty
                        portfolio_positions[isin]['cost'] = max(0.0, portfolio_positions[isin]['shares'] * pmc)
                elif op in ('Dividend', 'Dividendo'):
                    total_divs_portfolio += (t['total_value'] or 0.0)

            p_invested = 0.0
            p_current_val = 0.0
            for isin, pos in portfolio_positions.items():
                if pos['shares'] <= 0.000001:
                    continue
                p_invested += pos['cost']
                fetch_ticker = isin_to_ticker.get(isin, isin)

                pr_row = conn.execute('''
                    SELECT price FROM price_history
                    WHERE ticker = ? AND date <= ?
                    ORDER BY date DESC LIMIT 1
                ''', (fetch_ticker, target_date)).fetchone()

                if pr_row and pr_row['price'] is not None:
                    asset_price = float(pr_row['price'])
                else:
                    asset_price = (pos['cost'] / pos['shares']) if pos['shares'] > 0 else 0.0

                p_current_val += (asset_price * pos['shares'])

            p_capital_gain = p_current_val - p_invested
            p_gain = p_capital_gain + total_divs_portfolio
            p_ret_pct = (p_capital_gain / p_invested * 100) if p_invested > 0 else 0.0

            investments_data['portfolios'].append({
                'id': p['id'],
                'name': p['name'],
                'invested': p_invested,
                'value': p_current_val,
                'gain': p_gain,
                'capital_gain': p_capital_gain,
                'return_pct': p_ret_pct,
                'year_buys': buys,
                'year_buys_count': buys_cnt,
                'year_sells': sells,
                'year_sells_count': sells_cnt,
                'year_dividends': divs,
                'year_dividends_count': divs_cnt,
                'year_fees': fees,
                'tx_count': len(txs)
            })

            investments_data['total_invested'] += p_invested
            investments_data['total_value'] += p_current_val
            investments_data['total_gain'] += p_gain
            investments_data['year_buys'] += buys
            investments_data['year_buys_count'] += buys_cnt
            investments_data['year_sells'] += sells
            investments_data['year_sells_count'] += sells_cnt
            investments_data['year_dividends'] += divs
            investments_data['year_dividends_count'] += divs_cnt
            investments_data['year_fees'] += fees

        if investments_data['total_invested'] > 0:
            investments_data['return_pct'] = ((investments_data['total_value'] - investments_data['total_invested']) / investments_data['total_invested']) * 100

    # -------------------------------------------------------------
    # 8. QUADRO GENERALE & PATRIMONIO NETTO
    # -------------------------------------------------------------
    tot_inflow = max(salaries_data['total_net'], wallet_data['total_income']) + bills_data['solar_incentives_total'] + investments_data['year_dividends']

    tot_outflow = wallet_data['total_expense']
    if tot_outflow == 0:
        tot_outflow = bills_data['total_cost'] + vehicles_data['total_cost'] + loans_data['total_installments_paid']

    net_cash_savings = tot_inflow - tot_outflow
    savings_rate = (net_cash_savings / tot_inflow * 100) if tot_inflow > 0 else 0.0

    # Liquidità conti registrata in saldi_conto
    cash_row = conn.execute("SELECT SUM(saldo) as tot_saldo FROM saldi_conto WHERE data LIKE ?", (f"{year}-%",)).fetchone()
    cash_balance = cash_row['tot_saldo'] if cash_row and cash_row['tot_saldo'] else 0.0

    # Patrimonio netto stimato
    # (Attivi: Investimenti + Fondi Pensione + Liquidità) - (Passivi: Debito Residuo Prestiti)
    total_assets = investments_data['total_value'] + pension_data['total_fund_value'] + cash_balance
    total_liabilities = loans_data['total_remaining_debt']
    net_worth = total_assets - total_liabilities

    summary = {
        'year': year,
        'is_current_year': is_current_year,
        'months_count': months_count,
        'user_email': username,
        'total_inflow': tot_inflow,
        'total_outflow': tot_outflow,
        'net_cash_savings': net_cash_savings,
        'savings_rate': savings_rate,
        'total_assets': total_assets,
        'total_liabilities': total_liabilities,
        'net_worth': net_worth,
        'cash_balance': cash_balance
    }

    report_dict = {
        'summary': summary,
        'salaries': salaries_data,
        'wallet': wallet_data,
        'bills': bills_data,
        'vehicles': vehicles_data,
        'loans': loans_data,
        'pension': pension_data,
        'investments': investments_data,
        'active_tabs': active_tabs,
        'prev_year': year - 1,
        'prev_year_data': None
    }

    if include_prev:
        try:
            report_dict['prev_year_data'] = get_annual_report_data(conn, user_id, year - 1, include_prev=False)
        except Exception:
            report_dict['prev_year_data'] = None

    return report_dict


def render_annual_report_html(data):
    """
    Produce un template HTML per email responsive, moderno, elegante e comprensibile anche a un principiante.
    Nessun testo generato da AI: solo numeri chiari, etichette esplicative e layout intuitivo.
    """
    s = data['summary']
    sal = data['salaries']
    w = data['wallet']
    b = data['bills']
    v = data['vehicles']
    l = data['loans']
    p = data['pension']
    inv = data['investments']
    tabs = data['active_tabs']

    year = s['year']
    period_label = f"Anno {year}" + (" (Anno in corso fino ad oggi)" if s['is_current_year'] else " (Consuntivo Completo)")

    # Dati anno precedente per il confronto (diff)
    prev_d = data.get('prev_year_data') or {}
    prev_year = data.get('prev_year', year - 1)
    has_prev = bool(prev_d)

    ps = prev_d.get('summary', {})
    psal = prev_d.get('salaries', {})
    pw = prev_d.get('wallet', {})
    pb = prev_d.get('bills', {})
    pv = prev_d.get('vehicles', {})
    pl = prev_d.get('loans', {})
    pp = prev_d.get('pension', {})
    pinv = prev_d.get('investments', {})
    prev_cat_expenses = pw.get('cat_expenses', {})

    # Formattazione valuta e numeri
    def fmt_eur(val):
        if val is None:
            return "€0,00"
        val_f = float(val)
        neg = val_f < 0
        abs_v = abs(val_f)
        s_val = f"€{abs_v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"-{s_val}" if neg else s_val

    def fmt_num(val, dec=1):
        if val is None:
            return "0"
        fmt_str = f"{{:,.{dec}f}}"
        return fmt_str.format(val).replace(",", "X").replace(".", ",").replace("X", ".")

    def fmt_diff(curr, prev, is_expense=False, is_debt=False, show_val=True, prev_label=None):
        if prev is None or (prev == 0 and (curr is None or curr == 0)):
            return '<span style="color:#94a3b8; font-size:11px;">-</span>'
        curr_v = float(curr or 0.0)
        prev_v = float(prev or 0.0)
        if prev_v == 0:
            if curr_v > 0:
                return '<span style="color:#2563eb; font-size:11px; font-weight:600;">Nuovo</span>'
            return '<span style="color:#94a3b8; font-size:11px;">-</span>'
        diff = curr_v - prev_v
        if abs(diff) < 0.005:
            return '<span style="color:#64748b; font-size:11px;">= 0,0%</span>'
        pct = (diff / abs(prev_v)) * 100
        is_good = (diff < 0) if (is_expense or is_debt) else (diff > 0)
        color = "#16a34a" if is_good else "#dc2626"
        arrow = "▲" if diff > 0 else "▼"
        diff_str = f"+{fmt_eur(diff)}" if diff > 0 else fmt_eur(diff)
        pct_str = f"{pct:+.1f}%".replace('.', ',')
        suffix = f" vs {prev_label}" if prev_label else ""
        if show_val:
            return f'<span style="color:{color}; font-size:11px; font-weight:600; white-space:nowrap;">{arrow} {diff_str} ({pct_str}){suffix}</span>'
        else:
            return f'<span style="color:{color}; font-size:11px; font-weight:600; white-space:nowrap;">{arrow} {pct_str}{suffix}</span>'

    def fmt_diff_num(curr, prev, unit="", is_expense=False, prev_label=None):
        if prev is None or (prev == 0 and (curr is None or curr == 0)):
            return '<span style="color:#94a3b8; font-size:11px;">-</span>'
        curr_v = float(curr or 0.0)
        prev_v = float(prev or 0.0)
        if prev_v == 0:
            unit_str = f" {unit}" if unit else ""
            return f'<span style="color:#2563eb; font-size:11px; font-weight:600;">Nuovo (+{fmt_num(curr_v)}{unit_str})</span>'
        diff = curr_v - prev_v
        if abs(diff) < 0.005:
            return '<span style="color:#64748b; font-size:11px;">= 0,0%</span>'
        pct = (diff / abs(prev_v)) * 100
        is_good = (diff < 0) if is_expense else (diff > 0)
        color = "#16a34a" if is_good else "#dc2626"
        arrow = "▲" if diff > 0 else "▼"
        suffix = f" vs {prev_label}" if prev_label else ""
        unit_str = f" {unit}" if unit else ""
        diff_str = f"+{fmt_num(diff)}{unit_str}" if diff > 0 else f"-{fmt_num(abs(diff))}{unit_str}"
        pct_str = f"{pct:+.1f}%".replace('.', ',')
        return f'<span style="color:{color}; font-size:11px; font-weight:600; white-space:nowrap;">{arrow} {diff_str} ({pct_str}){suffix}</span>'

    # Colore e stato del risparmio
    is_savings_pos = s['net_cash_savings'] >= 0

    html = f"""<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resoconto Finanziario Annuale {year} - CoTrack</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f1f5f9;
            color: #1e293b;
            margin: 0;
            padding: 20px;
            line-height: 1.5;
        }}
        .email-wrapper {{
            max-width: 680px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
            border: 1px solid #e2e8f0;
        }}
        .header {{
            background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #0284c7 100%);
            padding: 32px 28px;
            text-align: center;
            color: #ffffff;
        }}
        .header h1 {{
            margin: 0;
            font-size: 26px;
            font-weight: 800;
            letter-spacing: -0.5px;
        }}
        .header .subtitle {{
            margin: 6px 0 0;
            font-size: 15px;
            opacity: 0.95;
            font-weight: 500;
        }}
        .badge-year {{
            display: inline-block;
            background: rgba(255, 255, 255, 0.2);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            margin-top: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .content {{
            padding: 28px 24px;
        }}
        .intro-box {{
            background: #f8fafc;
            border-left: 4px solid #2563eb;
            padding: 14px 18px;
            border-radius: 0 8px 8px 0;
            font-size: 13.5px;
            color: #475569;
            margin-bottom: 24px;
        }}
        .kpi-grid {{
            display: table;
            width: 100%;
            margin-bottom: 12px;
        }}
        .kpi-row {{
            display: table-row;
        }}
        .kpi-card {{
            display: table-cell;
            width: 50%;
            padding: 12px;
            box-sizing: border-box;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            vertical-align: top;
        }}
        .kpi-card-inner {{
            padding: 4px;
        }}
        .kpi-title {{
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            margin-bottom: 4px;
        }}
        .kpi-val {{
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 2px;
        }}
        .kpi-sub {{
            font-size: 11.5px;
            color: #64748b;
        }}
        .pos {{ color: #10b981; font-weight: 700; }}
        .neg {{ color: #ef4444; font-weight: 700; }}
        .accent {{ color: #2563eb; font-weight: 700; }}
        .section {{
            margin-top: 28px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
        }}
        .section-title {{
            font-size: 16px;
            font-weight: 800;
            color: #1e3a8a;
            margin: 0;
        }}
        .section-explainer {{
            font-size: 12.5px;
            color: #64748b;
            margin: 2px 0 14px;
        }}
        .card {{
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 14px;
        }}
        .data-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 12.5px;
            margin-top: 8px;
        }}
        .data-table th {{
            text-align: left;
            padding: 8px 10px;
            background: #f1f5f9;
            color: #475569;
            font-weight: 700;
            border-bottom: 1px solid #cbd5e1;
        }}
        .data-table td {{
            padding: 8px 10px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
        }}
        .data-table tr:last-child td {{
            border-bottom: none;
        }}
        .tar {{ text-align: right; }}
        .tac {{ text-align: center; }}
        .bar-container {{
            background: #e2e8f0;
            border-radius: 6px;
            height: 8px;
            width: 100%;
            overflow: hidden;
            margin: 4px 0 2px;
        }}
        .bar-fill {{
            height: 8px;
            border-radius: 6px;
        }}
        .bar-fill-blue {{ background: #2563eb; }}
        .bar-fill-green {{ background: #10b981; }}
        .badge {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 10.5px;
            font-weight: 700;
        }}
        .badge-green {{ background: #dcfce7; color: #15803d; }}
        .badge-amber {{ background: #fef3c7; color: #b45309; }}
        .footer {{
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            padding: 24px;
            text-align: center;
            font-size: 11.5px;
            color: #94a3b8;
        }}
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>CoTrack</h1>
            <div class="subtitle">Resoconto Finanziario Annuale</div>
            <div class="badge-year">{period_label}</div>
        </div>

        <div class="content">
            <div class="intro-box">
                👋 <strong>Ciao!</strong> Ecco il tuo bilancio annuale consolidato con tutti i numeri reali estratti dalle varie sezioni della tua applicazione (stipendi, spese quotidiane, bollette di casa, veicoli, mutui, investimenti e fondo pensione). Tutti i valori sono calcolati matematicamente senza l'uso di intelligenza artificiale.
            </div>

            <!-- 4 GRANDI KPI: CRUSCOTTO GENERALE -->
            <div class="kpi-grid">
                <div class="kpi-row">
                    <div class="kpi-card" style="border-right: 6px solid #ffffff;">
                        <div class="kpi-card-inner">
                            <div class="kpi-title">💰 Entrate Totali Nette</div>
                            <div class="kpi-val pos">{fmt_eur(s['total_inflow'])}</div>
                            <div class="kpi-sub">
                                {fmt_diff(s['total_inflow'], ps.get('total_inflow'), prev_label=str(prev_year))}<br>
                                <span style="font-size:10.5px; color:#64748b;">Media: {fmt_eur(s['total_inflow'] / s['months_count'])}/mese</span>
                            </div>
                        </div>
                    </div>
                    <div class="kpi-card" style="border-left: 6px solid #ffffff;">
                        <div class="kpi-card-inner">
                            <div class="kpi-title">🛒 Spese Totali Effettuate</div>
                            <div class="kpi-val neg">{fmt_eur(s['total_outflow'])}</div>
                            <div class="kpi-sub">
                                {fmt_diff(s['total_outflow'], ps.get('total_outflow'), is_expense=True, prev_label=str(prev_year))}<br>
                                <span style="font-size:10.5px; color:#64748b;">Media: {fmt_eur(s['total_outflow'] / s['months_count'])}/mese</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="kpi-grid">
                <div class="kpi-row">
                    <div class="kpi-card" style="border-right: 6px solid #ffffff;">
                        <div class="kpi-card-inner">
                            <div class="kpi-title">🏦 Risparmio Netto Annuo</div>
                            <div class="kpi-val {'pos' if is_savings_pos else 'neg'}">{fmt_eur(s['net_cash_savings'])}</div>
                            <div class="kpi-sub">
                                {fmt_diff(s['net_cash_savings'], ps.get('net_cash_savings'), prev_label=str(prev_year))}<br>
                                <span style="font-size:10.5px; color:#64748b;">Tasso risparmio: <strong>{fmt_num(s['savings_rate'])}%</strong></span>
                            </div>
                        </div>
                    </div>
                    <div class="kpi-card" style="border-left: 6px solid #ffffff;">
                        <div class="kpi-card-inner">
                            <div class="kpi-title">💎 Posizione Finanziaria Netta</div>
                            <div class="kpi-val accent">{fmt_eur(s['net_worth'])}</div>
                            <div class="kpi-sub">
                                {fmt_diff(s['net_worth'], ps.get('net_worth'), prev_label=str(prev_year))}<br>
                                <span style="font-size:10px; color:#64748b;">Investimenti + Pensione - Debito</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
"""

    # -------------------------------------------------------------
    # SEZIONE: STIPENDI & REDDITI
    # -------------------------------------------------------------
    if tabs.get('tab_stipendi_active', True) and sal['people']:
        html += f"""
            <div class="section">
                <div class="section-title">💼 Lavoro, Stipendi & Entrate Familiari</div>
                <div class="section-explainer">I redditi percepiti da lavoro dipendente, assegni familiari e bonus nell'arco dell'anno.</div>
                
                <div class="card">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Dipendente / Fonte</th>
                                <th class="tac">Mesi</th>
                                <th class="tar">Netto {year}</th>
                                <th class="tar">Netto {prev_year}</th>
                                <th class="tar">Variazione</th>
                                <th class="tar">Lordo {year}</th>
                                <th class="tar">Media Mese</th>
                            </tr>
                        </thead>
                        <tbody>
        """
        for p_item in sal['people']:
            prev_p = next((x for x in psal.get('people', []) if x['name'] == p_item['name']), None)
            prev_p_net = prev_p['net'] if prev_p else 0.0
            diff_p = fmt_diff(p_item['net'], prev_p_net if prev_p else None)

            extra_info = []
            if p_item['production_bonus_net'] > 0:
                extra_info.append(f"Premio: {fmt_eur(p_item['production_bonus_net'])}")
            if p_item['extra_reimbursements'] > 0:
                extra_info.append(f"Rimborsi: {fmt_eur(p_item['extra_reimbursements'])}")
            if p_item['thirteenth_count'] > 0:
                extra_info.append("13ª")
            extra_sub = f"<br><span style='font-size:10px; color:#64748b;'>{' | '.join(extra_info)}</span>" if extra_info else ""

            html += f"""
                            <tr>
                                <td><strong>{p_item['name']}</strong>{extra_sub}</td>
                                <td class="tac">{p_item['slips_count']}</td>
                                <td class="tar pos"><strong>{fmt_eur(p_item['net'])}</strong></td>
                                <td class="tar">{fmt_eur(prev_p_net) if prev_p else '-'}</td>
                                <td class="tar">{diff_p}</td>
                                <td class="tar">{fmt_eur(p_item['gross'])}</td>
                                <td class="tar">{fmt_eur(p_item['avg_monthly_net'])}</td>
                            </tr>
            """

        tot_sal_diff = fmt_diff(sal['total_net'], psal.get('total_net'))
        html += f"""
                            <tr style="background:#f8fafc; font-weight:bold; border-top:2px solid #cbd5e1;">
                                <td>TOTALE STIPENDI</td>
                                <td class="tac">{sal['slips_count']}</td>
                                <td class="tar pos">{fmt_eur(sal['total_net'])}</td>
                                <td class="tar">{fmt_eur(psal.get('total_net', 0.0)) if psal else '-'}</td>
                                <td class="tar">{tot_sal_diff}</td>
                                <td class="tar">{fmt_eur(sal['total_gross'])}</td>
                                <td class="tar">{fmt_eur(sal['total_net'] / s['months_count'])}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div style="font-size:11.5px; color:#64748b; margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0;">
                        ℹ️ <strong>Trattenute fiscali e contributi:</strong> Su un lordo totale di {fmt_eur(sal['total_gross'])}, sono stati versati allo Stato circa <strong>{fmt_eur(sal['total_withholdings'])}</strong> di tasse e INPS (cuneo fiscale medio del {fmt_num(sal['tax_rate'])}%).
                    </div>
                </div>
            </div>
        """

    # -------------------------------------------------------------
    # SEZIONE: SPESE QUOTIDIANE (WALLET)
    # -------------------------------------------------------------
    if tabs.get('tab_wallet_active', True) and (w['total_expense'] > 0 or w['total_income'] > 0):
        tot_wallet_diff = fmt_diff(w['total_expense'], pw.get('total_expense'), is_expense=True)
        html += f"""
            <div class="section">
                <div class="section-title">💳 Spese Quotidiane & Bilancio Personale (Wallet)</div>
                <div class="section-explainer">Tutte le transazioni di spesa e acquisti registrati nei tuoi conti durante l'anno.</div>
                
                <div class="card">
                    <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
                        <tr>
                            <td style="width:33%; padding:6px;">
                                <span class="kpi-title">Spesa Totale</span><br>
                                <span style="font-size:16px; font-weight:700; color:#ef4444;">{fmt_eur(w['total_expense'])}</span><br>
                                {fmt_diff(w['total_expense'], pw.get('total_expense'), is_expense=True, prev_label=str(prev_year))}
                            </td>
                            <td style="width:33%; padding:6px;">
                                <span class="kpi-title">Media Mensile</span><br>
                                <span style="font-size:16px; font-weight:700; color:#475569;">{fmt_eur(w['monthly_expense_avg'])}/mese</span><br>
                                {fmt_diff(w['monthly_expense_avg'], pw.get('monthly_expense_avg'), is_expense=True, prev_label=str(prev_year))}
                            </td>
                            <td style="width:33%; padding:6px;">
                                <span class="kpi-title">N° Operazioni</span><br>
                                <span style="font-size:16px; font-weight:700; color:#0f172a;">{w['tx_count']}</span><br>
                                {fmt_diff_num(w['tx_count'], pw.get('tx_count'), prev_label=str(prev_year))}
                            </td>
                        </tr>
                    </table>

                    <div style="font-size:12px; font-weight:700; color:#334155; margin:14px 0 8px;">🏷️ Le tue principali categorie di spesa dell'anno:</div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Categoria</th>
                                <th class="tar">Spesa {year}</th>
                                <th class="tar">Spesa {prev_year}</th>
                                <th class="tar">Differenza</th>
                                <th style="width:25%;">Incidenza {year}</th>
                            </tr>
                        </thead>
                        <tbody>
        """
        for cat in w['top_categories']:
            prev_cat_val = prev_cat_expenses.get(cat['category'])
            diff_cat_html = fmt_diff(cat['amount'], prev_cat_val, is_expense=True)
            prev_cat_str = fmt_eur(prev_cat_val) if prev_cat_val is not None else '-'
            html += f"""
                            <tr>
                                <td><strong>{cat['category']}</strong></td>
                                <td class="tar neg">{fmt_eur(cat['amount'])}</td>
                                <td class="tar">{prev_cat_str}</td>
                                <td class="tar">{diff_cat_html}</td>
                                <td>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <div class="bar-container" style="flex:1;">
                                            <div class="bar-fill bar-fill-blue" style="width:{min(100.0, cat['pct'])}%;"></div>
                                        </div>
                                        <span style="font-size:11px; font-weight:700; width:36px; text-align:right;">{fmt_num(cat['pct'])}%</span>
                                    </div>
                                </td>
                            </tr>
            """
        html += f"""
                            <tr style="background:#f8fafc; font-weight:bold; border-top:2px solid #cbd5e1;">
                                <td>TOTALE SPESE REGISTRATE</td>
                                <td class="tar neg">{fmt_eur(w['total_expense'])}</td>
                                <td class="tar">{fmt_eur(pw.get('total_expense')) if pw else '-'}</td>
                                <td class="tar">{tot_wallet_diff}</td>
                                <td><span style="font-size:11px; color:#64748b;">100%</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        """

    # -------------------------------------------------------------
    # SEZIONE: BOLLETTE CASA & FOTOVOLTAICO
    # -------------------------------------------------------------
    if tabs.get('tab_bollette_active', True) and (b['total_cost'] > 0 or b['solar_production_kwh'] > 0):
        net_energy_gain = b['net_energy_balance'] >= 0
        energy_badge_html = f"<span class='badge badge-green'>Guadagno Netto: +{fmt_eur(b['net_energy_balance'])}</span>" if net_energy_gain else f"<span class='badge badge-amber'>Costo Netto: {fmt_eur(abs(b['net_energy_balance']))}</span>"

        tot_bills_diff = fmt_diff(b['total_cost'], pb.get('total_cost'), is_expense=True)
        diff_elec_cost = fmt_diff(b['electricity_cost'], pb.get('electricity_cost'), is_expense=True)
        diff_elec_kwh = fmt_diff_num(b['electricity_kwh'], pb.get('electricity_kwh'), unit="kWh", is_expense=True)
        diff_water_cost = fmt_diff(b['water_cost'], pb.get('water_cost'), is_expense=True)
        diff_water_m3 = fmt_diff_num(b['water_m3'], pb.get('water_m3'), unit="m³", is_expense=True)
        diff_gas_cost = fmt_diff(b['gas_cost'], pb.get('gas_cost'), is_expense=True)
        diff_gas_smc = fmt_diff_num(b['gas_smc'], pb.get('gas_smc'), unit="Smc", is_expense=True)
        diff_waste_cost = fmt_diff(b['waste_cost'], pb.get('waste_cost'), is_expense=True)

        html += f"""
            <div class="section">
                <div class="section-title">🏡 Casa, Utenze & Energia Solare</div>
                <div class="section-explainer">I costi sostenuti per le utenze domestiche (luce, acqua, gas, rifiuti) e la produzione fotovoltaica.</div>
                
                <div class="card">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Utenza</th>
                                <th class="tar">Costo {year}</th>
                                <th class="tar">Costo {prev_year}</th>
                                <th class="tar">Variazione Spesa</th>
                                <th class="tar">Consumo {year}</th>
                                <th class="tar">Diff Consumo</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>⚡ <strong>Energia Elettrica</strong></td>
                                <td class="tar neg">{fmt_eur(b['electricity_cost'])}</td>
                                <td class="tar">{fmt_eur(pb.get('electricity_cost')) if pb else '-'}</td>
                                <td class="tar">{diff_elec_cost}</td>
                                <td class="tar">{fmt_num(b['electricity_kwh'])} kWh</td>
                                <td class="tar">{diff_elec_kwh}</td>
                            </tr>
                            <tr>
                                <td>💧 <strong>Acqua</strong></td>
                                <td class="tar neg">{fmt_eur(b['water_cost'])}</td>
                                <td class="tar">{fmt_eur(pb.get('water_cost')) if pb else '-'}</td>
                                <td class="tar">{diff_water_cost}</td>
                                <td class="tar">{fmt_num(b['water_m3'])} m³</td>
                                <td class="tar">{diff_water_m3}</td>
                            </tr>
                            <tr>
                                <td>🔥 <strong>Gas</strong></td>
                                <td class="tar neg">{fmt_eur(b['gas_cost'])}</td>
                                <td class="tar">{fmt_eur(pb.get('gas_cost')) if pb else '-'}</td>
                                <td class="tar">{diff_gas_cost}</td>
                                <td class="tar">{fmt_num(b['gas_smc'])} Smc</td>
                                <td class="tar">{diff_gas_smc}</td>
                            </tr>
                            <tr>
                                <td>🗑️ <strong>Rifiuti (TARI)</strong></td>
                                <td class="tar neg">{fmt_eur(b['waste_cost'])}</td>
                                <td class="tar">{fmt_eur(pb.get('waste_cost')) if pb else '-'}</td>
                                <td class="tar">{diff_waste_cost}</td>
                                <td class="tar">-</td>
                                <td class="tar">-</td>
                            </tr>
                            <tr style="background:#f8fafc; font-weight:bold; border-top:2px solid #cbd5e1;">
                                <td>TOTALE BOLLETTE CASA</td>
                                <td class="tar neg">{fmt_eur(b['total_cost'])}</td>
                                <td class="tar">{fmt_eur(pb.get('total_cost')) if pb else '-'}</td>
                                <td class="tar">{tot_bills_diff}</td>
                                <td colspan="2" class="tar"><span style="font-size:11px; color:#64748b;">Media: {fmt_eur(b['monthly_avg'])}/mese</span></td>
                            </tr>
                        </tbody>
                    </table>
        """

        if b['solar_production_kwh'] > 0 or b['solar_incentives_total'] > 0:
            diff_solar_prod = fmt_diff_num(b['solar_production_kwh'], pb.get('solar_production_kwh'), unit="kWh")
            diff_solar_self = fmt_diff_num(b['self_consumption_kwh'], pb.get('self_consumption_kwh'), unit="kWh")
            diff_solar_grid = fmt_diff_num(b['grid_feed_in_kwh'], pb.get('grid_feed_in_kwh'), unit="kWh")
            diff_solar_inc = fmt_diff(b['solar_incentives_total'], pb.get('solar_incentives_total'), is_expense=False)
            diff_net_balance = fmt_diff(b['net_energy_balance'], pb.get('net_energy_balance'), is_expense=False)

            msg_solar = f"✨ <strong>Ottimo risultato:</strong> Grazie agli incentivi GSE e all'energia prodotta, l'impianto ha completamente coperto la bolletta elettrica generando un utile netto di {fmt_eur(b['net_energy_balance'])} ({diff_net_balance} vs {prev_year})!" if net_energy_gain else f"💡 Gli incentivi hanno abbattuto la spesa della corrente elettrica di {fmt_eur(b['solar_incentives_total'])}."
            html += f"""
                    <div style="margin-top:16px; padding:12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;">
                        <div style="font-size:13px; font-weight:700; color:#166534; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                            <span>☀️ Rendimento Impianto Solare & GSE</span>
                            {energy_badge_html}
                        </div>
                        <table style="width:100%; font-size:12px; border-collapse:collapse;">
                            <tr>
                                <td style="padding:4px 0; color:#1e293b;">• Produzione Totale Solare:</td>
                                <td style="text-align:right; font-weight:700;">{fmt_num(b['solar_production_kwh'])} kWh</td>
                                <td style="text-align:right; width:35%;">{diff_solar_prod}</td>
                            </tr>
                            <tr>
                                <td style="padding:4px 0; color:#1e293b;">• Autoconsumo Diretto:</td>
                                <td style="text-align:right; font-weight:700;">{fmt_num(b['self_consumption_kwh'])} kWh ({fmt_num(b['self_consumption_pct'])}%)</td>
                                <td style="text-align:right;">{diff_solar_self}</td>
                            </tr>
                            <tr>
                                <td style="padding:4px 0; color:#1e293b;">• Energia Immessa in Rete:</td>
                                <td style="text-align:right; font-weight:700;">{fmt_num(b['grid_feed_in_kwh'])} kWh</td>
                                <td style="text-align:right;">{diff_solar_grid}</td>
                            </tr>
                            <tr>
                                <td style="padding:4px 0; color:#1e293b;">• Rimborsi & Incentivi Incassati (GSE):</td>
                                <td style="text-align:right; font-weight:700; color:#15803d;">+{fmt_eur(b['solar_incentives_total'])}</td>
                                <td style="text-align:right;">{diff_solar_inc}</td>
                            </tr>
                        </table>
                        <div style="font-size:11px; color:#15803d; margin-top:8px; border-top:1px dashed #bbf7d0; padding-top:6px;">
                            {msg_solar}
                        </div>
                    </div>
            """

        if b['appliances']:
            html += f"""
                    <div style="margin-top:14px;">
                        <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:6px;">🔌 Consumi principali elettrodomestici monitorati:</div>
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Elettrodomestico</th>
                                    <th class="tar">Consumo {year}</th>
                                    <th class="tar">Variazione vs {prev_year}</th>
                                    <th class="tar">Incidenza Casa</th>
                                </tr>
                            </thead>
                            <tbody>
            """
            for appl in b['appliances'][:5]:
                prev_appl = next((x for x in pb.get('appliances', []) if x['name'] == appl['name']), None)
                diff_appl = fmt_diff_num(appl['kwh'], prev_appl['kwh'] if prev_appl else None, unit="kWh", is_expense=True)
                html += f"""
                                <tr>
                                    <td>{appl['name']}</td>
                                    <td class="tar"><strong>{fmt_num(appl['kwh'])} kWh</strong></td>
                                    <td class="tar">{diff_appl}</td>
                                    <td class="tar" style="color:#64748b; font-size:11px;">{fmt_num(appl['pct'])}%</td>
                                </tr>
                """
            html += """
                            </tbody>
                        </table>
                    </div>
            """

        html += """
                </div>
            </div>
        """

    # -------------------------------------------------------------
    # SEZIONE: GARAGE & VEICOLI
    # -------------------------------------------------------------
    if tabs.get('tab_veicoli_active', True) and v['vehicles']:
        tot_veh_diff = fmt_diff(v['total_cost'], pv.get('total_cost'), is_expense=True)
        tot_km_diff = fmt_diff_num(v['total_km_driven'], pv.get('total_km_driven'), unit="km")

        html += f"""
            <div class="section">
                <div class="section-title">🚗 Garage & Costi Veicoli</div>
                <div class="section-explainer">I costi vivi per i tuoi mezzi di trasporto: carburante/ricariche, tagliandi e spese fisse (bollo, assicurazione).</div>
                
                <div class="card">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Veicolo</th>
                                <th class="tar">Km {year}</th>
                                <th class="tar">Carburante</th>
                                <th class="tar">Manutenzioni</th>
                                <th class="tar">Costo {year}</th>
                                <th class="tar">Costo {prev_year}</th>
                                <th class="tar">Variazione</th>
                                <th class="tar">Costo/Km</th>
                            </tr>
                        </thead>
                        <tbody>
        """
        for veh in v['vehicles']:
            prev_veh = next((x for x in pv.get('vehicles', []) if x.get('id') == veh.get('id') or (x.get('plate') and x.get('plate') == veh.get('plate'))), None)
            diff_veh_cost = fmt_diff(veh['total_cost'], prev_veh['total_cost'] if prev_veh else None, is_expense=True)
            diff_veh_km = fmt_diff_num(veh['km_driven'], prev_veh['km_driven'] if prev_veh else None, unit="km")
            plate_sub = f" <span style='font-size:10.5px; color:#64748b;'>({veh['plate']})</span>" if veh['plate'] else ""
            fuel_unit_name = "kg" if "metan" in (veh['fuel'] or '').lower() else ("kWh" if "elett" in (veh['fuel'] or '').lower() else "L")
            html += f"""
                            <tr>
                                <td><strong>{veh['brand']} {veh['model']}</strong>{plate_sub}<br>
                                    <span style="font-size:10.5px; color:#64748b;">{veh['refuels_count']} rifornimenti ({fmt_num(veh['fuel_units'], 1)} {fuel_unit_name})</span>
                                </td>
                                <td class="tar"><strong>{fmt_num(veh['km_driven'], 0)} km</strong><br>{diff_veh_km}</td>
                                <td class="tar">{fmt_eur(veh['fuel_cost'])}</td>
                                <td class="tar">{fmt_eur(veh['service_cost'])}</td>
                                <td class="tar neg"><strong>{fmt_eur(veh['total_cost'])}</strong></td>
                                <td class="tar">{fmt_eur(prev_veh['total_cost']) if prev_veh else '-'}</td>
                                <td class="tar">{diff_veh_cost}</td>
                                <td class="tar"><strong>{fmt_eur(veh['cost_per_km']) if veh['cost_per_km'] > 0 else '-'}</strong></td>
                            </tr>
            """

        html += f"""
                            <tr style="background:#f8fafc; font-weight:bold; border-top:2px solid #cbd5e1;">
                                <td>TOTALE GESTIONE PARCO AUTO</td>
                                <td class="tar">{fmt_num(v['total_km_driven'], 0)} km<br>{tot_km_diff}</td>
                                <td class="tar">{fmt_eur(v['total_fuel_cost'])}</td>
                                <td class="tar">{fmt_eur(v['total_service_cost'])}</td>
                                <td class="tar neg">{fmt_eur(v['total_cost'])}</td>
                                <td class="tar">{fmt_eur(pv.get('total_cost')) if pv else '-'}</td>
                                <td class="tar">{tot_veh_diff}</td>
                                <td class="tar">{fmt_eur(v['total_cost'] / v['total_km_driven']) if v['total_km_driven'] > 0 else '-'}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div style="font-size:11.5px; color:#64748b; margin-top:8px;">
                        ℹ️ <strong>Costo/Km:</strong> Indica quanto ti è costato realmente ogni singolo chilometro percorso nell'anno, includendo anche assicurazione, bollo e manutenzioni.
                    </div>
                </div>
            </div>
        """

    # -------------------------------------------------------------
    # SEZIONE: MUTUI & PRESTITI
    # -------------------------------------------------------------
    if tabs.get('tab_prestiti_active', True) and l['loans']:
        tot_installments_diff = fmt_diff(l['total_installments_paid'], pl.get('total_installments_paid'), is_expense=True)
        tot_debt_diff = fmt_diff(l['total_remaining_debt'], pl.get('total_remaining_debt'), is_debt=True)

        html += f"""
            <div class="section">
                <div class="section-title">🤝 Mutui & Finanziamenti</div>
                <div class="section-explainer">Il rimborso dei tuoi finanziamenti: quanto debito hai saldato e quanto ti rimane da restituire.</div>
                
                <div class="card">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Finanziamento</th>
                                <th class="tar">Rate Versate {year}</th>
                                <th class="tar">Quota Capitale</th>
                                <th class="tar">Quota Interessi</th>
                                <th class="tar">Debito Residuo {year}</th>
                                <th class="tar">Debito {prev_year}</th>
                                <th class="tar">Erosione Debito</th>
                            </tr>
                        </thead>
                        <tbody>
        """
        for loan in l['loans']:
            prev_loan = next((x for x in pl.get('loans', []) if x.get('id') == loan.get('id') or x.get('name') == loan.get('name')), None)
            prev_rem_debt = prev_loan['remaining_debt'] if prev_loan else None
            diff_debt = fmt_diff(loan['remaining_debt'], prev_rem_debt, is_debt=True)
            years_left_str = f"~{loan['months_remaining'] // 12} anni" if loan['months_remaining'] >= 12 else f"{loan['months_remaining']} mesi"
            html += f"""
                            <tr>
                                <td>
                                    <strong>{loan['name']}</strong><br>
                                    <span style="font-size:10.5px; color:#64748b;">Iniziale: {fmt_eur(loan['principal_initial'])} (Tasso {loan['interest_rate']}%)</span>
                                </td>
                                <td class="tar neg"><strong>{fmt_eur(loan['year_installments'])}</strong></td>
                                <td class="tar">{fmt_eur(loan['year_principal'])}</td>
                                <td class="tar" style="color:#d97706;">{fmt_eur(loan['year_interest'])}</td>
                                <td class="tar"><strong>{fmt_eur(loan['remaining_debt'])}</strong><br><span style="font-size:10px; color:#64748b;">{years_left_str} rimanenti</span></td>
                                <td class="tar">{fmt_eur(prev_rem_debt) if prev_loan else '-'}</td>
                                <td class="tar">{diff_debt}</td>
                            </tr>
                            <tr>
                                <td colspan="7" style="padding-top:0; padding-bottom:10px;">
                                    <div style="display:flex; align-items:center; gap:8px; font-size:11px; color:#475569; flex-wrap:wrap;">
                                        <span>Stato Restituzione:</span>
                                        <div class="bar-container" style="flex:1; min-width:80px;">
                                            <div class="bar-fill bar-fill-green" style="width:{min(100.0, loan['percent_repaid'])}%;"></div>
                                        </div>
                                        <strong>{fmt_num(loan['percent_repaid'])}% rimborsato</strong>
                                        {f'<span style="margin-left:auto; color:#15803d; font-weight:600;">💡 Detrazione IRPEF 19% stimata: +{fmt_eur(loan["irpef_saving_19"])}</span>' if loan.get('irpef_saving_19', 0) > 0 else ''}
                                    </div>
                                </td>
                            </tr>
            """
        html += f"""
                            <tr style="background:#f8fafc; font-weight:bold; border-top:2px solid #cbd5e1;">
                                <td>TOTALE FINANZIAMENTI</td>
                                <td class="tar neg">{fmt_eur(l['total_installments_paid'])}</td>
                                <td class="tar">{fmt_eur(l['total_principal_paid'])}</td>
                                <td class="tar" style="color:#d97706;">{fmt_eur(l['total_interest_paid'])}</td>
                                <td class="tar">{fmt_eur(l['total_remaining_debt'])}</td>
                                <td class="tar">{fmt_eur(pl.get('total_remaining_debt')) if pl else '-'}</td>
                                <td class="tar">{tot_debt_diff}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        """

    # -------------------------------------------------------------
    # SEZIONE: FONDI PENSIONE & PREVIDENZA INTEGRATIVA
    # -------------------------------------------------------------
    if tabs.get('tab_fondopensione_active', True) and p['funds']:
        tot_pension_diff = fmt_diff(p['total_contributions'], pp.get('total_contributions'), is_expense=False)
        tot_deduct_diff = fmt_diff(p['total_deductible'], pp.get('total_deductible'), is_expense=False, prev_label=str(prev_year))

        html += f"""
            <div class="section">
                <div class="section-title">🛡️ Fondi Pensione & Previdenza Integrativa</div>
                <div class="section-explainer">I versamenti per la tua pensione integrativa e il risparmio fiscale ottenuto tramite le deduzioni.</div>
                
                <div class="card">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Fondo Pensione</th>
                                <th class="tar">Tuo Contributo</th>
                                <th class="tar">Azienda</th>
                                <th class="tar">TFR</th>
                                <th class="tar">Totale {year}</th>
                                <th class="tar">Totale {prev_year}</th>
                                <th class="tar">Differenza</th>
                            </tr>
                        </thead>
                        <tbody>
        """
        for fund in p['funds']:
            prev_fund = next((x for x in pp.get('funds', []) if x.get('id') == fund.get('id') or x.get('name') == fund.get('name')), None)
            prev_fund_tot = prev_fund['total'] if prev_fund else None
            diff_fund = fmt_diff(fund['total'], prev_fund_tot, is_expense=False)
            html += f"""
                            <tr>
                                <td>
                                    <strong>{fund['name']}</strong><br>
                                    <span style="font-size:10.5px; color:#64748b;">{fund['provider']}</span>
                                </td>
                                <td class="tar">{fmt_eur(fund['worker'])}</td>
                                <td class="tar pos">+{fmt_eur(fund['employer'])}</td>
                                <td class="tar">{fmt_eur(fund['tfr'])}</td>
                                <td class="tar accent"><strong>{fmt_eur(fund['total'])}</strong></td>
                                <td class="tar">{fmt_eur(prev_fund_tot) if prev_fund else '-'}</td>
                                <td class="tar">{diff_fund}</td>
                            </tr>
            """
        html += f"""
                            <tr style="background:#f8fafc; font-weight:bold; border-top:2px solid #cbd5e1;">
                                <td>TOTALE ACCANTONATO</td>
                                <td class="tar">{fmt_eur(p['total_worker'])}</td>
                                <td class="tar pos">+{fmt_eur(p['total_employer'])}</td>
                                <td class="tar">{fmt_eur(p['total_tfr'])}</td>
                                <td class="tar accent">{fmt_eur(p['total_contributions'])}</td>
                                <td class="tar">{fmt_eur(pp.get('total_contributions')) if pp else '-'}</td>
                                <td class="tar">{tot_pension_diff}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style="margin-top:14px; padding:14px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px;">
                        <div style="font-size:13px; font-weight:700; color:#1e40af; margin-bottom:6px;">
                            🎯 Monitoraggio Vantaggio Fiscale (Deducibilità IRPEF)
                        </div>
                        <div style="font-size:12px; color:#1e3a8a; line-height:1.5;">
                            La legge italiana consente di dedurre dal proprio reddito imponibile fino a <strong>5.164,57 € all'anno</strong> per i contributi versati (quota lavoratore + quota azienda).
                        </div>
                        <div style="margin:10px 0 4px;">
                            <div style="display:flex; justify-content:space-between; font-size:11.5px; font-weight:700; color:#1e40af; margin-bottom:4px;">
                                <span>Importo Dedotto {year}: <strong>{fmt_eur(p['total_deductible'])}</strong> ({tot_deduct_diff})</span>
                                <span>Tetto: 5.164,57 € ({fmt_num(p['deductible_pct'])}%)</span>
                            </div>
                            <div class="bar-container">
                                <div class="bar-fill bar-fill-blue" style="width:{p['deductible_pct']}%;"></div>
                            </div>
                        </div>
                        <div style="font-size:11.5px; color:#3b82f6; margin-top:6px;">
                            💰 <strong>Risparmio stimato sulle tasse (IRPEF):</strong> Da <strong>{fmt_eur(p['tax_saving_estimate_23'])}</strong> (scaglione base 23%) fino a <strong>{fmt_eur(p['tax_saving_estimate_35'])}</strong> (scaglione 35%) che ti sono rimasti in tasca invece di andare in tasse!
                            <br>Margine ancora deducibile disponibile: <strong>{fmt_eur(p['remaining_deductible_margin'])}</strong>.
                        </div>
                    </div>
                </div>
            </div>
        """

    # -------------------------------------------------------------
    # SEZIONE: INVESTIMENTI & PORTAFOGLI
    # -------------------------------------------------------------
    if tabs.get('tab_investimenti_active', True) and (inv['total_invested'] > 0 or inv['year_buys'] > 0):
        gain_pos = inv['total_gain'] >= 0
        gain_cls = "pos" if gain_pos else "neg"

        pf_rows_html = ""
        for pf in inv['portfolios']:
            pf_g_cls = "pos" if pf['gain'] >= 0 else "neg"
            prev_pf = next((x for x in pinv.get('portfolios', []) if x.get('id') == pf.get('id') or x.get('name') == pf.get('name')), None)
            prev_pf_val = prev_pf['value'] if prev_pf else None
            diff_pf = fmt_diff(pf['value'], prev_pf_val)

            pf_rows_html += f"""
                            <tr>
                                <td>
                                    <strong>{pf['name']}</strong><br>
                                    <span style="font-size:10.5px; color:#64748b;">{pf['tx_count']} operazioni nel {year}</span>
                                </td>
                                <td class="tar">{fmt_eur(pf['invested'])}</td>
                                <td class="tar"><strong>{fmt_eur(pf['value'])}</strong></td>
                                <td class="tar">{fmt_eur(prev_pf_val) if prev_pf else '-'}</td>
                                <td class="tar">{diff_pf}</td>
                                <td class="tar {pf_g_cls}"><strong>{fmt_eur(pf['gain'])}</strong> ({fmt_num(pf['return_pct'])}%)</td>
                            </tr>
            """

        tot_inv_val_diff = fmt_diff(inv['total_value'], pinv.get('total_value'), prev_label=str(prev_year))
        tot_inv_cost_diff = fmt_diff(inv['total_invested'], pinv.get('total_invested'), prev_label=str(prev_year))
        tot_inv_gain_diff = fmt_diff(inv['total_gain'], pinv.get('total_gain'), prev_label=str(prev_year))

        diff_buys = fmt_diff(inv['year_buys'], pinv.get('year_buys'), is_expense=False)
        diff_sells = fmt_diff(inv['year_sells'], pinv.get('year_sells'), is_expense=False)
        diff_divs = fmt_diff(inv['year_dividends'], pinv.get('year_dividends'), is_expense=False)
        diff_fees = fmt_diff(inv['year_fees'], pinv.get('year_fees'), is_expense=True)

        html += f"""
            <div class="section">
                <div class="section-title">📈 Investimenti Finanziari & Portafogli</div>
                <div class="section-explainer">La crescita del tuo patrimonio investito nei mercati finanziari, con gli acquisti e i dividendi dell'anno.</div>
                
                <div class="card">
                    <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
                        <tr>
                            <td style="width:33%; padding:6px;">
                                <span class="kpi-title">Valore Portafoglio</span><br>
                                <span style="font-size:18px; font-weight:800; color:#0f172a;">{fmt_eur(inv['total_value'])}</span><br>
                                {tot_inv_val_diff}
                            </td>
                            <td style="width:33%; padding:6px;">
                                <span class="kpi-title">Capitale Investito</span><br>
                                <span style="font-size:18px; font-weight:800; color:#475569;">{fmt_eur(inv['total_invested'])}</span><br>
                                {tot_inv_cost_diff}
                            </td>
                            <td style="width:33%; padding:6px;">
                                <span class="kpi-title">Guadagno (Plusvalenza)</span><br>
                                <span style="font-size:18px; font-weight:800;" class="{gain_cls}">{fmt_eur(inv['total_gain'])} ({fmt_num(inv['return_pct'])}%)</span><br>
                                {tot_inv_gain_diff}
                            </td>
                        </tr>
                    </table>

                    <div style="font-size:12px; font-weight:700; color:#334155; margin:14px 0 6px;">💼 Dettaglio Portafogli:</div>
                    <table class="data-table" style="margin-bottom:14px;">
                        <thead>
                            <tr>
                                <th>Portafoglio</th>
                                <th class="tar">Investito {year}</th>
                                <th class="tar">Valore {year}</th>
                                <th class="tar">Valore {prev_year}</th>
                                <th class="tar">Variazione Valore</th>
                                <th class="tar">Plusvalenza {year}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pf_rows_html}
                        </tbody>
                    </table>

                    <div style="font-size:12px; font-weight:700; color:#334155; margin:10px 0 6px;">⚡ Attività e movimenti eseguiti nel {year}:</div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Tipo Operazione</th>
                                <th class="tac">Operazioni {year}</th>
                                <th class="tar">Importo {year}</th>
                                <th class="tar">Importo {prev_year}</th>
                                <th class="tar">Variazione</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>🟢 <strong>Nuovi Acquisti (Investimenti effettuati)</strong></td>
                                <td class="tac">{inv['year_buys_count']}</td>
                                <td class="tar accent"><strong>{fmt_eur(inv['year_buys'])}</strong></td>
                                <td class="tar">{fmt_eur(pinv.get('year_buys')) if pinv else '-'}</td>
                                <td class="tar">{diff_buys}</td>
                            </tr>
                            <tr>
                                <td>🔴 <strong>Vendite / Smobilizzi</strong></td>
                                <td class="tac">{inv['year_sells_count']}</td>
                                <td class="tar">{fmt_eur(inv['year_sells'])}</td>
                                <td class="tar">{fmt_eur(pinv.get('year_sells')) if pinv else '-'}</td>
                                <td class="tar">{diff_sells}</td>
                            </tr>
                            <tr>
                                <td>💰 <strong>Dividendi & Cedole Incassate</strong></td>
                                <td class="tac">{inv['year_dividends_count']}</td>
                                <td class="tar pos"><strong>+{fmt_eur(inv['year_dividends'])}</strong></td>
                                <td class="tar">{fmt_eur(pinv.get('year_dividends')) if pinv else '-'}</td>
                                <td class="tar">{diff_divs}</td>
                            </tr>
                            <tr>
                                <td>🧾 <strong>Commissioni Broker Pagate</strong></td>
                                <td class="tac">-</td>
                                <td class="tar neg">-{fmt_eur(inv['year_fees'])}</td>
                                <td class="tar">{fmt_eur(pinv.get('year_fees')) if pinv else '-'}</td>
                                <td class="tar">{diff_fees}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        """

    # -------------------------------------------------------------
    # FOOTER
    # -------------------------------------------------------------
    now_str = datetime.now().strftime("%d/%m/%Y alle %H:%M")
    html += f"""
        </div>

        <div class="footer">
            Generato automaticamente da <strong>CoTrack</strong> in data {now_str}.<br>
            Questo resoconto è strettamente personale e confidenziale. Non rispondere direttamente a questo messaggio.
        </div>
    </div>
</body>
</html>
"""
    return html


def send_annual_report_email(conn, app_config, user_id, year, recipient_email=None):
    """
    Invia l'email con il resoconto annuale a un dato utente o indirizzo email specifico.
    """
    data = get_annual_report_data(conn, user_id, year)
    html_content = render_annual_report_html(data)

    target_email = recipient_email or data['summary']['user_email']
    if not target_email or '@' not in target_email:
        raise ValueError("Indirizzo email del destinatario non valido o assente.")

    smtp_server = app_config.get('SMTP_SERVER')
    smtp_port = app_config.get('SMTP_PORT', 587)
    smtp_user = app_config.get('SMTP_USERNAME')
    smtp_pass = app_config.get('SMTP_PASSWORD')
    sender = app_config.get('MAIL_DEFAULT_SENDER') or smtp_user

    if not smtp_server or not smtp_user or not smtp_pass:
        raise ValueError("Parametri del server SMTP non configurati (verifica le variabili SMTP nel file .env).")

    msg = MIMEMultipart('alternative')
    msg['From'] = sender
    msg['To'] = target_email
    msg['Subject'] = f"📊 Resoconto Finanziario Annuale {year} - CoTrack"

    # Allega il corpo HTML
    msg.attach(MIMEText(html_content, 'html', 'utf-8'))

    # Invio tramite SMTP con TLS
    server = smtplib.SMTP(smtp_server, int(smtp_port))
    server.starttls()
    server.login(smtp_user, smtp_pass)
    server.send_message(msg)
    server.quit()

    return {
        'success': True,
        'recipient': target_email,
        'year': year,
        'message': f"Resoconto annuale {year} inviato con successo a {target_email}"
    }


if __name__ == '__main__':
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Genera o invia il resoconto annuale CoTrack.")
    parser.add_argument('--year', type=int, default=datetime.now().year, help="Anno di riferimento (es. 2025 o 2026)")
    parser.add_argument('--user-id', type=int, default=1, help="ID Utente")
    parser.add_argument('--send', action='store_true', help="Invia realmente l'email via SMTP")
    parser.add_argument('--email', type=str, default=None, help="Email destinatario")
    parser.add_argument('--out', type=str, default=None, help="File HTML in cui salvare l'anteprima")

    args = parser.parse_args()

    db_path = os.path.join(os.path.dirname(__file__), 'data', 'cotrack.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    print(f"[ANNUAL REPORT] Elaborazione dati anno {args.year} per utente {args.user_id}...")
    report_data = get_annual_report_data(conn, args.user_id, args.year)
    html_out = render_annual_report_html(report_data)

    print(f"[ANNUAL REPORT] Calcolo completato.")
    print(f"  Entrate Totali: €{report_data['summary']['total_inflow']:,.2f}")
    print(f"  Spese Totali:   €{report_data['summary']['total_outflow']:,.2f}")
    print(f"  Risparmio:      €{report_data['summary']['net_cash_savings']:,.2f} ({report_data['summary']['savings_rate']:.1f}%)")
    print(f"  Patrimonio:     €{report_data['summary']['net_worth']:,.2f}")

    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(html_out)
        print(f"[ANNUAL REPORT] Anteprima HTML salvata in {args.out}")

    if args.send:
        app_config = {
            'SMTP_SERVER': os.environ.get('SMTP_SERVER'),
            'SMTP_PORT': int(os.environ.get('SMTP_PORT', 587)),
            'SMTP_USERNAME': os.environ.get('SMTP_USERNAME'),
            'SMTP_PASSWORD': os.environ.get('SMTP_PASSWORD'),
            'MAIL_DEFAULT_SENDER': os.environ.get('MAIL_DEFAULT_SENDER')
        }
        res = send_annual_report_email(conn, app_config, args.user_id, args.year, args.email)
        print(f"[ANNUAL REPORT] {res['message']}")

    conn.close()
