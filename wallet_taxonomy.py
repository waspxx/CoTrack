"""
wallet_taxonomy.py - Centralized taxonomy for Wallet Macro-Categories and Subcategories.
Enables hierarchical categorization, dual selectability (macro or subcategory),
and deterministic aggregation.
"""

WALLET_TAXONOMY = {
    "Shopping": [
        "Abbigliamento adulti",
        "Bellezza",
        "Cancelleria, attrezzi",
        "Elettronica",
        "Farmacia",
        "Gioielli",
        "Shopping casa",
        "Regali uscite",
        "Tempo libero",
        "Animali"
    ],
    "Trasporti": [
        "Aerei",
        "Trasporto pubblico",
        "Taxi",
        "Viaggio di lavoro"
    ],
    "Cibo": [
        "Bar",
        "Ristorazione",
        "Spesa"
    ],
    "Casa": [
        "Assicurazione casa",
        "Utenze",
        "Manutenzione casa",
        "Mutuo",
        "Servizi casa"
    ],
    "Veicolo": [
        "Bollo",
        "Carburante",
        "Assicurazione veicolo",
        "Manutenzione veicolo",
        "Parcheggio"
    ],
    "Vita": [
        "Assistenza sanitaria adulti",
        "Cultura ed eventi",
        "Hobby",
        "Istruzione adulti",
        "Libri e abbonamenti",
        "Lotterie",
        "Sport adulti",
        "Tv",
        "Vacanze"
    ],
    "Computer": [
        "Internet",
        "Software",
        "Telefono",
        "Servizi postali"
    ],
    "Spese finanziarie": [
        "Lavoro Elisa",
        "Lavoro Mattia",
        "Commissioni",
        "Assicurazioni",
        "Multe",
        "Prestiti",
        "Tasse",
        "Consulenza"
    ],
    "Figli": [
        "Scuola",
        "Salute figli",
        "Spesa e utilita figli",
        "Sport e svago figli",
        "Vestiti e scarpe figli"
    ],
    "Entrate": [
        "Ricariche buoni pasto",
        "Dividendi",
        "Assegno unico",
        "Regali entrate",
        "Rimborsi",
        "Stipendio",
        "Personal Elisa",
        "Vendita"
    ],
    "Prelievo": [
        "Prelievo"
    ],
    "TRANSFER": [
        "TRANSFER",
        "Trasferisci, preleva"
    ]
}

MACRO_CATEGORIES = list(WALLET_TAXONOMY.keys())

# Build fast lookup dictionary: Subcategory -> Macro (and Macro -> Macro)
CATEGORY_TO_MACRO = {}
for macro, subs in WALLET_TAXONOMY.items():
    CATEGORY_TO_MACRO[macro.lower()] = macro
    for sub in subs:
        CATEGORY_TO_MACRO[sub.lower()] = macro


def get_macro_category(category_name: str, default: str = None) -> str:
    """
    Returns the associated Macro-Category for a given category name.
    If category_name is itself a Macro-Category, returns itself.
    If not found in the taxonomy, returns category_name (if valid) or default.
    """
    if not category_name:
        return default or "Altro"
    cat_clean = str(category_name).strip()
    return CATEGORY_TO_MACRO.get(cat_clean.lower(), default or cat_clean)


def get_taxonomy_hierarchy():
    """
    Returns a structured hierarchy useful for frontend UI select/optgroups:
    [
        {"macro": "Shopping", "subcategories": [...]},
        ...
    ]
    """
    return [
        {"macro": macro, "subcategories": subs}
        for macro, subs in WALLET_TAXONOMY.items()
    ]
