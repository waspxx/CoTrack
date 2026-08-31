/* -------------------------------------------------------------
   VEHICLE CLONE - CORE LOGIC (app.js)
   Handles State, CRUD, Math, Charts, Router, and Backups.
------------------------------------------------------------- */

// --- INITIAL STATE SEED DATA ---
const SEED_VEHICLES = [
    {
        id: "veh-panda-1",
        brand: "Fiat",
        model: "Panda Hybrid",
        type: "Auto",
        fuel: "Benzina",
        plate: "AB 123 CD",
        year: 2022,
        odometer: 10000, // Initial km
        tankSize: 38 // Liters
    },
    {
        id: "veh-ducati-2",
        brand: "Ducati",
        model: "Monster 821",
        type: "Moto",
        fuel: "Benzina",
        plate: "XY 987 ZW",
        year: 2021,
        odometer: 4500, // Initial km
        tankSize: 16.5 // Liters
    },
    {
        id: "veh-bike-3",
        brand: "Specialized",
        model: "Sirrus X",
        type: "Bicicletta",
        fuel: "Nessuno",
        plate: null,
        year: 2024,
        odometer: 0, // Initial km
        tankSize: null
    }
];

const SEED_ENTRIES = [
    // --- Fiat Panda Activities ---
    // Refuels
    {
        id: "ent-refuel-1",
        vehicleId: "veh-panda-1",
        type: "refuel",
        date: "2026-05-01",
        odometer: 10200,
        fuelType: "Benzina",
        liters: 28.5,
        priceUnit: 1.849,
        totalCost: 52.70,
        isFull: true,
        notes: "Pieno inaugurale"
    },
    {
        id: "ent-refuel-2",
        vehicleId: "veh-panda-1",
        type: "refuel",
        date: "2026-05-15",
        odometer: 10680,
        fuelType: "Benzina",
        liters: 30.2,
        priceUnit: 1.869,
        totalCost: 56.44,
        isFull: true,
        notes: "Autostrada per gita fuori porta"
    },
    {
        id: "ent-refuel-3",
        vehicleId: "veh-panda-1",
        type: "refuel",
        date: "2026-05-30",
        odometer: 11150,
        fuelType: "Benzina",
        liters: 29.1,
        priceUnit: 1.829,
        totalCost: 53.22,
        isFull: true,
        notes: "Prezzo in ribasso"
    },
    {
        id: "ent-refuel-4",
        vehicleId: "veh-panda-1",
        type: "refuel",
        date: "2026-06-12",
        odometer: 11660,
        fuelType: "Benzina",
        liters: 32.5,
        priceUnit: 1.889,
        totalCost: 61.39,
        isFull: true,
        notes: "Rifornimento in città"
    },
    {
        id: "ent-refuel-5",
        vehicleId: "veh-panda-1",
        type: "refuel",
        date: "2026-06-22",
        odometer: 12150,
        fuelType: "Benzina",
        liters: 30.8,
        priceUnit: 1.859,
        totalCost: 57.26,
        isFull: true,
        notes: "Ultimo rifornimento"
    },
    // Expenses
    {
        id: "ent-exp-1",
        vehicleId: "veh-panda-1",
        type: "expense",
        date: "2026-05-02",
        category: "Bollo",
        cost: 165.00,
        odometer: 10210,
        notes: "Tassa automobilistica regionale"
    },
    {
        id: "ent-exp-2",
        vehicleId: "veh-panda-1",
        type: "expense",
        date: "2026-05-20",
        category: "Lavaggio",
        cost: 12.00,
        odometer: 10800,
        notes: "Autolavaggio self-service"
    },
    {
        id: "ent-exp-3",
        vehicleId: "veh-panda-1",
        type: "expense",
        date: "2026-06-05",
        category: "Parcheggio",
        cost: 6.50,
        odometer: null,
        notes: "Parcheggio centro storico"
    },
    // Services
    {
        id: "ent-srv-1",
        vehicleId: "veh-panda-1",
        type: "service",
        date: "2026-05-10",
        odometer: 10500,
        description: "Cambio Olio",
        cost: 130.00,
        provider: "Autofficina Milano",
        notes: "Filtro olio e olio sintetico 5W30"
    },
    {
        id: "ent-srv-2",
        vehicleId: "veh-panda-1",
        type: "service",
        date: "2026-06-15",
        odometer: 11800,
        description: "Filtri",
        cost: 45.00,
        provider: "Fai da te",
        notes: "Sostituito filtro aria motore autonomamente"
    },
    // Income
    {
        id: "ent-inc-1",
        vehicleId: "veh-panda-1",
        type: "income",
        date: "2026-05-28",
        category: "Rimborso Spese",
        amount: 195.00,
        odometer: 11100,
        notes: "Rimborso chilometrico trasferta di lavoro"
    },
    {
        id: "ent-inc-2",
        vehicleId: "veh-panda-1",
        type: "income",
        date: "2026-06-18",
        category: "Rimborso Spese",
        amount: 120.00,
        odometer: 12050,
        notes: "Rimborso chilometrico trasferta"
    },
    // Routes
    {
        id: "ent-rt-1",
        vehicleId: "veh-panda-1",
        type: "route",
        date: "2026-05-25",
        startLocation: "Milano",
        endLocation: "Torino",
        distance: 142.5,
        purpose: "Lavoro",
        cost: 16.80, // Pedaggio autostrada
        notes: "Incontro con clienti"
    },
    // Reminders
    {
        id: "ent-rem-1",
        vehicleId: "veh-panda-1",
        type: "reminder",
        description: "Rinnovo Assicurazione RCA",
        triggerType: "date",
        targetDate: "2027-05-15",
        targetOdometer: null,
        notes: "Verificare preventivi un mese prima"
    },
    {
        id: "ent-rem-2",
        vehicleId: "veh-panda-1",
        type: "reminder",
        description: "Tagliando completo (20.000 km)",
        triggerType: "odometer",
        targetDate: null,
        targetOdometer: 20000,
        notes: "Cambio candele e check freni"
    },
    {
        id: "ent-rem-3",
        vehicleId: "veh-panda-1",
        type: "reminder",
        description: "Controllo pressione pneumatici",
        triggerType: "date",
        targetDate: "2026-06-01", // This is expired relative to current date (2026-06-22)
        targetOdometer: null,
        notes: "Controllo mensile"
    },

    // --- Ducati Monster Activities ---
    {
        id: "ent-refuel-ducati-1",
        vehicleId: "veh-ducati-2",
        type: "refuel",
        date: "2026-05-10",
        odometer: 4650,
        fuelType: "Benzina",
        liters: 12.4,
        priceUnit: 1.959,
        totalCost: 24.29,
        isFull: true,
        notes: "Primo pieno di stagione"
    },
    {
        id: "ent-refuel-ducati-2",
        vehicleId: "veh-ducati-2",
        type: "refuel",
        date: "2026-06-01",
        odometer: 4920,
        fuelType: "Benzina",
        liters: 13.0,
        priceUnit: 1.929,
        totalCost: 25.08,
        isFull: true,
        notes: "Giro del weekend sui passi"
    },
    {
        id: "ent-exp-ducati-1",
        vehicleId: "veh-ducati-2",
        type: "expense",
        date: "2026-05-12",
        category: "Assicurazione",
        cost: 280.00,
        odometer: null,
        notes: "Assicurazione moto semestrale"
    },
    // --- Specialized Sirrus X Activities (Bicycle) ---
    {
        id: "ent-route-bike-1",
        vehicleId: "veh-bike-3",
        type: "route",
        date: "2026-06-01",
        startLocation: "Casa",
        endLocation: "Parco Lambro",
        distance: 18.4,
        purpose: "Personale",
        cost: 0,
        notes: "Allenamento domenicale"
    },
    {
        id: "ent-route-bike-2",
        vehicleId: "veh-bike-3",
        type: "route",
        date: "2026-06-15",
        startLocation: "Casa",
        endLocation: "Ufficio Porta Nuova",
        distance: 7.2,
        purpose: "Lavoro",
        cost: 0,
        notes: "Andata al lavoro in bici"
    },
    {
        id: "ent-srv-bike-1",
        vehicleId: "veh-bike-3",
        type: "service",
        date: "2026-06-10",
        odometer: 25,
        description: "Altro",
        cost: 30.00,
        provider: "Ciclista Milano",
        notes: "Primo controllo gratuito, centratura ruota e ingrassaggio catena"
    },
    {
        id: "ent-rem-bike-1",
        vehicleId: "veh-bike-3",
        type: "reminder",
        description: "Controllo freni e pressione gomme",
        triggerType: "date",
        targetDate: "2026-07-22",
        targetOdometer: null,
        notes: "Manutenzione periodica ordinaria"
    }
];

// --- APP STATE ---
let state = {
    theme: 'light',
    activeVehicleId: null,
    vehicles: [],
    entries: [],
    dateFilter: 'all-time',
    customDateFrom: '',
    customDateTo: ''
};

// --- CHART INSTANCES (Global references to destroy before recreate) ---
let chartBreakdown = null;
let chartConsumption = null;
let chartBatteryCapacity = null;
let chartMonthlyByCategory = null;
let chartExpenseTypes = null;
let chartMaintenanceTypes = null;
let chartCostPerKm = null;
let chartAnnualKm = null;
let chartFleetAnnualKm = null;
let chartFleetAnnualExpenses = null;

// Categories currently active in the monthly-by-category filter
let activeCategoryFilters = null; // null means 'all'
let categoryChartPeriod = 'monthly'; // 'monthly' or 'annual'

// --- LOAD STATE FROM LOCALSTORAGE OR SEED ---
async function loadState() {
    if (typeof activeGarageId === 'undefined' || !activeGarageId || activeGarageId === 'null') {
        return;
    }
    try {
        const [responseVeh, responseEnt] = await Promise.all([
            fetch('/api/vehicles?garage_id=' + activeGarageId),
            fetch('/api/vehicle-entries?garage_id=' + activeGarageId)
        ]);
        
        const [vehicles, entries] = await Promise.all([
            responseVeh.json(),
            responseEnt.json()
        ]);
        
        state.vehicles = vehicles;
        state.entries = entries;

        // Active vehicle selection
        const savedActiveVeh = localStorage.getItem('vehicles_active_id');
        const activeVehicles = state.vehicles.filter(v => !v.archived);
        if (savedActiveVeh && state.vehicles.some(v => v.id === savedActiveVeh)) {
            state.activeVehicleId = savedActiveVeh;
        } else if (activeVehicles.length > 0) {
            state.activeVehicleId = activeVehicles[0].id;
        } else if (state.vehicles.length > 0) {
            state.activeVehicleId = state.vehicles[0].id;
        } else {
            state.activeVehicleId = null;
        }
    } catch (e) {
        console.error("Error loading state from server", e);
        state.vehicles = [];
        state.entries = [];
        state.activeVehicleId = null;
    }
    
    // Theme preference remains in localStorage
    state.theme = localStorage.getItem('vehicles_theme') || 'light';
    applyTheme(state.theme);
}

function saveState() {
    if (state.activeVehicleId) {
        localStorage.setItem('vehicles_active_id', state.activeVehicleId);
    }
}

async function useSeedData() {
    try {
        await fetch('/api/vehicles/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ garage_id: activeGarageId }) });
        await loadState();
    } catch (e) {
        console.error(e);
    }
}

async function refreshData() {
    await loadState();
    populateVehicleSelectors();
    checkReminders();
    router();
}

// --- DOM ELEMENT REFERENCES ---
const elActiveVehicleSelect = document.getElementById('active-vehicle-select');
const elActiveVehicleSelectMobile = document.getElementById('active-vehicle-select-mobile');
const elAddVehicleQuickBtn = document.getElementById('add-vehicle-quick-btn');
const elThemeToggle = document.getElementById('theme-toggle');
const elThemeText = document.getElementById('theme-text');
const elMobileAddBtn = document.getElementById('mobile-add-btn');
const elHeaderAddBtn = document.getElementById('header-add-btn');

// Modals
const elActivityModal = document.getElementById('activity-modal');
const elActivityForm = document.getElementById('activity-form');
const elModalTitle = document.getElementById('modal-title');
const elModalCloseBtn = document.getElementById('modal-close-btn');
const elModalCancelBtn = document.getElementById('modal-cancel-btn');
const elModalTypeContainer = document.getElementById('modal-type-selector-container');
const elModalTypeButtons = document.querySelectorAll('.type-sel-btn');

const elVehicleModal = document.getElementById('vehicle-modal');
const elVehicleForm = document.getElementById('vehicle-form');
const elVehicleModalTitle = document.getElementById('vehicle-modal-title');
const elVehicleModalCloseBtn = document.getElementById('vehicle-modal-close-btn');
const elVehicleModalCancelBtn = document.getElementById('vehicle-modal-cancel-btn');
const elAddVehicleBtn = document.getElementById('add-vehicle-btn');

// --- THEME MANAGEMENT ---
function applyTheme(theme) {
    const tabVeicoli = document.getElementById('tab-veicoli');
    const tabPrestiti = document.getElementById('tab-prestiti');
    
    const tabStipendi   = document.getElementById('tab-stipendi');
    const tabFondoP     = document.getElementById('tab-fondopensione');

    if (theme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        [tabVeicoli, tabPrestiti, tabStipendi, tabFondoP].forEach(t => { if(t){ t.classList.remove('dark-theme'); t.classList.add('light-theme'); } });
        if (elThemeText) elThemeText.textContent = 'Tema Scuro';
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        [tabVeicoli, tabPrestiti, tabStipendi, tabFondoP].forEach(t => { if(t){ t.classList.remove('light-theme'); t.classList.add('dark-theme'); } });
        if (elThemeText) elThemeText.textContent = 'Tema Chiaro';
    }
}

if (elThemeToggle) {
    elThemeToggle.addEventListener('click', () => {
        state.theme = (state.theme === 'dark') ? 'light' : 'dark';
        applyTheme(state.theme);
        saveState();
        // Re-render charts with correct typography/border colors for light/dark theme
        renderCharts();
        if (typeof window.refreshLoanUI === 'function') {
            window.refreshLoanUI();
        }
    });
}

// --- ROUTER (SPA navigation via URL hashes) ---
function router() {
    const hash = window.location.hash || '#dashboard';
    let tabName = hash.replace('#', '');
    
    // Se l'hash corrisponde a uno degli altri tab principali di CoTrack, interrompe l'esecuzione del router dei veicoli.
    const mainTabs = ['investments', 'investimenti', 'wallet', 'bills', 'bollette'];
    if (mainTabs.includes(tabName)) {
        return;
    }
    
    // Se l'hash è il tab principale veicoli, mostra di default la dashboard interna.
    if (tabName === 'vehicles' || tabName === 'veicoli') {
        tabName = 'dashboard';
    }
    
    // Adjust UI depending on active vehicle type (e.g. bicycle vs motor vehicles)
    const veh = getActiveVehicle();
    const isBicycle = veh && veh.type === 'Bicicletta' && veh.fuel !== 'Elettrico';
    
    if (tabName === 'refuel' && isBicycle) {
        window.location.hash = '#dashboard';
        return;
    }
    
    adjustUIForActiveVehicle();
    
    // Hide all sections
    const tabs = document.querySelectorAll('#tab-veicoli section.tab-content');
    tabs.forEach(t => t.classList.remove('active-tab'));
    
    // Show target section
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) {
        targetTab.classList.add('active-tab');
    }
    
    // Update active nav links (sidebar & bottom bar)
    const sidebarLinks = document.querySelectorAll('#tab-veicoli .sidebar-nav .nav-link');
    sidebarLinks.forEach(l => {
        if (l.getAttribute('data-tab') === tabName) {
            l.classList.add('active');
        } else {
            l.classList.remove('active');
        }
    });

    const bottomLinks = document.querySelectorAll('#tab-veicoli .bottom-nav .bottom-nav-link');
    bottomLinks.forEach(l => {
        if (l.getAttribute('data-tab') === tabName) {
            l.classList.add('active');
        } else {
            l.classList.remove('active');
        }
    });
    
    // Update headers and page subtext
    const elPageTitle = document.getElementById('page-title');
    const elPageSubtitle = document.getElementById('page-subtitle');
    
    const pageDetails = {
        dashboard: { title: "Dashboard", sub: "Statistiche e riassunto del tuo veicolo." },
        timeline: { title: "Cronologia Attività", sub: "Storico completo degli inserimenti." },
        refuel: { title: "Rifornimenti", sub: "Consumi e spese di carburante nel dettaglio." },
        expenses: { title: "Spese Veicolo", sub: "Tracciamento delle spese fisse e variabili." },
        income: { title: "Entrate", sub: "Gestione dei profitti generati con il veicolo." },
        services: { title: "Manutenzioni & Tagliandi", sub: "Storico delle manutenzioni eseguite sul mezzo." },
        reminders: { title: "Scadenze", sub: "Avvisi preventivi per non dimenticare nulla." },
        reports: { title: "Grafici & Report", sub: "Analisi dei costi e andamenti temporali." },
        garage: { title: "Gestione Veicoli", sub: "Aggiungi, modifica o rimuovi i tuoi veicoli." },
        'config-maint': { title: "Configurazione Manutenzioni", sub: "Gestione dei ricambi e lavori possibili." },
        'config-expense': { title: "Configurazione Spese", sub: "Gestione delle categorie spese del veicolo." },
        'config-income': { title: "Configurazione Entrate", sub: "Gestione delle categorie entrate del veicolo." }
    };
    
    if (pageDetails[tabName]) {
        elPageTitle.textContent = pageDetails[tabName].title;
        elPageSubtitle.textContent = pageDetails[tabName].sub;
    }
    
    // Run page specific loaders
    if (tabName === 'dashboard') {
        renderDashboard();
    } else if (tabName === 'timeline') {
        renderTimeline();
    } else if (tabName === 'refuel') {
        renderRefuelsTable();
    } else if (tabName === 'expenses') {
        renderExpensesTable();
    } else if (tabName === 'income') {
        renderIncomeTable();
    } else if (tabName === 'services') {
        renderServicesTable();
    } else if (tabName === 'reminders') {
        renderReminders();
    } else if (tabName === 'reports') {
        renderCharts();
    } else if (tabName === 'garage') {
        renderVehiclesTab();
    } else if (tabName === 'config-maint') {
        window.renderConfigList('maint');
    } else if (tabName === 'config-expense') {
        window.renderConfigList('expense');
    } else if (tabName === 'config-income') {
        window.renderConfigList('income');
    }
}

// Enable clicking helper function
function showTab(tabName) {
    window.location.hash = `#${tabName}`;
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', async () => {
    // If activeGarageId is not set yet, we will rely on CoTrack's app.js calling caricaGarages()
    if (typeof activeGarageId !== 'undefined' && activeGarageId) {
        await loadState();
        populateVehicleSelectors();
        checkReminders();
        router();
    }
    
    // Dynamic fields for Bicicletta type and electric battery specifications
    const selectVType = document.getElementById('v-type');
    const selectVFuel = document.getElementById('v-fuel');
    const inputVTank = document.getElementById('v-tank-size');
    const inputAh = document.getElementById('v-battery-amp-hours');
    const inputV = document.getElementById('v-battery-voltage');
    const inputCap = document.getElementById('v-battery-capacity');
    const selectUnit = document.getElementById('v-battery-unit');
    
    window.toggleVehicleFields = function() {
        if (!selectVType || !selectVFuel || !inputVTank) return;
        const fuelOptions = selectVFuel.querySelectorAll('option');
        const isBicycle = selectVType.value === 'Bicicletta';
        
        if (isBicycle) {
            // For Bicycles, only allow Elettrico or Nessuno
            fuelOptions.forEach(opt => {
                if (opt.value === 'Nessuno' || opt.value === 'Elettrico') {
                    opt.style.display = 'block';
                } else {
                    opt.style.display = 'none';
                }
            });
            if (selectVFuel.value !== 'Nessuno' && selectVFuel.value !== 'Elettrico') {
                selectVFuel.value = 'Nessuno';
            }
        } else {
            // For other vehicles, show all except Nessuno
            fuelOptions.forEach(opt => {
                if (opt.value === 'Nessuno') {
                    opt.style.display = 'none';
                } else {
                    opt.style.display = 'block';
                }
            });
            if (selectVFuel.value === 'Nessuno') {
                selectVFuel.value = 'Benzina';
            }
        }
        
        const batterySec = document.getElementById('v-battery-section');
        const batteryCalcSec = document.getElementById('v-battery-calc-section');
        
        if (selectVFuel.value === 'Elettrico') {
            if (batterySec) batterySec.style.display = 'flex';
            if (batteryCalcSec) batteryCalcSec.style.display = 'flex';
            inputVTank.value = '';
            inputVTank.disabled = true;
            if (inputVTank.parentElement) inputVTank.parentElement.style.display = 'none';
        } else {
            if (batterySec) batterySec.style.display = 'none';
            if (batteryCalcSec) batteryCalcSec.style.display = 'none';
            inputVTank.disabled = isBicycle;
            if (inputVTank.parentElement) {
                inputVTank.parentElement.style.display = isBicycle ? 'none' : 'block';
            }
        }
    };
    
    window.calcCapacityFromAhV = function() {
        if (!inputAh || !inputV || !inputCap || !selectUnit) return;
        const ah = parseFloat(inputAh.value) || 0;
        const v = parseFloat(inputV.value) || 0;
        if (ah > 0 && v > 0) {
            inputCap.value = (ah * v).toFixed(1);
            selectUnit.value = 'Wh';
        }
    };
    
    if (selectVType) selectVType.addEventListener('change', window.toggleVehicleFields);
    if (selectVFuel) selectVFuel.addEventListener('change', window.toggleVehicleFields);
    if (inputAh) inputAh.addEventListener('input', window.calcCapacityFromAhV);
    if (inputV) inputV.addEventListener('input', window.calcCapacityFromAhV);
    
    // Real time fueling form volume calculation (volume calculated automatically, total cost mandatory)
    const inputLiters = document.getElementById('f-liters');
    const inputPrice = document.getElementById('f-price-unit');
    const inputTotal = document.getElementById('f-total-cost');
    const inputBatteryStart = document.getElementById('f-battery-start');
    const inputBatteryEnd = document.getElementById('f-battery-end');
    
    function calcVolume() {
        const fuelType = document.getElementById('f-fuel-type').value;
        const activeVeh = getActiveVehicle();
        const t = parseFloat(inputTotal.value) || 0;
        const p = parseFloat(inputPrice.value) || 0;
        
        let capacity = activeVeh ? parseFloat(activeVeh.batteryCapacity) : 0;
        let capUnit = activeVeh ? activeVeh.batteryCapacityUnit || 'Wh' : 'Wh';
        
        const entryId = document.getElementById('entry-id').value;
        if (entryId) {
            const entry = state.entries.find(e => e.id === entryId);
            if (entry && entry.batteryCapacity) {
                capacity = parseFloat(entry.batteryCapacity);
                capUnit = entry.batteryCapacityUnit || 'Wh';
            }
        }
        
        if (fuelType === 'Elettrico' && capacity > 0) {
            const start = parseFloat(inputBatteryStart.value);
            const end = parseFloat(inputBatteryEnd.value);
            if (!isNaN(start) && !isNaN(end) && end > start) {
                let volume = capacity * (end - start) / 100;
                if (capUnit === 'Wh') volume = volume / 1000; // Wh to kWh
                
                inputLiters.value = volume.toFixed(3);
                
                if (document.activeElement === inputTotal && t > 0) {
                    inputPrice.value = (t / volume).toFixed(3);
                } else if (document.activeElement === inputPrice && p > 0) {
                    inputTotal.value = (volume * p).toFixed(2);
                } else if (p > 0) {
                    inputTotal.value = (volume * p).toFixed(2);
                }
                return;
            }
        }
        
        if (t > 0 && p > 0) {
            inputLiters.value = (t / p).toFixed(2);
        } else {
            inputLiters.value = '';
        }
    }
    
    inputTotal.addEventListener('input', calcVolume);
    inputPrice.addEventListener('input', calcVolume);
    if (inputBatteryStart) inputBatteryStart.addEventListener('input', calcVolume);
    if (inputBatteryEnd) inputBatteryEnd.addEventListener('input', calcVolume);
    
    // Fuel type change listener for unit updates
    const selectFFuel = document.getElementById('f-fuel-type');
    if (selectFFuel) {
        selectFFuel.addEventListener('change', () => {
            window.updateRefuelLabels();
            calcVolume();
        });
    }

    // Reminder fields trigger type change listener and is-recurring change listener
    const selectRemTrigger = document.getElementById('rem-trigger-type');
    if (selectRemTrigger) {
        selectRemTrigger.addEventListener('change', () => {
            window.updateReminderRequiredFields();
            window.updateReminderRecurrenceFields();
        });
    }
    const selectRemIsRec = document.getElementById('rem-is-recurring');
    if (selectRemIsRec) {
        selectRemIsRec.addEventListener('change', () => {
            window.updateReminderRequiredFields();
            window.updateReminderRecurrenceFields();
        });
    }
    const inputRemDate = document.getElementById('rem-date');
    if (inputRemDate) {
        inputRemDate.addEventListener('input', () => {
            window.updateReminderNextDate();
        });
    }
    const inputRemRecVal = document.getElementById('rem-recurrence-val');
    if (inputRemRecVal) {
        inputRemRecVal.addEventListener('input', () => {
            window.updateReminderNextDate();
        });
    }
    const selectRemRecUnit = document.getElementById('rem-recurrence-unit');
    if (selectRemRecUnit) {
        selectRemRecUnit.addEventListener('change', () => {
            window.updateReminderNextDate();
        });
    }
});

// --- VEHICLE POPULATION & SYNCS ---
function populateVehicleSelectors() {
    elActiveVehicleSelect.innerHTML = '';
    elActiveVehicleSelectMobile.innerHTML = '';
    
    // Sort: non-archived first
    const activeVehicles = state.vehicles.filter(v => !v.archived);
    const archivedVehicles = state.vehicles.filter(v => v.archived);
    
    const addOpt = (v) => {
        const name = `${v.brand} ${v.model}${v.archived ? ' (Archiviato)' : ''}`;
        
        const opt1 = document.createElement('option');
        opt1.value = v.id;
        opt1.textContent = name;
        if (v.id === state.activeVehicleId) opt1.selected = true;
        elActiveVehicleSelect.appendChild(opt1);
        
        const opt2 = document.createElement('option');
        opt2.value = v.id;
        opt2.textContent = name;
        if (v.id === state.activeVehicleId) opt2.selected = true;
        elActiveVehicleSelectMobile.appendChild(opt2);
    };
    
    activeVehicles.forEach(addOpt);
    archivedVehicles.forEach(addOpt);
}

function handleVehicleChange(e) {
    const val = e.target.value;
    state.activeVehicleId = val;
    // Sync both selects
    elActiveVehicleSelect.value = val;
    elActiveVehicleSelectMobile.value = val;
    
    localStorage.setItem('vehicles_active_id', val);
    checkReminders();
    
    // Reload active tab
    router();
}

elActiveVehicleSelect.addEventListener('change', handleVehicleChange);
elActiveVehicleSelectMobile.addEventListener('change', handleVehicleChange);

// --- PERIOD FILTER EVENT LISTENERS ---
const elPeriodFilterSelect = document.getElementById('period-filter-select');
const elCustomDateInputs = document.getElementById('custom-date-inputs');
const elFilterDateFrom = document.getElementById('filter-date-from');
const elFilterDateTo = document.getElementById('filter-date-to');

if (elPeriodFilterSelect) {
    elPeriodFilterSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        state.dateFilter = val;
        
        // Show/hide custom date inputs
        if (val === 'custom') {
            elCustomDateInputs.classList.remove('hidden');
        } else {
            elCustomDateInputs.classList.add('hidden');
        }
        
        // Re-render
        router();
    });
}

if (elFilterDateFrom) {
    elFilterDateFrom.addEventListener('change', (e) => {
        state.customDateFrom = e.target.value;
        router();
    });
}

if (elFilterDateTo) {
    elFilterDateTo.addEventListener('change', (e) => {
        state.customDateTo = e.target.value;
        router();
    });
}


// --- HELPER MATH FUNCTIONS ---
function adjustUIForActiveVehicle() {
    const veh = getActiveVehicle();
    if (!veh) return;

    const isBicycle = veh.type === 'Bicicletta' && veh.fuel !== 'Elettrico';
    const isElectric = veh.fuel === 'Elettrico';
    const lang = document.documentElement.lang || 'it';

    // 1. Hide/show navigation links
    const navRefuel = document.getElementById('nav-refuel');
    if (navRefuel) {
        navRefuel.style.display = isBicycle ? 'none' : 'flex';
        const labelSpan = navRefuel.querySelector('span');
        if (labelSpan) {
            if (isElectric) {
                labelSpan.textContent = lang === 'it' ? 'Ricariche' : 'Charging';
            } else {
                labelSpan.textContent = lang === 'it' ? 'Rifornimenti' : 'Refuelings';
            }
        }
    }

    // 2. Hide/show refuel in modals
    const modalTypeRefuelBtn = document.querySelector('.type-sel-btn[data-type="refuel"]');
    if (modalTypeRefuelBtn) {
        modalTypeRefuelBtn.style.display = isBicycle ? 'none' : 'block';
        if (isElectric) {
            modalTypeRefuelBtn.textContent = lang === 'it' ? 'Ricarica' : 'Charge';
        } else {
            modalTypeRefuelBtn.textContent = lang === 'it' ? 'Rifornimento' : 'Refueling';
        }
    }

    // 3. Hide/show refuel button in quick action card
    const quickRefuelBtn = document.querySelector('.quick-action-btn.r-fuel');
    if (quickRefuelBtn) {
        quickRefuelBtn.style.display = isBicycle ? 'none' : 'flex';
        const labelSpan = quickRefuelBtn.querySelector('.btn-label');
        if (labelSpan) {
            if (isElectric) {
                labelSpan.textContent = lang === 'it' ? 'Ricarica' : 'Charge';
            } else {
                labelSpan.textContent = lang === 'it' ? 'Rifornimento' : 'Refueling';
            }
        }
    }

    // 4. Hide/show fuel consumption stat card
    const fuelStatCard = document.querySelector('.stat-card.fuel-consumption');
    if (fuelStatCard) {
        fuelStatCard.style.display = isBicycle ? 'none' : 'flex';
        const labelH4 = fuelStatCard.querySelector('h4');
        if (labelH4) {
            if (isElectric) {
                labelH4.textContent = lang === 'it' ? 'Consumo Medio Elettrico' : 'Average Electricity Cons.';
            } else {
                labelH4.textContent = lang === 'it' ? 'Consumo Medio Carburante' : 'Average Fuel Consumption';
            }
        }
    }

    // 5. Hide/show fuel charts card wrappers in reports
    const reportCardConsumption = document.getElementById('report-card-fuel-consumption');
    const reportCardPrices = document.getElementById('report-card-fuel-prices');
    const reportCardBattery = document.getElementById('report-card-battery-capacity');
    
    if (reportCardConsumption) {
        reportCardConsumption.style.display = isBicycle ? 'none' : 'flex';
        const titleH3 = reportCardConsumption.querySelector('h3');
        if (titleH3) {
            if (isElectric) {
                titleH3.textContent = lang === 'it' ? 'Andamento Consumo Energia' : 'Energy Consumption Trend';
            } else {
                titleH3.textContent = lang === 'it' ? 'Andamento Consumo Carburante' : 'Fuel Consumption Trend';
            }
        }
    }
    if (reportCardPrices) {
        reportCardPrices.style.display = isBicycle ? 'none' : 'flex';
    }
    if (reportCardBattery) {
        reportCardBattery.style.display = isElectric ? 'flex' : 'none';
    }
}

function getActiveVehicle() {
    return state.vehicles.find(v => v.id === state.activeVehicleId) || state.vehicles[0];
}

// Find highest odometer input for the active vehicle
function getCurrentOdometer(vehicleId, ignoreFilter = false) {
    const veh = state.vehicles.find(v => v.id === vehicleId);
    if (!veh) return 0;
    
    let maxOdo = veh.odometer; // Start with initial odometer
    
    const entriesToUse = ignoreFilter ? state.entries : getFilteredEntries();
    const activeEntries = entriesToUse.filter(e => e.vehicleId === vehicleId && e.odometer);
    activeEntries.forEach(e => {
        const val = parseInt(e.odometer);
        if (val > maxOdo) {
            maxOdo = val;
        }
    });
    
    return maxOdo;
}

// Calculate Statistics
function getPeriodDateRange(period, customFrom, customTo) {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    
    let startDate = null;
    let endDate = null;
    
    switch (period) {
        case 'current-month': {
            const start = new Date(y, m, 1);
            const end = new Date(y, m + 1, 0);
            startDate = formatDateLocal(start);
            endDate = formatDateLocal(end);
            break;
        }
        case 'previous-month': {
            const start = new Date(y, m - 1, 1);
            const end = new Date(y, m, 0);
            startDate = formatDateLocal(start);
            endDate = formatDateLocal(end);
            break;
        }
        case 'last-month': {
            const start = new Date(y, m, d - 30);
            const end = today;
            startDate = formatDateLocal(start);
            endDate = formatDateLocal(end);
            break;
        }
        case 'last-3-months': {
            const start = new Date(y, m - 3, d);
            const end = today;
            startDate = formatDateLocal(start);
            endDate = formatDateLocal(end);
            break;
        }
        case 'last-6-months': {
            const start = new Date(y, m - 6, d);
            const end = today;
            startDate = formatDateLocal(start);
            endDate = formatDateLocal(end);
            break;
        }
        case 'last-year': {
            const start = new Date(y - 1, m, d);
            const end = today;
            startDate = formatDateLocal(start);
            endDate = formatDateLocal(end);
            break;
        }
        case 'custom': {
            startDate = customFrom || null;
            endDate = customTo || null;
            break;
        }
        case 'all-time':
        default:
            startDate = null;
            endDate = null;
            break;
    }
    return { startDate, endDate };
}

function formatDateLocal(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getFilteredEntries() {
    const filter = state.dateFilter || 'all-time';
    if (filter === 'all-time') {
        return state.entries;
    }
    const { startDate, endDate } = getPeriodDateRange(filter, state.customDateFrom, state.customDateTo);
    return state.entries.filter(e => {
        if (e.type === 'reminder') {
            return true;
        }
        if (!e.date) {
            return true;
        }
        if (startDate && e.date < startDate) {
            return false;
        }
        if (endDate && e.date > endDate) {
            return false;
        }
        return true;
    });
}

function getStats() {
    const vId = state.activeVehicleId;
    const veh = getActiveVehicle();
    if (!veh) return { totalSpent: 0, costKm: 0, fuelAvg: 0, balance: 0, totalDist: 0 };
    
    const vEntries = getFilteredEntries().filter(e => e.vehicleId === vId);
    
    // Sum spent
    let refuelCost = 0;
    let expenseCost = 0;
    let serviceCost = 0;
    vEntries.forEach(e => {
        if (e.type === 'refuel') refuelCost += parseFloat(e.totalCost) || 0;
        else if (e.type === 'expense') expenseCost += parseFloat(e.cost) || 0;
        else if (e.type === 'service') serviceCost += parseFloat(e.cost) || 0;
    });
    
    const totalSpent = refuelCost + expenseCost + serviceCost;
    
    // Odometer diff for period
    let totalDist = 0;
    if (state.dateFilter === 'all-time') {
        const startOdo = veh.odometer;
        const currentOdo = getCurrentOdometer(vId, true);
        totalDist = currentOdo - startOdo;
        
        // Fallback: Se la distanza è <= 0 a causa del fatto che veh.odometer è stato aggiornato dal backend,
        // calcoliamo la differenza tra l'odometro massimo e minimo presenti nei record del veicolo.
        if (totalDist <= 0) {
            const odometers = vEntries.filter(e => e.odometer).map(e => parseInt(e.odometer));
            if (odometers.length > 0) {
                const minOdo = Math.min(...odometers);
                const maxOdo = Math.max(...odometers);
                totalDist = maxOdo - minOdo;
            }
        }
    } else {
        const odometers = vEntries.filter(e => e.odometer).map(e => parseInt(e.odometer));
        if (odometers.length > 0) {
            const minOdo = Math.min(...odometers);
            const maxOdo = Math.max(...odometers);
            totalDist = maxOdo - minOdo;
        } else {
            totalDist = 0;
        }
    }
    
    // Cost per km
    const costKm = totalDist > 0 ? (totalSpent / totalDist) : 0;
    
    // Fuel consumption (calculated with consecutive full fuelings)
    const refuels = vEntries
        .filter(e => e.type === 'refuel')
        .sort((a, b) => parseInt(a.odometer) - parseInt(b.odometer));
        
    let fuelDistSum = 0;
    let fuelLitersSum = 0;
    
    for (let i = 1; i < refuels.length; i++) {
        const cur = refuels[i];
        const prev = refuels[i - 1];
        
        // Calculate consumption only if both were full refuels
        // Calculate consumption only if both were full refuels and there was no missed previous refueling
        if (cur.isFull && prev.isFull && !cur.missedPrevious) {
            const dist = parseInt(cur.odometer) - parseInt(prev.odometer);
            if (dist > 0) {
                fuelDistSum += dist;
                fuelLitersSum += parseFloat(cur.liters);
            }
        }
    }
    
    const fuelAvgKmL = fuelLitersSum > 0 ? (fuelDistSum / fuelLitersSum) : 0;
    const fuelAvgL100 = fuelDistSum > 0 ? ((fuelLitersSum / fuelDistSum) * 100) : 0;
    
    // Net income/balance
    let totalIncome = 0;
    vEntries.filter(e => e.type === 'income').forEach(e => {
        totalIncome += parseFloat(e.amount) || 0;
    });
    
    const balance = totalIncome - totalSpent;
    
    return {
        totalSpent,
        costKm,
        fuelAvgKmL,
        fuelAvgL100,
        balance,
        totalDist,
        totalIncome
    };
}

// Reminders Expiry Check
function checkReminders() {
    const nowStr = new Date().toISOString().split('T')[0];
    let activeExpiredCount = 0;
    
    state.entries.forEach(e => {
        if (e.type === 'reminder') {
            const curOdo = getCurrentOdometer(e.vehicleId, true);
            let isExpired = false;
            
            const effectiveDate = (e.isRecurring && e.nextTargetDate) ? e.nextTargetDate : e.targetDate;
            if (e.triggerType === 'date' && effectiveDate) {
                isExpired = (effectiveDate < nowStr);
            } else if (e.triggerType === 'odometer' && e.targetOdometer) {
                isExpired = (curOdo >= parseInt(e.targetOdometer));
            } else if (e.triggerType === 'both') {
                const dateExp = effectiveDate ? (effectiveDate < nowStr) : false;
                const odoExp = e.targetOdometer ? (curOdo >= parseInt(e.targetOdometer)) : false;
                isExpired = (dateExp || odoExp);
            }
            
            // Inject dynamic flag
            e._isExpired = isExpired;
            
            if (isExpired && e.vehicleId === state.activeVehicleId) {
                activeExpiredCount++;
            }
        }
    });
    
    // Update layout badges
    const badge = document.getElementById('reminders-count-badge');
    const badgeMobile = document.getElementById('reminders-count-badge-mobile');
    
    if (activeExpiredCount > 0) {
        badge.textContent = activeExpiredCount;
        badge.classList.remove('hidden');
        badgeMobile.textContent = activeExpiredCount;
        badgeMobile.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
        badgeMobile.classList.add('hidden');
    }
}

// --- RENDERING VIEWS ---

// 1. DASHBOARD
function renderDashboard() {
    const veh = getActiveVehicle();
    if (!veh) return;
    
    // Update Header active vehicle summary card
    document.getElementById('dash-veh-name').textContent = `${veh.brand} ${veh.model}`;
    document.getElementById('dash-veh-plate').textContent = veh.plate || "SENZA TARGA";
    document.getElementById('dash-veh-type-badge').textContent = veh.type.toUpperCase();
    
    const curOdo = getCurrentOdometer(veh.id, true);
    document.getElementById('dash-veh-odometer').textContent = `${curOdo.toLocaleString('it-IT')} km`;
    
    // Calculate stats
    const stats = getStats();
    
    document.getElementById('dash-stat-total-spent').textContent = `€ ${stats.totalSpent.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('dash-stat-cost-km').textContent = `€ ${stats.costKm.toFixed(3)} / km`;
    document.getElementById('dash-stat-total-dist').textContent = `Distanza: ${stats.totalDist.toLocaleString('it-IT')} km`;
    
    let primaryUnit = 'km / L';
    let altUnit = 'L/100km';
    if (veh.fuel === 'Metano') {
        primaryUnit = 'km / kg';
        altUnit = 'kg/100km';
    } else if (veh.fuel === 'Elettrico') {
        primaryUnit = 'km / kWh';
        altUnit = 'kWh/100km';
    }
    
    if (stats.fuelAvgKmL > 0) {
        document.getElementById('dash-stat-fuel-avg').textContent = `${stats.fuelAvgKmL.toFixed(2)} ${primaryUnit}`;
        document.getElementById('dash-stat-fuel-avg-alt').textContent = `${stats.fuelAvgL100.toFixed(2)} ${altUnit}`;
    } else {
        document.getElementById('dash-stat-fuel-avg').textContent = `--- ${primaryUnit}`;
        document.getElementById('dash-stat-fuel-avg-alt').textContent = `Fai 2 pieni per calcolare`;
    }
    
    const balEl = document.getElementById('dash-stat-balance');
    balEl.textContent = `€ ${stats.balance.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (stats.balance >= 0) {
        balEl.style.color = 'var(--color-income)';
    } else {
        balEl.style.color = 'var(--danger-color)';
    }
    document.getElementById('dash-stat-income-total').textContent = `Entrate: € ${stats.totalIncome.toLocaleString('it-IT', {minimumFractionDigits: 2})}`;
    
    // Render Recent Activities (Limit to 5)
    const vEntries = getFilteredEntries()
        .filter(e => e.vehicleId === veh.id && e.type !== 'reminder')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
        
    const actList = document.getElementById('dash-activity-list');
    actList.innerHTML = '';
    
    if (vEntries.length === 0) {
        actList.innerHTML = `<div class="no-data">${window.Translations.noActivitiesRegistered || 'No activities registered. Click on "Add" to start.'}</div>`;
    } else {
        vEntries.forEach(e => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            
            let iconText = '';
            let typeColorClass = '';
            let title = '';
            let amount = '';
            let details = '';
            
            if (e.type === 'refuel') {
                iconText = 'F';
                typeColorClass = 'bg-fuel';
                title = `Rifornimento ${e.fuelType}`;
                amount = `- € ${parseFloat(e.totalCost).toFixed(2)}`;
                let unit = 'Litri';
                let priceUnit = '/L';
                if (e.fuelType === 'Metano') {
                    unit = 'kg';
                    priceUnit = '/kg';
                } else if (e.fuelType === 'Elettrico') {
                    unit = 'kWh';
                    priceUnit = '/kWh';
                }
                details = `${e.liters} ${unit} @ € ${parseFloat(e.priceUnit).toFixed(3)}${priceUnit} - Odo: ${parseInt(e.odometer).toLocaleString('it-IT')} km`;
            } else if (e.type === 'expense') {
                iconText = 'S';
                typeColorClass = 'bg-expense';
                title = `${e.category}`;
                amount = `- € ${parseFloat(e.cost).toFixed(2)}`;
                details = `Spesa generica${e.odometer ? ` - Odo: ${parseInt(e.odometer).toLocaleString('it-IT')} km` : ''}`;
            } else if (e.type === 'service') {
                iconText = 'M';
                typeColorClass = 'bg-service';
                title = window.formatDescription(e.description);
                amount = `- € ${parseFloat(e.cost).toFixed(2)}`;
                details = `Manutenzione${e.provider ? ` presso ${e.provider}` : ''} - Odo: ${parseInt(e.odometer).toLocaleString('it-IT')} km`;
            } else if (e.type === 'income') {
                iconText = 'E';
                typeColorClass = 'bg-income';
                title = `${e.category}`;
                amount = `+ € ${parseFloat(e.amount).toFixed(2)}`;
                details = `Guadagno extra${e.odometer ? ` - Odo: ${parseInt(e.odometer).toLocaleString('it-IT')} km` : ''}`;
            }
            
            item.innerHTML = `
                <div class="activity-item-left">
                    <div class="activity-type-icon ${typeColorClass}">${iconText}</div>
                    <div class="activity-info">
                        <span class="activity-title">${title}</span>
                        <span class="activity-meta">${formatDate(e.date)} ${e.notes ? `• ${e.notes}` : ''}</span>
                    </div>
                </div>
                <div class="activity-item-right">
                    <span class="activity-amount ${e.type === 'income' ? 'income-amount' : ''}">${amount}</span>
                    <span class="activity-meta">${details}</span>
                </div>
            `;
            actList.appendChild(item);
        });
    }
    
    // Render Upcoming/Active Reminders
    const vReminders = state.entries
        .filter(e => e.type === 'reminder' && e.vehicleId === veh.id)
        .sort((a, b) => (a._isExpired === b._isExpired) ? 0 : a._isExpired ? -1 : 1) // Expired first
        .slice(0, 4);
        
    const remList = document.getElementById('dash-reminders-list');
    remList.innerHTML = '';
    
    if (vReminders.length === 0) {
        remList.innerHTML = `<div class="no-data">${window.Translations.noActiveReminders || 'No active reminders.'}</div>`;
    } else {
        vReminders.forEach(r => {
            const item = document.createElement('div');
            item.className = `reminder-summary-item ${r._isExpired ? 'urgent' : ''}`;
            
            let triggerText = '';
            const effectiveDate = (r.isRecurring && r.nextTargetDate) ? r.nextTargetDate : r.targetDate;
            if (r.triggerType === 'date') {
                triggerText = `Entro il ${formatDate(effectiveDate)}`;
            } else if (r.triggerType === 'odometer') {
                triggerText = `Ai ${parseInt(r.targetOdometer).toLocaleString('it-IT')} km`;
            } else {
                triggerText = `Entro il ${formatDate(effectiveDate)} o ai ${parseInt(r.targetOdometer).toLocaleString('it-IT')} km`;
            }
            
            let daysLeftText = '';
            if (r.triggerType === 'date' || r.triggerType === 'both') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const target = new Date(effectiveDate);
                target.setHours(0, 0, 0, 0);
                const diffTime = target - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > 0) {
                    daysLeftText = `${diffDays} gg rimasti`;
                } else if (diffDays === 0) {
                    daysLeftText = `Scade oggi!`;
                } else {
                    daysLeftText = `Scaduto (${Math.abs(diffDays)} gg)`;
                }
            }
            
            let kmLeftText = '';
            if (r.triggerType === 'odometer' || r.triggerType === 'both') {
                const curOdo = getCurrentOdometer(r.vehicleId, true);
                const targetOdo = parseInt(r.targetOdometer) || 0;
                const diffKm = targetOdo - curOdo;
                if (diffKm > 0) {
                    kmLeftText = `${diffKm.toLocaleString('it-IT')} km rimasti`;
                } else if (diffKm === 0) {
                    kmLeftText = `Scade ora!`;
                } else {
                    kmLeftText = `Scaduto (${Math.abs(diffKm).toLocaleString('it-IT')} km)`;
                }
            }
            
            let countdownParts = [];
            if (daysLeftText) countdownParts.push(daysLeftText);
            if (kmLeftText) countdownParts.push(kmLeftText);
            
            let countdownStr = '';
            if (countdownParts.length > 0) {
                countdownStr = ` • <span style="font-weight: 600; color: ${r._isExpired ? 'var(--danger-color)' : '#2e7d32'};">${countdownParts.join(' • ')}</span>`;
            }
            
            item.innerHTML = `
                <div class="activity-type-icon bg-reminder">R</div>
                <div class="reminder-summary-content">
                    <span class="reminder-summary-title">${r.description}</span>
                    <span class="reminder-summary-desc">${triggerText}${countdownStr}</span>
                </div>
                <div>
                    ${r._isExpired ? '<span style="color:var(--danger-color); font-weight:700; font-size:10px;">URGENTE</span>' : '<span style="color:var(--text-muted); font-size:10px;">ATTIVO</span>'}
                </div>
            `;
            remList.appendChild(item);
        });
    }
}

// 2. CRONOLOGIA (Timeline)
function renderTimeline() {
    const list = document.getElementById('timeline-list');
    const filterType = document.getElementById('timeline-filter-type').value;
    const query = document.getElementById('timeline-search').value.toLowerCase();
    
    list.innerHTML = '';
    
    let filtered = getFilteredEntries().filter(e => e.vehicleId === state.activeVehicleId && e.type !== 'reminder' && e.type !== 'route');
    
    if (filterType !== 'all') {
        filtered = filtered.filter(e => e.type === filterType);
    }
    
    if (query) {
        filtered = filtered.filter(e => {
            const matchNotes = (e.notes || '').toLowerCase().includes(query);
            const matchCategory = (e.category || '').toLowerCase().includes(query);
            const matchProvider = (e.provider || '').toLowerCase().includes(query);
            const matchDesc = (e.description || '').toLowerCase().includes(query);
            const matchFuel = (e.fuelType || '').toLowerCase().includes(query);
            return matchNotes || matchCategory || matchProvider || matchDesc || matchFuel;
        });
    }
    
    // Sort descending by date
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (filtered.length === 0) {
        list.innerHTML = `<div class="no-data">${window.Translations.noActivitiesFound || 'No activities found for selected filters.'}</div>`;
        return;
    }
    
    filtered.forEach(e => {
        const item = document.createElement('div');
        item.className = `timeline-card t-${e.type}`;
        
        let title = '';
        let badgeColor = '';
        let rightVal = '';
        let detailsText = '';
        
        if (e.type === 'refuel') {
            badgeColor = 'var(--color-fuel)';
            title = `Rifornimento: ${e.fuelType}`;
            rightVal = `- € ${parseFloat(e.totalCost).toFixed(2)}`;
            let unit = 'L';
            let priceUnit = '/L';
            if (e.fuelType === 'Metano') {
                unit = 'kg';
                priceUnit = '/kg';
            } else if (e.fuelType === 'Elettrico') {
                unit = 'kWh';
                priceUnit = '/kWh';
            }
            detailsText = `${e.liters} ${unit} a € ${parseFloat(e.priceUnit).toFixed(3)}${priceUnit} • Odometer: ${parseInt(e.odometer).toLocaleString('it-IT')} km • Serbatoio pieno: ${e.isFull ? 'Sì' : 'No'}${e.missedPrevious ? ' • Mancato rifornimento prec.: Sì' : ''}`;
        } else if (e.type === 'expense') {
            badgeColor = 'var(--color-expense)';
            title = `Spesa: ${e.category}`;
            rightVal = `- € ${parseFloat(e.cost).toFixed(2)}`;
            detailsText = `Categoria Spesa ${e.odometer ? `• Registrato a ${parseInt(e.odometer).toLocaleString('it-IT')} km` : ''}`;
        } else if (e.type === 'service') {
            badgeColor = 'var(--color-service)';
            title = `Manutenzione: ${window.formatDescription(e.description)}`;
            rightVal = `- € ${parseFloat(e.cost).toFixed(2)}`;
            detailsText = `${e.provider ? `Presso: ${e.provider} • ` : ''}Odometer: ${parseInt(e.odometer).toLocaleString('it-IT')} km`;
        } else if (e.type === 'income') {
            badgeColor = 'var(--color-income)';
            title = `Entrata: ${e.category}`;
            rightVal = `+ € ${parseFloat(e.amount).toFixed(2)}`;
            detailsText = `Profitti ${e.odometer ? `• Registrato a ${parseInt(e.odometer).toLocaleString('it-IT')} km` : ''}`;
        }
        
        const typeLabel = e.type === 'service' ? 'manutenzione' : (e.type === 'refuel' ? 'rifornimento' : (e.type === 'expense' ? 'spesa' : (e.type === 'income' ? 'entrata' : e.type)));
        
        item.innerHTML = `
            <div class="timeline-node"></div>
            <div class="timeline-header">
                <div class="timeline-title-group">
                    <span class="timeline-tag" style="background-color:${badgeColor}">${typeLabel}</span>
                    <span class="timeline-title">${title}</span>
                </div>
                <span class="timeline-date">${formatDate(e.date)}</span>
            </div>
            <div class="timeline-body">
                <div>
                    <div class="timeline-details">${detailsText}</div>
                    ${e.notes ? `<div class="timeline-notes">Note: "${e.notes}"</div>` : ''}
                </div>
                <div class="timeline-right">
                    <span class="timeline-value ${e.type === 'income' ? 'income-val' : ''}">${rightVal}</span>
                    <div class="activity-actions-btn-group">
                        <button class="icon-btn" onclick="editEntry('${e.id}', '${e.type}')" title="Modifica">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="icon-btn btn-delete" onclick="deleteEntry('${e.id}')" title="Elimina">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(item);
    });
}

// Hook search and filters
document.getElementById('timeline-search').addEventListener('input', renderTimeline);
document.getElementById('timeline-filter-type').addEventListener('change', renderTimeline);

// 3. RIFORNIMENTI TABLE
function renderRefuelsTable() {
    const tbody = document.getElementById('refuel-table-body');
    tbody.innerHTML = '';
    
    const activeVeh = getActiveVehicle();
    const activeFuelType = activeVeh ? activeVeh.fuel : 'Benzina';
    const thVolume = document.getElementById('th-refuel-volume');
    const thPrice = document.getElementById('th-refuel-price');
    
    if (thVolume && thPrice) {
        if (activeFuelType === 'Metano') {
            thVolume.textContent = 'kg';
            thPrice.textContent = 'Prezzo/kg';
        } else if (activeFuelType === 'Elettrico') {
            thVolume.textContent = 'kWh';
            thPrice.textContent = 'Prezzo/kWh';
        } else {
            thVolume.textContent = 'Litri';
            thPrice.textContent = 'Prezzo/L';
        }
    }
    
    const refuels = getFilteredEntries()
        .filter(e => e.type === 'refuel' && e.vehicleId === state.activeVehicleId)
        .sort((a, b) => new Date(b.date) - new Date(a.date)); // Descending for UI table
        
    if (refuels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="no-data">${window.Translations.noRefuelings || 'No refuelings registered.'}</td></tr>`;
        return;
    }
    
    // Sort ascending temporarily to calculate consumption between consecutive rows
    const refuelsAsc = [...refuels].reverse();
    const fuelAvgs = {}; // map of id -> calculated consumption
    
    for (let i = 1; i < refuelsAsc.length; i++) {
        const cur = refuelsAsc[i];
        const prev = refuelsAsc[i - 1];
        
        if (cur.isFull && prev.isFull && !cur.missedPrevious) {
            const dist = parseInt(cur.odometer) - parseInt(prev.odometer);
            if (dist > 0) {
                const consumptionKmL = dist / parseFloat(cur.liters);
                let unit = 'km/L';
                if (cur.fuelType === 'Metano') unit = 'km/kg';
                else if (cur.fuelType === 'Elettrico') unit = 'km/kWh';
                fuelAvgs[cur.id] = `${consumptionKmL.toFixed(2)} ${unit}`;
            }
        }
    }
    
    refuels.forEach((e, idx) => {
        const tr = document.createElement('tr');
        
        // Calculate trip distance if possible
        let tripDist = "---";
        // Since list is descending, the previous refuel in chronological order is at index + 1
        if (idx < refuels.length - 1) {
            const nextOldest = refuels[idx + 1];
            const diff = parseInt(e.odometer) - parseInt(nextOldest.odometer);
            if (diff > 0) tripDist = `${diff.toLocaleString('it-IT')} km`;
        }
        
        let fullStatus = e.isFull ? 'Sì' : 'No';
        if (e.fuelType === 'Elettrico') {
            if (e.batteryStart !== null && e.batteryStart !== undefined && e.batteryEnd !== null && e.batteryEnd !== undefined) {
                fullStatus = `${e.batteryStart}% ➔ ${e.batteryEnd}%`;
            } else if (e.isFull) {
                fullStatus = '100%';
            }
        }
        
        tr.innerHTML = `
            <td>${formatDate(e.date)}</td>
            <td>${parseInt(e.odometer).toLocaleString('it-IT')}</td>
            <td>${tripDist}</td>
            <td>${e.fuelType}</td>
            <td>${parseFloat(e.liters).toFixed(2)}</td>
            <td>€ ${parseFloat(e.priceUnit).toFixed(3)}</td>
            <td><strong>€ ${parseFloat(e.totalCost).toFixed(2)}</strong></td>
            <td>${fuelAvgs[e.id] || '---'}</td>
            <td>${fullStatus}</td>
            <td class="action-cols">
                <button class="icon-btn" onclick="editEntry('${e.id}', 'refuel')" title="Modifica">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="icon-btn btn-delete" onclick="deleteEntry('${e.id}')" title="Elimina">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 4. EXPENSES TABLE
function renderExpensesTable() {
    const tbody = document.getElementById('expenses-table-body');
    tbody.innerHTML = '';
    
    const items = getFilteredEntries()
        .filter(e => e.type === 'expense' && e.vehicleId === state.activeVehicleId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
        
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="no-data">${window.Translations.noExpenses || 'No expenses registered.'}</td></tr>`;
        return;
    }
    
    items.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(e.date)}</td>
            <td><span class="timeline-tag bg-expense">${e.category}</span></td>
            <td><strong>€ ${parseFloat(e.cost).toFixed(2)}</strong></td>
            <td>${e.odometer ? `${parseInt(e.odometer).toLocaleString('it-IT')} km` : '---'}</td>
            <td>${e.notes || ''}</td>
            <td class="action-cols">
                <button class="icon-btn" onclick="editEntry('${e.id}', 'expense')" title="Modifica">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="icon-btn btn-delete" onclick="deleteEntry('${e.id}')" title="Elimina">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 5. INCOME TABLE
function renderIncomeTable() {
    const tbody = document.getElementById('income-table-body');
    tbody.innerHTML = '';
    
    const items = getFilteredEntries()
        .filter(e => e.type === 'income' && e.vehicleId === state.activeVehicleId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
        
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="no-data">${window.Translations.noIncomes || 'No incomes registered.'}</td></tr>`;
        return;
    }
    
    items.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(e.date)}</td>
            <td><span class="timeline-tag bg-income">${e.category}</span></td>
            <td><strong style="color: var(--color-income)">+ € ${parseFloat(e.amount).toFixed(2)}</strong></td>
            <td>${e.odometer ? `${parseInt(e.odometer).toLocaleString('it-IT')} km` : '---'}</td>
            <td>${e.notes || ''}</td>
            <td class="action-cols">
                <button class="icon-btn" onclick="editEntry('${e.id}', 'income')" title="Modifica">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="icon-btn btn-delete" onclick="deleteEntry('${e.id}')" title="Elimina">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 6. SERVICES TABLE
function renderServicesTable() {
    const tbody = document.getElementById('services-table-body');
    tbody.innerHTML = '';
    
    const items = getFilteredEntries()
        .filter(e => e.type === 'service' && e.vehicleId === state.activeVehicleId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
        
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="no-data">${window.Translations.noMaintenances || 'No maintenances registered.'}</td></tr>`;
        return;
    }
    
    items.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(e.date)}</td>
            <td>${parseInt(e.odometer).toLocaleString('it-IT')} km</td>
            <td><span class="timeline-tag bg-service">${window.formatDescription(e.description)}</span></td>
            <td><strong>€ ${parseFloat(e.cost).toFixed(2)}</strong></td>
            <td>${e.provider || '---'}</td>
            <td>${e.notes || ''}</td>
            <td class="action-cols">
                <button class="icon-btn" onclick="editEntry('${e.id}', 'service')" title="Modifica">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="icon-btn btn-delete" onclick="deleteEntry('${e.id}')" title="Elimina">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 7. ROUTES TABLE
// (Routes table removed)

// 8. REMINDERS GRID
function renderReminders() {
    const list = document.getElementById('reminders-list-container');
    list.innerHTML = '';
    
    const items = state.entries
        .filter(e => e.type === 'reminder' && e.vehicleId === state.activeVehicleId)
        .sort((a, b) => (a._isExpired === b._isExpired) ? 0 : a._isExpired ? -1 : 1); // Expired first
        
    if (items.length === 0) {
        list.innerHTML = `<div class="no-data" style="grid-column: 1/-1;">${window.Translations.noRemindersRegistered || 'No reminders registered.'}</div>`;
        return;
    }
    
    items.forEach(e => {
        const card = document.createElement('div');
        card.className = `reminder-card ${e._isExpired ? 'expired' : ''}`;
        
        const effectiveDate = (e.isRecurring && e.nextTargetDate) ? e.nextTargetDate : e.targetDate;
        let targetText = '';
        if (e.triggerType === 'date') {
            targetText = `<div class="reminder-info-label">Scadenza Data</div>
                          <div class="reminder-info-value">${formatDate(effectiveDate)}</div>`;
        } else if (e.triggerType === 'odometer') {
            targetText = `<div class="reminder-info-label">Scadenza Chilometri</div>
                          <div class="reminder-info-value">${parseInt(e.targetOdometer).toLocaleString('it-IT')} km</div>`;
        } else {
            targetText = `<div class="reminder-info-label">Scadenza Doppia</div>
                          <div class="reminder-info-value">${formatDate(effectiveDate)} • ${parseInt(e.targetOdometer).toLocaleString('it-IT')} km</div>`;
        }
        
        let recurrenceText = '';
        if (e.isRecurring) {
            const recurrenceParts = [];
            if ((e.triggerType === 'date' || e.triggerType === 'both') && e.recurrenceVal && e.recurrenceUnit) {
                const unitStr = e.recurrenceUnit === 'days' ? 'giorni' : (e.recurrenceUnit === 'months' ? 'mesi' : 'anni');
                recurrenceParts.push(`ogni ${e.recurrenceVal} ${unitStr}`);
            }
            if ((e.triggerType === 'odometer' || e.triggerType === 'both') && e.recurrenceKm) {
                recurrenceParts.push(`ogni ${parseInt(e.recurrenceKm).toLocaleString('it-IT')} km`);
            }
            if (recurrenceParts.length > 0) {
                recurrenceText = `<div style="font-size: 11px; color: #2e7d32; font-weight: 600; margin-top: 4px;">🔁 Ricorrente: ${recurrenceParts.join(' e ')}</div>`;
            }
        }
        
        let daysLeftText = '';
        if (e.triggerType === 'date' || e.triggerType === 'both') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const target = new Date(effectiveDate);
            target.setHours(0, 0, 0, 0);
            const diffTime = target - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                daysLeftText = `<span style="color: #2e7d32;">${diffDays} giorni rimasti</span>`;
            } else if (diffDays === 0) {
                daysLeftText = `<span style="color: #e65100; font-weight: bold;">Scade oggi!</span>`;
            } else {
                daysLeftText = `<span style="color: var(--danger-color); font-weight: bold;">Scaduto da ${Math.abs(diffDays)} giorni!</span>`;
            }
        }
        
        let kmLeftText = '';
        if (e.triggerType === 'odometer' || e.triggerType === 'both') {
            const curOdo = getCurrentOdometer(e.vehicleId, true);
            const targetOdo = parseInt(e.targetOdometer) || 0;
            const diffKm = targetOdo - curOdo;
            if (diffKm > 0) {
                kmLeftText = `<span style="color: #2e7d32;">${diffKm.toLocaleString('it-IT')} km rimasti</span>`;
            } else if (diffKm === 0) {
                kmLeftText = `<span style="color: #e65100; font-weight: bold;">Scade ora!</span>`;
            } else {
                kmLeftText = `<span style="color: var(--danger-color); font-weight: bold;">Scaduto da ${Math.abs(diffKm).toLocaleString('it-IT')} km!</span>`;
            }
        }
        
        let countdownHtml = '';
        if (daysLeftText || kmLeftText) {
            countdownHtml = `
                <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 2px; font-size: 11px; font-weight: 600;">
                    ${daysLeftText ? `<div>⏳ ${daysLeftText}</div>` : ''}
                    ${kmLeftText ? `<div>🚗 ${kmLeftText}</div>` : ''}
                </div>
            `;
        }
        
        card.innerHTML = `
            <div>
                <span class="timeline-tag bg-reminder" style="margin-bottom:10px;">Reminder</span>
                <div class="reminder-title">${e.description}</div>
                ${recurrenceText}
                ${countdownHtml}
            </div>
            <div class="reminder-info-row">
                ${targetText}
                ${e.notes ? `<div class="reminder-info-label" style="margin-top:6px;">Note</div>
                             <div style="font-size:12px; color:var(--text-secondary); font-style:italic;">"${e.notes}"</div>` : ''}
            </div>
            <div class="reminder-actions">
                <button class="icon-btn" onclick="editEntry('${e.id}', 'reminder')" title="Modifica">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="icon-btn btn-delete" onclick="deleteEntry('${e.id}')" title="Elimina">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

// 9. VEHICLES TAB
function renderVehiclesTab() {
    const list = document.getElementById('vehicles-list-container');
    list.innerHTML = '';
    
    // Show all vehicles in the garage list
    state.vehicles.forEach(v => {
        const card = document.createElement('div');
        const isActive = v.id === state.activeVehicleId;
        card.className = `vehicle-card ${isActive ? 'active-card' : ''} ${v.archived ? 'archived-card' : ''}`;
        
        const curOdo = getCurrentOdometer(v.id, true);
        
        card.innerHTML = `
            <div class="vehicle-card-header">
                <div class="vehicle-card-name-group">
                    <span class="vehicle-card-name">${v.brand} ${v.model}</span>
                    <span class="vehicle-card-brand">${v.type} (${v.year || 'N/A'})</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                    ${v.plate ? `<span class="vehicle-card-plate-badge">${v.plate}</span>` : ''}
                    ${v.archived ? `<span class="vehicle-card-plate-badge" style="background: rgba(255, 193, 7, 0.15); color: #ffc107; border-color: rgba(255, 193, 7, 0.3);">Archiviato</span>` : ''}
                </div>
            </div>
            
            <div class="vehicle-card-body">
                <div class="vehicle-card-info-item">
                    <span class="vehicle-card-info-label">Alimentazione:</span>
                    <span class="vehicle-card-info-val">${v.fuel}${v.euroClass ? ` (${v.euroClass})` : ''}</span>
                </div>
                <div class="vehicle-card-info-item">
                    <span class="vehicle-card-info-label">Contachilometri:</span>
                    <span class="vehicle-card-info-val">${curOdo.toLocaleString('it-IT')} km</span>
                </div>
                ${(v.powerKw || v.horsePower || v.engineCapacity) ? `
                <div class="vehicle-card-info-item">
                    <span class="vehicle-card-info-label">Motore:</span>
                    <span class="vehicle-card-info-val">
                        ${v.engineCapacity ? `${v.engineCapacity.toLocaleString('it-IT')} cc` : ''}
                        ${v.horsePower ? `${v.engineCapacity ? ' • ' : ''}${v.horsePower} CV` : (v.powerKw ? `${v.engineCapacity ? ' • ' : ''}${v.powerKw} kW` : '')}
                    </span>
                </div>` : ''}
                <div class="vehicle-card-info-item">
                    <span class="vehicle-card-info-label">${v.fuel === 'Elettrico' ? 'Batteria' : 'Serbatoio'}:</span>
                    <span class="vehicle-card-info-val">
                        ${v.fuel === 'Elettrico' 
                            ? (v.batteryCapacity ? `${v.batteryCapacity} ${v.batteryCapacityUnit || 'Wh'}` : '---')
                            : (v.tankSize ? `${v.tankSize} ${v.fuel === 'Metano' ? 'kg' : 'L'}` : '---')
                        }
                    </span>
                </div>
                ${v.vin ? `
                <div class="vehicle-card-info-item vehicle-recall-row">
                    <span class="vehicle-card-info-label">Richiami:</span>
                    <span class="vehicle-card-info-val vehicle-recall-cell">
                        ${v.recall_status === 'found' ? `
                            <span class="badge-recall badge-recall-found" title="${(v.recall_details || '').replace(/"/g, '&quot;')}">
                                ⚠️ Richiamo Attivo
                            </span>
                        ` : v.recall_status === 'not_found' ? `
                            <span class="badge-recall badge-recall-ok" title="${(v.recall_details || '').replace(/"/g, '&quot;')}">
                                ✅ Nessun richiamo
                            </span>
                        ` : v.recall_status === 'unsupported' ? `
                            <span class="badge-recall badge-recall-neutral" title="Verifica online non disponibile per questo marchio">Non supportato</span>
                        ` : `
                            <span class="badge-recall badge-recall-neutral">Non verificato</span>
                        `}
                        <button class="btn btn-small btn-check-recall" onclick="checkVehicleRecall('${v.id}', this)" title="Verifica ora le campagne di richiamo">
                            <svg class="recall-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            Verifica
                        </button>
                    </span>
                </div>` : ''}
            </div>
            
            <div class="vehicle-card-actions">
                ${!isActive ? `<button class="btn btn-secondary btn-small" onclick="selectVehicle('${v.id}')" style="padding: 6px 12px; font-size:12px;">Seleziona</button>` : '<span style="font-size:12px; font-weight:700; color:var(--primary-color); display:flex; align-items:center; margin-right:auto;">Attivo</span>'}
                
                <button class="btn btn-small btn-cert" onclick="openMechanicalCertificate('${v.id}')" title="Certificato Meccanico">Certificato</button>
                <button class="btn btn-small btn-export" onclick="exportVehicleData('${v.id}')" title="Esporta dati Drivvo CSV">Esporta</button>
                <button class="btn btn-small btn-import" onclick="document.getElementById('import-file-${v.id}').click()" title="Importa dati Drivvo CSV">Importa</button>
                <input type="file" id="import-file-${v.id}" onchange="importVehicleData('${v.id}', this)" accept=".csv" style="display:none;">
                
                <button class="icon-btn" onclick="editVehicle('${v.id}')" title="Modifica veicolo">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                ${state.vehicles.length > 1 ? `
                <button class="icon-btn btn-delete" onclick="deleteVehicle('${v.id}')" title="Elimina veicolo">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>` : ''}
            </div>
        `;
        list.appendChild(card);
    });
    // Render fleet-overview charts below the filter (deferred to next frame so DOM is ready)
    requestAnimationFrame(renderGarageCharts);
}

// Fleet-overview charts in the Garage tab
function renderGarageCharts() {
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#90A0C0' : '#5C6F84';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    const VEHICLE_PALETTE = [
        '#2196F3','#FF9800','#4CAF50','#E91E63','#9C27B0',
        '#00BCD4','#FF5722','#795548','#607D8B','#FFC107'
    ];
    const EXPENSE_CATEGORY_COLORS = {
        'Carburante':    '#FF9800',
        'Assicurazione': '#E91E63',
        'Bollo':         '#FF5722',
        'Manutenzione':  '#795548',
        'Lavaggio':      '#00BCD4',
        'Finanziamento': '#9C27B0',
        'Entrata':       '#2E7D32',
        'Altro':         '#9E9E9E'
    };

    // ---- Fleet Chart 1: Total Annual Km (all vehicles summed) ----
    if (chartFleetAnnualKm) { chartFleetAnnualKm.destroy(); chartFleetAnnualKm = null; }
    const activeVehicles = state.vehicles.filter(v => !v.archived);
    const activeVehicleIds = new Set(activeVehicles.map(v => v.id));
    const allYears = new Set();
    const vehicleKmByYear = {}; // vehicleId -> { year: km }
    activeVehicles.forEach(v => {
        vehicleKmByYear[v.id] = {};
        const vEntries = state.entries.filter(e => e.vehicleId === v.id && e.odometer && e.date);
        const byYear = {};
        vEntries.forEach(e => {
            const yr = e.date.substring(0, 4);
            const odo = parseInt(e.odometer);
            if (!byYear[yr]) byYear[yr] = { min: Infinity, max: -Infinity };
            if (odo < byYear[yr].min) byYear[yr].min = odo;
            if (odo > byYear[yr].max) byYear[yr].max = odo;
            allYears.add(yr);
        });
        Object.keys(byYear).forEach(yr => {
            vehicleKmByYear[v.id][yr] = byYear[yr].max > byYear[yr].min ? byYear[yr].max - byYear[yr].min : 0;
        });
    });
    const fleetKmYears = Array.from(allYears).sort();
    // Sum km across active vehicles for each year
    const fleetKmTotals = fleetKmYears.map(yr =>
        activeVehicles.reduce((sum, v) => sum + (vehicleKmByYear[v.id][yr] || 0), 0)
    );

    const fleetKmCanvas = document.getElementById('chart-fleet-annual-km');
    if (fleetKmCanvas) {
        if (fleetKmYears.length === 0) {
            const ctx = fleetKmCanvas.getContext('2d');
            ctx.clearRect(0, 0, fleetKmCanvas.width, fleetKmCanvas.height);
            ctx.fillStyle = textColor; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(window.Translations.noOdoData || 'No odometer data available.', fleetKmCanvas.width/2, fleetKmCanvas.height/2);
        } else {
            chartFleetAnnualKm = new Chart(fleetKmCanvas, {
                type: 'bar',
                data: {
                    labels: fleetKmYears,
                    datasets: [{
                        label: 'km totali',
                        data: fleetKmTotals,
                        backgroundColor: 'rgba(33,150,243,0.65)',
                        borderColor: '#2196F3',
                        borderWidth: 1,
                        borderRadius: 5
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { color: gridColor }, ticks: { color: textColor } },
                        y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => `${v.toLocaleString('it-IT')} km` },
                             suggestedMin: 0 }
                    }
                }
            });
        }
    }

    // ---- Fleet Chart 2: Annual Expenses by Category (all vehicles) ----
    if (chartFleetAnnualExpenses) { chartFleetAnnualExpenses.destroy(); chartFleetAnnualExpenses = null; }
    const fleetExpByYearCat = {}; // year -> { cat: total }
    const fleetExpYearsSet = new Set();
    const fleetCatsSet = new Set();
    state.entries.forEach(e => {
        if (!e.date) return;
        if (!activeVehicleIds.has(e.vehicleId)) return; // skip archived vehicles
        const yr = e.date.substring(0, 4);
        let cat = null, cost = 0;
        if (e.type === 'refuel') { cat = 'Carburante'; cost = parseFloat(e.totalCost) || 0; }
        else if (e.type === 'expense') { cat = e.category || 'Altro'; cost = parseFloat(e.cost) || 0; }
        else if (e.type === 'service') { cat = 'Manutenzione'; cost = parseFloat(e.cost) || 0; }
        if (cat && cost > 0) {
            if (!fleetExpByYearCat[yr]) fleetExpByYearCat[yr] = {};
            fleetExpByYearCat[yr][cat] = (fleetExpByYearCat[yr][cat] || 0) + cost;
            fleetExpYearsSet.add(yr);
            fleetCatsSet.add(cat);
        }
    });
    const fleetExpYears = Array.from(fleetExpYearsSet).sort();
    const fleetCats = Array.from(fleetCatsSet);
    const fleetExpDatasets = fleetCats.map(cat => ({
        label: cat,
        data: fleetExpYears.map(yr => parseFloat(((fleetExpByYearCat[yr] || {})[cat] || 0).toFixed(2))),
        backgroundColor: (EXPENSE_CATEGORY_COLORS[cat] || '#9E9E9E') + 'BB',
        borderColor: EXPENSE_CATEGORY_COLORS[cat] || '#9E9E9E',
        borderWidth: 1,
        borderRadius: 4,
        stack: 'expenses'
    }));

    const fleetExpCanvas = document.getElementById('chart-fleet-annual-expenses');
    if (fleetExpCanvas) {
        if (fleetExpYears.length === 0) {
            const ctx = fleetExpCanvas.getContext('2d');
            ctx.clearRect(0, 0, fleetExpCanvas.width, fleetExpCanvas.height);
            ctx.fillStyle = textColor; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(window.Translations.noExpenses || 'No expenses registered.', fleetExpCanvas.width/2, fleetExpCanvas.height/2);
        } else {
            chartFleetAnnualExpenses = new Chart(fleetExpCanvas, {
                type: 'bar',
                data: { labels: fleetExpYears, datasets: fleetExpDatasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: textColor, font: { size: 12 } } },
                        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: € ${ctx.parsed.y.toFixed(2)}` } }
                    },
                    scales: {
                        x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor } },
                        y: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, callback: v => `€ ${v}` } }
                    }
                }
            });
        }
    }
}

function selectVehicle(id) {
    state.activeVehicleId = id;
    localStorage.setItem('vehicles_active_id', id);
    checkReminders();
    populateVehicleSelectors();
    renderVehiclesTab();
}

async function importVehicleData(vehicleId, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const csvContent = e.target.result;
        
        try {
            const response = await fetch(`/api/vehicles/${vehicleId}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csvContent })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                alert(`Importazione completata con successo!\nElementi importati:\nRifornimenti: ${data.count.refuel}\nSpese: ${data.count.expense}\nManutenzioni: ${data.count.service}`);
                await loadState();
                populateVehicleSelectors();
                router();
            } else {
                alert("Errore durante l'importazione: " + (data.errore || "Errore sconosciuto"));
            }
        } catch (error) {
            console.error(error);
            alert("Errore di rete durante l'importazione.");
        } finally {
            inputElement.value = ''; // Reset file input
        }
    };
    reader.readAsText(file);
}

function exportVehicleData(vehicleId) {
    window.location.href = `/api/vehicles/${vehicleId}/export`;
}

// 10. CHARTS & ANALYTICS
function renderCharts() {
    const vId = state.activeVehicleId;
    const vEntries = getFilteredEntries().filter(e => e.vehicleId === vId);
    
    // Destroy previous charts to avoid canvas overwrite errors
    if (chartBreakdown) chartBreakdown.destroy();
    if (chartConsumption) chartConsumption.destroy();
    if (chartBatteryCapacity) chartBatteryCapacity.destroy();
    if (chartMonthlyByCategory) chartMonthlyByCategory.destroy();
    if (chartExpenseTypes) chartExpenseTypes.destroy();
    if (chartMaintenanceTypes) chartMaintenanceTypes.destroy();
    if (chartCostPerKm) chartCostPerKm.destroy();
    if (chartAnnualKm) chartAnnualKm.destroy();
    
    // Get colors matching the active theme
    const isDark = document.body.classList.contains('dark-theme');
    const textThemeColor = isDark ? '#90A0C0' : '#5C6F84';
    const gridThemeColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    
    const EXPENSE_CATEGORY_COLORS = {
        'Carburante': '#FF9800',
        'Assicurazione': '#E91E63',
        'Bollo': '#FF5722',
        'Manutenzione': '#795548',
        'Manutenzioni': '#795548',
        'Lavaggio': '#00BCD4',
        'Lavaggio veicolo': '#00BCD4',
        'Finanziamento': '#9C27B0',
        'Finanziamento / Leasing': '#9C27B0',
        'Acquisto': '#4CAF50',
        'Passaggio Di Propietà': '#FFEB3B',
        'Tassa': '#FFC107',
        'Parcheggio': '#009688',
        'Pedaggio autostradale': '#3F51B5',
        'Multa': '#F44336',
        'Entrata': '#2E7D32',
        'Altro': '#9E9E9E'
    };

    // Chart 1: Expenses Breakdown (Doughnut)
    const costBreakdown = {};
    vEntries.forEach(e => {
        let cat = 'Altro';
        let cost = 0;
        if (e.type === 'refuel') {
            cat = 'Carburante';
            cost = parseFloat(e.totalCost) || 0;
        } else if (e.type === 'service') {
            cat = 'Manutenzioni';
            cost = parseFloat(e.cost) || 0;
        } else if (e.type === 'expense') {
            cat = e.category || 'Altro';
            cost = parseFloat(e.cost) || 0;
        }
        if (cost > 0) {
            costBreakdown[cat] = (costBreakdown[cat] || 0) + cost;
        }
    });
    
    const doughnutLabels = Object.keys(costBreakdown).filter(k => costBreakdown[k] > 0);
    const doughnutData = doughnutLabels.map(k => costBreakdown[k]);
    const doughnutColors = doughnutLabels.map(k => EXPENSE_CATEGORY_COLORS[k] || '#9E9E9E');
    
    const canvas1 = document.getElementById('chart-expenses-breakdown');
    if (doughnutData.length === 0) {
        // Draw empty indicator
        const ctx = canvas1.getContext('2d');
        ctx.clearRect(0, 0, canvas1.width, canvas1.height);
        ctx.fillStyle = textThemeColor;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(window.Translations.noExpensesChart || 'No expenses registered to generate chart.', canvas1.width / 2, canvas1.height / 2);
    } else {
        chartBreakdown = new Chart(canvas1, {
            type: 'doughnut',
            data: {
                labels: doughnutLabels,
                datasets: [{
                    data: doughnutData,
                    backgroundColor: doughnutColors,
                    borderWidth: isDark ? 2 : 1,
                    borderColor: isDark ? '#1C2541' : '#FFF'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: textThemeColor,
                            font: { family: 'Inter', size: 12 },
                            generateLabels: function(chart) {
                                const original = Chart.defaults.plugins.legend.labels.generateLabels;
                                const labels = original.call(this, chart);
                                const dataset = chart.data.datasets[0];
                                const total = dataset.data.reduce((a, b) => a + b, 0);
                                labels.forEach(label => {
                                    const value = dataset.data[label.index];
                                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    label.text = `${label.text} (${percentage}%)`;
                                });
                                return labels;
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.raw / total) * 100).toFixed(1);
                                return ` ${ctx.label}: € ${ctx.raw.toFixed(2)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }



    // Chart 3: Fuel Consumption Trend (Line Chart)
    const activeVeh = getActiveVehicle();
    let fuelUnit = 'km/L';
    if (activeVeh) {
        if (activeVeh.fuel === 'Metano') {
            fuelUnit = 'km/kg';
        } else if (activeVeh.fuel === 'Elettrico') {
            fuelUnit = 'km/kWh';
        }
    }

    const refuels = vEntries
        .filter(e => e.type === 'refuel')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
        
    const consumptionLabels = [];
    const consumptionData = [];
    
    for (let i = 1; i < refuels.length; i++) {
        const cur = refuels[i];
        const prev = refuels[i - 1];
        if (cur.isFull && prev.isFull && !cur.missedPrevious) {
            const dist = parseInt(cur.odometer) - parseInt(prev.odometer);
            if (dist > 0) {
                const consumptionKmL = dist / parseFloat(cur.liters);
                consumptionLabels.push(formatDate(cur.date));
                consumptionData.push(consumptionKmL.toFixed(2));
            }
        }
    }
    
    const canvas3 = document.getElementById('chart-fuel-consumption');
    if (consumptionData.length === 0) {
        const ctx = canvas3.getContext('2d');
        ctx.clearRect(0, 0, canvas3.width, canvas3.height);
        ctx.fillStyle = textThemeColor;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(window.Translations.noConsecutiveFills || 'No consecutive fills registered.', canvas3.width / 2, canvas3.height / 2);
    } else {
        chartConsumption = new Chart(canvas3, {
            type: 'line',
            data: {
                labels: consumptionLabels,
                datasets: [{
                    label: `Consumo Medio (${fuelUnit})`,
                    data: consumptionData,
                    borderColor: '#FF9800',
                    backgroundColor: 'rgba(255, 152, 0, 0.15)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textThemeColor } }
                },
                scales: {
                    x: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } },
                    y: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } }
                }
            }
        });
    }
    
    // Chart 3B: Battery Capacity Trend (Line Chart for Electric Vehicles)
    const electricRefuels = vEntries
        .filter(e => e.type === 'refuel' && e.fuelType === 'Elettrico' && e.batteryCapacity)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
        
    const batteryLabels = [];
    const batteryData = [];
    const activeVehUnit = (activeVeh && activeVeh.batteryCapacityUnit) || 'Wh';
    
    electricRefuels.forEach(e => {
        batteryLabels.push(formatDate(e.date));
        let val = parseFloat(e.batteryCapacity);
        const unit = e.batteryCapacityUnit || 'Wh';
        if (unit !== activeVehUnit) {
            if (unit === 'kWh' && activeVehUnit === 'Wh') {
                val = val * 1000;
            } else if (unit === 'Wh' && activeVehUnit === 'kWh') {
                val = val / 1000;
            }
        }
        batteryData.push(val.toFixed(1));
    });
    
    const canvasBattery = document.getElementById('chart-battery-capacity');
    if (canvasBattery) {
        if (batteryData.length === 0) {
            const ctx = canvasBattery.getContext('2d');
            ctx.clearRect(0, 0, canvasBattery.width, canvasBattery.height);
            ctx.fillStyle = textThemeColor;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(document.documentElement.lang === 'it' ? 'Dati capacità batteria non disponibili.' : 'No battery capacity data available.', canvasBattery.width / 2, canvasBattery.height / 2);
        } else {
            chartBatteryCapacity = new Chart(canvasBattery, {
                type: 'line',
                data: {
                    labels: batteryLabels,
                    datasets: [{
                        label: document.documentElement.lang === 'it' ? `Capacità Batteria (${activeVehUnit})` : `Battery Capacity (${activeVehUnit})`,
                        data: batteryData,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.15)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: textThemeColor } }
                    },
                    scales: {
                        x: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } },
                        y: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } }
                    }
                }
            });
        }
    }

    // -----------------------------------------------------------------------
    // Chart 5: Spese per Categoria (Mensile o Annuale) — delegato a helper
    // -----------------------------------------------------------------------
    _renderCategoryStackedChart(vEntries, EXPENSE_CATEGORY_COLORS, textThemeColor, gridThemeColor);


    // -----------------------------------------------------------------------
    // Chart 6: Expense Types Pie
    // -----------------------------------------------------------------------
    const expenseTypeTotals = {};
    vEntries.filter(e => e.type === 'expense' || e.type === 'refuel').forEach(e => {
        let cat, cost;
        if (e.type === 'refuel') {
            cat = 'Carburante';
            cost = parseFloat(e.totalCost) || 0;
        } else {
            cat = e.category || 'Altro';
            cost = parseFloat(e.cost) || 0;
        }
        if (cost > 0) expenseTypeTotals[cat] = (expenseTypeTotals[cat] || 0) + cost;
    });

    const expPieLabels = Object.keys(expenseTypeTotals);
    const expPieData = expPieLabels.map(k => parseFloat(expenseTypeTotals[k].toFixed(2)));
    const expPieColors = expPieLabels.map(k => EXPENSE_CATEGORY_COLORS[k] || '#9E9E9E');

    const canvas6 = document.getElementById('chart-expense-types');
    if (expPieData.length === 0) {
        const ctx = canvas6.getContext('2d');
        ctx.clearRect(0, 0, canvas6.width, canvas6.height);
        ctx.fillStyle = textThemeColor;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(window.Translations.noExpenses || 'No expenses registered.', canvas6.width / 2, canvas6.height / 2);
    } else {
        chartExpenseTypes = new Chart(canvas6, {
            type: 'pie',
            data: {
                labels: expPieLabels,
                datasets: [{
                    data: expPieData,
                    backgroundColor: expPieColors,
                    borderWidth: isDark ? 2 : 1,
                    borderColor: isDark ? '#1C2541' : '#FFF'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: textThemeColor, font: { family: 'Inter', size: 12 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.raw / total) * 100).toFixed(1);
                                return `${ctx.label}: € ${ctx.raw.toFixed(2)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // -----------------------------------------------------------------------
    // Chart 7: Maintenance Types Pie
    // -----------------------------------------------------------------------
    const maintTypeTotals = {};
    vEntries.filter(e => e.type === 'service').forEach(e => {
        let desc = e.description;
        let totalCost = parseFloat(e.cost) || 0;
        if (!totalCost) return;

        // Try to parse JSON description (multi-item maintenance)
        try {
            const parsed = JSON.parse(desc);
            if (typeof parsed === 'object' && parsed !== null) {
                Object.entries(parsed).forEach(([item, val]) => {
                    const c = parseFloat(val) || 0;
                    if (c > 0) maintTypeTotals[item] = (maintTypeTotals[item] || 0) + c;
                });
                return;
            }
        } catch(err) {}

        // Fallback: use the whole description as a single category
        const key = (typeof desc === 'string' && desc) ? desc : 'Manutenzione';
        maintTypeTotals[key] = (maintTypeTotals[key] || 0) + totalCost;
    });

    const MAINT_COLORS = [
        '#795548','#8D6E63','#A1887F','#6D4C41','#4E342E',
        '#5D4037','#3E2723','#BCAAA4','#D7CCC8','#EFEBE9'
    ];

    const maintPieLabels = Object.keys(maintTypeTotals);
    const maintPieData = maintPieLabels.map(k => parseFloat(maintTypeTotals[k].toFixed(2)));
    const maintPieColors = maintPieLabels.map((_, i) => MAINT_COLORS[i % MAINT_COLORS.length]);

    const canvas7 = document.getElementById('chart-maintenance-types');
    if (maintPieData.length === 0) {
        const ctx = canvas7.getContext('2d');
        ctx.clearRect(0, 0, canvas7.width, canvas7.height);
        ctx.fillStyle = textThemeColor;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(window.Translations.noMaintenances || 'No maintenances registered.', canvas7.width / 2, canvas7.height / 2);
    } else {
        chartMaintenanceTypes = new Chart(canvas7, {
            type: 'pie',
            data: {
                labels: maintPieLabels,
                datasets: [{
                    data: maintPieData,
                    backgroundColor: maintPieColors,
                    borderWidth: isDark ? 2 : 1,
                    borderColor: isDark ? '#1C2541' : '#FFF'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: textThemeColor, font: { family: 'Inter', size: 12 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.raw / total) * 100).toFixed(1);
                                return `${ctx.label}: € ${ctx.raw.toFixed(2)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // -----------------------------------------------------------------------
    // Chart: Cost per Km (ANNUAL bar chart)
    // -----------------------------------------------------------------------
    const annualCostKmMap = {}; // 'YYYY' -> { cost, minOdo, maxOdo }
    vEntries.forEach(e => {
        const year = (e.date || '').substring(0, 4);
        if (!year) return;
        if (!annualCostKmMap[year]) annualCostKmMap[year] = { cost: 0, odos: [] };
        let c = 0;
        if (e.type === 'refuel') c = parseFloat(e.totalCost) || 0;
        else if (e.type === 'expense') c = parseFloat(e.cost) || 0;
        else if (e.type === 'service') c = parseFloat(e.cost) || 0;
        annualCostKmMap[year].cost += c;
        if (e.odometer) annualCostKmMap[year].odos.push(parseInt(e.odometer));
    });

    const cpkYears = Object.keys(annualCostKmMap).sort();
    const cpkLabels = [];
    const cpkData = [];
    for (let i = 0; i < cpkYears.length; i++) {
        const yr = cpkYears[i];
        const d = annualCostKmMap[yr];
        // km this year = max odo this year - max odo previous year (fallback: max-min same year)
        let kmThisYear = 0;
        if (i > 0) {
            const prevYr = cpkYears[i - 1];
            const prevMax = annualCostKmMap[prevYr].odos.length ? Math.max(...annualCostKmMap[prevYr].odos) : 0;
            const curMax = d.odos.length ? Math.max(...d.odos) : 0;
            if (prevMax > 0 && curMax > prevMax) kmThisYear = curMax - prevMax;
        } else if (d.odos.length > 1) {
            kmThisYear = Math.max(...d.odos) - Math.min(...d.odos);
        }
        if (kmThisYear > 0 && d.cost > 0) {
            cpkLabels.push(yr);
            cpkData.push(parseFloat((d.cost / kmThisYear).toFixed(4)));
        }
    }

    const canvasCpk = document.getElementById('chart-cost-per-km');
    if (cpkData.length === 0) {
        const ctx = canvasCpk.getContext('2d');
        ctx.clearRect(0, 0, canvasCpk.width, canvasCpk.height);
        ctx.fillStyle = textThemeColor;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Dati insufficienti per calcolare il costo/km.', canvasCpk.width / 2, canvasCpk.height / 2);
    } else {
        chartCostPerKm = new Chart(canvasCpk, {
            type: 'bar',
            data: {
                labels: cpkLabels,
                datasets: [{
                    label: '€ / km',
                    data: cpkData,
                    backgroundColor: 'rgba(230,74,25,0.6)',
                    borderColor: '#E64A19',
                    borderWidth: 1,
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => `€ ${ctx.parsed.y.toFixed(4)} / km` } }
                },
                scales: {
                    x: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } },
                    y: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor, callback: v => `€ ${v}` },
                         suggestedMin: 0 }
                }
            }
        });
    }

    // -----------------------------------------------------------------------
    // Chart: Annual Km (bar)
    // -----------------------------------------------------------------------
    const annualKmMap = {}; // 'YYYY' -> { minOdo, maxOdo }
    vEntries.forEach(e => {
        if (!e.odometer || !e.date) return;
        const year = e.date.substring(0, 4);
        const odo = parseInt(e.odometer);
        if (!annualKmMap[year]) annualKmMap[year] = { min: Infinity, max: -Infinity };
        if (odo < annualKmMap[year].min) annualKmMap[year].min = odo;
        if (odo > annualKmMap[year].max) annualKmMap[year].max = odo;
    });
    const annualKmYears = Object.keys(annualKmMap).sort();
    const annualKmValues = annualKmYears.map(y => {
        const d = annualKmMap[y];
        return d.max > d.min ? d.max - d.min : 0;
    });

    const canvasAkm = document.getElementById('chart-annual-km');
    if (annualKmYears.length === 0) {
        const ctx = canvasAkm.getContext('2d');
        ctx.clearRect(0, 0, canvasAkm.width, canvasAkm.height);
        ctx.fillStyle = textThemeColor;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(window.Translations.noOdoData || 'No odometer data available.', canvasAkm.width / 2, canvasAkm.height / 2);
    } else {
        chartAnnualKm = new Chart(canvasAkm, {
            type: 'bar',
            data: {
                labels: annualKmYears,
                datasets: [{
                    label: 'km percorsi',
                    data: annualKmValues,
                    backgroundColor: 'rgba(33,150,243,0.6)',
                    borderColor: '#2196F3',
                    borderWidth: 1,
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } },
                    y: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor, callback: v => `${v.toLocaleString('it-IT')} km` } }
                }
            }
        });
    }

    // -----------------------------------------------------------------------
    // Chart: Spese per Categoria — Mensile o Annuale (toggle)
    // -----------------------------------------------------------------------
    // Update toggle button states
    const btnMonthly = document.getElementById('toggle-monthly');
    const btnAnnual = document.getElementById('toggle-annual');
    const catbarTitle = document.getElementById('chart-catbar-title');
    if (btnMonthly && btnAnnual) {
        btnMonthly.classList.toggle('active', categoryChartPeriod === 'monthly');
        btnAnnual.classList.toggle('active', categoryChartPeriod === 'annual');
    }
    if (catbarTitle) catbarTitle.textContent = categoryChartPeriod === 'monthly' ? 'Spese Mensili per Categoria' : 'Spese Annuali per Categoria';
}

// Public toggle function (called from HTML onclick)
window.setCategoryChartPeriod = function(period) {
    categoryChartPeriod = period;
    renderCharts();
};

// Internal helper: build and render the category stacked bar chart
function _renderCategoryStackedChart(vEntries, EXPENSE_CATEGORY_COLORS, textThemeColor, gridThemeColor) {
    const isAnnual = categoryChartPeriod === 'annual';
    const periodDataMap = {}; // 'YYYY' or 'YYYY-MM' -> { 'Category': cost }
    const allCategories = new Set();

    vEntries.forEach(e => {
        const periodKey = isAnnual
            ? (e.date || '').substring(0, 4)
            : (e.date || '').substring(0, 7);
        if (!periodKey) return;
        if (!periodDataMap[periodKey]) periodDataMap[periodKey] = {};

        let cat = null;
        let cost = 0;
        if (e.type === 'refuel') { cat = 'Carburante'; cost = parseFloat(e.totalCost) || 0; }
        else if (e.type === 'expense') { cat = e.category || 'Altro'; cost = parseFloat(e.cost) || 0; }
        else if (e.type === 'service') { cat = 'Manutenzione'; cost = parseFloat(e.cost) || 0; }
        else if (e.type === 'income') { cat = 'Entrata'; cost = parseFloat(e.cost) || 0; }

        if (cat && cost > 0) {
            allCategories.add(cat);
            periodDataMap[periodKey][cat] = (periodDataMap[periodKey][cat] || 0) + cost;
        }
    });

    const sortedPeriods = Object.keys(periodDataMap).sort();
    const catList = Array.from(allCategories);

    // Sync active filters
    if (!activeCategoryFilters || !catList.every(c => activeCategoryFilters.has(c))) {
        activeCategoryFilters = new Set(catList);
    }

    // Render filter pills
    const filterContainer = document.getElementById('chart-category-filters');
    if (filterContainer) {
        filterContainer.innerHTML = '';
        catList.forEach(cat => {
            const color = EXPENSE_CATEGORY_COLORS[cat] || '#607D8B';
            const pill = document.createElement('span');
            pill.className = `chart-cat-pill ${activeCategoryFilters.has(cat) ? '' : 'inactive'}`;
            pill.style.background = color;
            pill.innerHTML = `<span class="pill-dot" style="background:#fff"></span>${cat}`;
            pill.addEventListener('click', () => {
                if (activeCategoryFilters.has(cat)) activeCategoryFilters.delete(cat);
                else activeCategoryFilters.add(cat);
                renderCharts();
            });
            filterContainer.appendChild(pill);
        });
    }

    const activeCategories = catList.filter(c => activeCategoryFilters.has(c));
    const canvas5 = document.getElementById('chart-monthly-by-category');

    if (sortedPeriods.length === 0) {
        const ctx = canvas5.getContext('2d');
        ctx.clearRect(0, 0, canvas5.width, canvas5.height);
        ctx.fillStyle = textThemeColor;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(window.Translations.noData || 'No data available.', canvas5.width / 2, canvas5.height / 2);
        return;
    }

    const catDatasets = activeCategories.map(cat => {
        const color = EXPENSE_CATEGORY_COLORS[cat] || '#607D8B';
        return {
            label: cat,
            data: sortedPeriods.map(p => periodDataMap[p][cat] ? parseFloat(periodDataMap[p][cat].toFixed(2)) : 0),
            backgroundColor: color + 'CC',
            borderColor: color,
            borderWidth: 1,
            borderRadius: 3,
            stack: 'expenses'
        };
    });

    chartMonthlyByCategory = new Chart(canvas5, {
        type: 'bar',
        data: {
            labels: isAnnual ? sortedPeriods : sortedPeriods.map(m => {
                const [y, mm] = m.split('-');
                const names = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
                return `${names[parseInt(mm)-1]} ${y.substring(2)}`;
            }),
            datasets: catDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textThemeColor, font: { family: 'Inter', size: 12 } } },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: € ${ctx.parsed.y.toFixed(2)}` } }
            },
            scales: {
                x: { stacked: true, grid: { color: gridThemeColor }, ticks: { color: textThemeColor } },
                y: { stacked: true, grid: { color: gridThemeColor }, ticks: { color: textThemeColor, callback: v => `€ ${v}` } }
            }
        }
    });
}
function formatDate(dateStr) {
    if (!dateStr) return '';
    const dateOnly = dateStr.trim().split(' ')[0];
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function normalizeToYYYYMMDD(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        return clean;
    }
    let match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
    match = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match) {
        return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
    if (clean.includes(' ')) {
        const parts = clean.split(' ');
        return normalizeToYYYYMMDD(parts[0]);
    }
    return clean;
}

// --- CRUD OPERATIONS FOR ACTIVITIES ---

// Toggle fields based on selected type inside Add Modal
function selectFormType(type) {
    // Update active button state
    elModalTypeButtons.forEach(btn => {
        if (btn.getAttribute('data-type') === type) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Set hidden field type
    document.getElementById('entry-type').value = type;
    
    // Hide all form sections
    const sections = document.querySelectorAll('.form-section');
    sections.forEach(s => s.classList.remove('active-section'));
    
    // Show active section
    const targetSection = document.getElementById(`section-${type}`);
    if (targetSection) {
        targetSection.classList.add('active-section');
    }
    
    // Enable/disable fields validation
    const allInputs = elActivityForm.querySelectorAll('input, select');
    allInputs.forEach(input => {
        // Find which section this input belongs to
        const closestSection = input.closest('.form-section');
        
        if (closestSection) {
            if (closestSection.id === `section-${type}`) {
                // Inside active section, require if has stars
                const label = closestSection.querySelector(`label[for="${input.id}"]`);
                if (label && label.textContent.includes('*')) {
                    input.required = true;
                }
            } else {
                // Disable validation for hidden fields
                input.required = false;
            }
        }
    });
    
    // Populate dynamic categories
    window.populateCategoryDropdowns();
    if (type === 'service' && !document.getElementById('entry-id').value) {
        window.populateMaintenanceItems();
    }
}

// Bind Type selector buttons
elModalTypeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const type = btn.getAttribute('data-type');
        selectFormType(type);
    });
});

// Update refueling form labels and placeholders based on selected fuel type
window.updateRefuelLabels = function() {
    const fuelType = document.getElementById('f-fuel-type').value;
    const lblLiters = document.getElementById('lbl-f-liters');
    const lblPrice = document.getElementById('lbl-f-price');
    const inputLiters = document.getElementById('f-liters');
    const inputPrice = document.getElementById('f-price-unit');
    const batteryRow = document.getElementById('f-battery-charge-row');
    const lblIsFull = document.querySelector('label[for="f-is-full"]');
    
    if (fuelType === 'Metano') {
        if (lblLiters) lblLiters.innerHTML = 'Volume (kg)';
        if (lblPrice) lblPrice.innerHTML = 'Prezzo al kg (€) *';
        if (inputLiters) inputLiters.placeholder = 'Calcolato in automatico (kg)';
        if (inputPrice) inputPrice.placeholder = 'Esempio: 1.250';
        if (batteryRow) batteryRow.style.display = 'none';
        if (lblIsFull) lblIsFull.innerHTML = 'Serbatoio pieno (consigliato per calcolo consumi)';
    } else if (fuelType === 'Elettrico') {
        if (lblLiters) lblLiters.innerHTML = 'Volume (kWh)';
        if (lblPrice) lblPrice.innerHTML = 'Prezzo al kWh (€) *';
        if (inputLiters) inputLiters.placeholder = 'Calcolato in automatico (kWh)';
        if (inputPrice) inputPrice.placeholder = 'Esempio: 0.35';
        if (batteryRow) batteryRow.style.display = 'flex';
        if (lblIsFull) lblIsFull.innerHTML = 'Batteria carica al 100% (consigliato per calcolo consumi)';
    } else {
        if (lblLiters) lblLiters.innerHTML = 'Volume (Litri)';
        if (lblPrice) lblPrice.innerHTML = 'Prezzo al Litro (€) *';
        if (inputLiters) inputLiters.placeholder = 'Calcolato in automatico (Litri)';
        if (inputPrice) inputPrice.placeholder = 'Esempio: 1.849';
        if (batteryRow) batteryRow.style.display = 'none';
        if (lblIsFull) lblIsFull.innerHTML = 'Serbatoio pieno (consigliato per calcolo consumi)';
    }
};

// Update helper display text for last odometer reading
window.updateLastOdometerDisplay = function() {
    const lastOdo = getCurrentOdometer(state.activeVehicleId, true);
    const lastOdoStr = lastOdo ? lastOdo.toLocaleString('it-IT') : '0';
    
    const elements = [
        'f-odometer-last',
        'e-odometer-last',
        's-odometer-last',
        'i-odometer-last'
    ];
    
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = `(Ultima: ${lastOdoStr} km)`;
        }
    });
};

// Populate dropdown options for reminder descriptions based on active garage config
window.populateReminderDescriptionDropdown = function(selectedVal = null) {
    const selectDesc = document.getElementById('rem-description');
    if (!selectDesc) return;
    selectDesc.innerHTML = '';
    
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = '-- Seleziona una voce --';
    placeholderOpt.disabled = true;
    placeholderOpt.selected = !selectedVal;
    selectDesc.appendChild(placeholderOpt);
    
    const config = window.getGarageConfig();
    
    const groupMaint = document.createElement('optgroup');
    groupMaint.label = 'Manutenzione';
    config.maintenance.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        if (selectedVal === item) opt.selected = true;
        groupMaint.appendChild(opt);
    });
    selectDesc.appendChild(groupMaint);
    
    const groupExpense = document.createElement('optgroup');
    groupExpense.label = 'Spesa';
    config.expense.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        if (selectedVal === item) opt.selected = true;
        groupExpense.appendChild(opt);
    });
    selectDesc.appendChild(groupExpense);
    
    if (selectedVal && !config.maintenance.includes(selectedVal) && !config.expense.includes(selectedVal)) {
        const customOpt = document.createElement('option');
        customOpt.value = selectedVal;
        customOpt.textContent = selectedVal;
        customOpt.selected = true;
        selectDesc.appendChild(customOpt);
    }
};

// Update required attributes for date and odometer based on reminder trigger type
window.updateReminderRequiredFields = function() {
    const isRec = document.getElementById('rem-is-recurring').value === '1';
    const triggerType = document.getElementById('rem-trigger-type').value;
    const inputDate = document.getElementById('rem-date');
    const inputOdo = document.getElementById('rem-odometer');
    
    const labelDate = document.querySelector('label[for="rem-date"]');
    const labelOdo = document.querySelector('label[for="rem-odometer"]');
    
    const dateGroup = document.querySelector('.id-date-group');
    const odoGroup = document.querySelector('.id-odo-group');
    
    if (isRec) {
        if (dateGroup) dateGroup.style.display = 'none';
        if (odoGroup) odoGroup.style.display = 'none';
        inputDate.required = false;
        inputOdo.required = false;
    } else {
        if (triggerType === 'date') {
            if (dateGroup) dateGroup.style.display = 'block';
            if (odoGroup) odoGroup.style.display = 'none';
            inputDate.required = true;
            inputOdo.required = false;
            if (labelDate) labelDate.innerHTML = 'Data Scadenza *';
        } else if (triggerType === 'odometer') {
            if (dateGroup) dateGroup.style.display = 'none';
            if (odoGroup) odoGroup.style.display = 'block';
            inputDate.required = false;
            inputOdo.required = true;
            if (labelOdo) labelOdo.innerHTML = 'Chilometri Scadenza (km) *';
        } else if (triggerType === 'both') {
            if (dateGroup) dateGroup.style.display = 'block';
            if (odoGroup) odoGroup.style.display = 'block';
            inputDate.required = true;
            inputOdo.required = true;
            if (labelDate) labelDate.innerHTML = 'Data Scadenza *';
            if (labelOdo) labelOdo.innerHTML = 'Chilometri Scadenza (km) *';
        }
    }
};

// Toggle recurrence fields display in UI based on single/repeating frequency choice
window.updateReminderRecurrenceFields = function() {
    const isRec = document.getElementById('rem-is-recurring').value === '1';
    const triggerType = document.getElementById('rem-trigger-type').value;
    
    const container = document.getElementById('rem-recurrence-container');
    const timeGroup = document.getElementById('rem-recurrence-time-group');
    const kmGroup = document.getElementById('rem-recurrence-km-group');
    
    const inputRecVal = document.getElementById('rem-recurrence-val');
    const inputRecKm = document.getElementById('rem-recurrence-km');
    
    const labelRecVal = document.querySelector('label[for="rem-recurrence-val"]');
    const labelRecKm = document.querySelector('label[for="rem-recurrence-km"]');
    
    if (isRec) {
        if (container) container.style.display = 'flex';
        if (triggerType === 'date') {
            if (timeGroup) timeGroup.style.display = 'block';
            if (kmGroup) kmGroup.style.display = 'none';
            if (inputRecVal) inputRecVal.required = true;
            if (inputRecKm) inputRecKm.required = false;
            if (labelRecVal) labelRecVal.innerHTML = 'Ripeti ogni (Tempo) *';
            if (labelRecKm) labelRecKm.innerHTML = 'Ripeti ogni (Chilometri)';
        } else if (triggerType === 'odometer') {
            if (timeGroup) timeGroup.style.display = 'none';
            if (kmGroup) kmGroup.style.display = 'block';
            if (inputRecVal) inputRecVal.required = false;
            if (inputRecKm) inputRecKm.required = true;
            if (labelRecVal) labelRecVal.innerHTML = 'Ripeti ogni (Tempo)';
            if (labelRecKm) labelRecKm.innerHTML = 'Ripeti ogni (Chilometri) *';
        } else if (triggerType === 'both') {
            if (timeGroup) timeGroup.style.display = 'block';
            if (kmGroup) kmGroup.style.display = 'block';
            if (inputRecVal) inputRecVal.required = true;
            if (inputRecKm) inputRecKm.required = true;
            if (labelRecVal) labelRecVal.innerHTML = 'Ripeti ogni (Tempo) *';
            if (labelRecKm) labelRecKm.innerHTML = 'Ripeti ogni (Chilometri) *';
        }
    } else {
        if (container) container.style.display = 'none';
        if (timeGroup) timeGroup.style.display = 'none';
        if (kmGroup) kmGroup.style.display = 'none';
        if (inputRecVal) inputRecVal.required = false;
        if (inputRecKm) inputRecKm.required = false;
    }
    window.updateReminderNextDate();
};

window.updateReminderNextDate = function() {
    const isRec = document.getElementById('rem-is-recurring').value === '1';
    const triggerType = document.getElementById('rem-trigger-type').value;
    const baseDateVal = document.getElementById('rem-date').value;
    const recVal = parseInt(document.getElementById('rem-recurrence-val').value) || 0;
    const recUnit = document.getElementById('rem-recurrence-unit').value || 'months';
    
    const container = document.getElementById('rem-next-date-container');
    const displayVal = document.getElementById('rem-next-date-display');
    
    if (isRec && (triggerType === 'date' || triggerType === 'both') && baseDateVal && recVal > 0) {
        const parts = baseDateVal.split('-');
        if (parts.length === 3) {
            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]) - 1;
            const d = parseInt(parts[2]);
            const baseDate = new Date(y, m, d);
            
            if (recUnit === 'days') {
                baseDate.setDate(baseDate.getDate() + recVal);
            } else if (recUnit === 'months') {
                baseDate.setMonth(baseDate.getMonth() + recVal);
            } else if (recUnit === 'years') {
                baseDate.setFullYear(baseDate.getFullYear() + recVal);
            }
            
            const newY = baseDate.getFullYear();
            const newM = String(baseDate.getMonth() + 1).padStart(2, '0');
            const newD = String(baseDate.getDate()).padStart(2, '0');
            const nextDateStr = `${newY}-${newM}-${newD}`;
            
            if (displayVal) {
                displayVal.value = nextDateStr;
            }
            if (container) {
                container.style.display = 'block';
            }
            return;
        }
    }
    
    if (container) {
        container.style.display = 'none';
    }
};

// Automatically resolve or update targets of matching reminders when recording an activity
async function checkAndHandleTriggeredReminders(newEntry) {
    const vehicleId = newEntry.vehicleId;
    const type = newEntry.type;
    const date = newEntry.date;
    const odometer = parseInt(newEntry.odometer) || getCurrentOdometer(vehicleId, true);
    
    const reminders = state.entries.filter(e => e.type === 'reminder' && String(e.vehicleId) === String(vehicleId));
    
    for (const rem of reminders) {
        let isMatch = false;
        
        if (type === 'expense' && newEntry.category === rem.description) {
            isMatch = true;
        } else if (type === 'service') {
            try {
                const selectedItems = JSON.parse(newEntry.description);
                if (rem.description in selectedItems) {
                    isMatch = true;
                }
            } catch (e) {
                if (newEntry.description === rem.description) {
                    isMatch = true;
                }
            }
        }
        
        if (isMatch) {
            if (rem.isRecurring) {
                let newTargetDate = rem.targetDate;
                let newTargetOdometer = rem.targetOdometer;
                
                let nextTargetDate = null;
                if ((rem.triggerType === 'date' || rem.triggerType === 'both') && rem.recurrenceVal && rem.recurrenceUnit) {
                    const baseDateStr = date || new Date().toISOString().split('T')[0];
                    const parts = baseDateStr.split('-');
                    if (parts.length === 3) {
                        const y = parseInt(parts[0]);
                        const m = parseInt(parts[1]) - 1;
                        const d = parseInt(parts[2]);
                        const nextBaseDate = new Date(y, m, d);
                        
                        if (rem.recurrenceUnit === 'days') {
                            nextBaseDate.setDate(nextBaseDate.getDate() + parseInt(rem.recurrenceVal));
                        } else if (rem.recurrenceUnit === 'months') {
                            nextBaseDate.setMonth(nextBaseDate.getMonth() + parseInt(rem.recurrenceVal));
                        } else if (rem.recurrenceUnit === 'years') {
                            nextBaseDate.setFullYear(nextBaseDate.getFullYear() + parseInt(rem.recurrenceVal));
                        }
                        
                        const nY = nextBaseDate.getFullYear();
                        const nM = String(nextBaseDate.getMonth() + 1).padStart(2, '0');
                        const nD = String(nextBaseDate.getDate()).padStart(2, '0');
                        newTargetDate = baseDateStr;
                        nextTargetDate = `${nY}-${nM}-${nD}`;
                    }
                }
                
                if ((rem.triggerType === 'odometer' || rem.triggerType === 'both') && rem.recurrenceKm) {
                    newTargetOdometer = odometer + parseInt(rem.recurrenceKm);
                }
                
                const updatedRem = {
                    ...rem,
                    targetDate: newTargetDate,
                    targetOdometer: newTargetOdometer,
                    nextTargetDate: nextTargetDate
                };
                delete updatedRem._isExpired;
                delete updatedRem._isExpiring;
                delete updatedRem.garage_id;
                delete updatedRem.portfolio_id;
                
                const resp = await fetch(`/api/vehicle-entries/${rem.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedRem)
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const idx = state.entries.findIndex(e => e.id === rem.id);
                    if (idx !== -1) {
                        state.entries[idx] = { ...state.entries[idx], ...data, targetDate: newTargetDate, targetOdometer: newTargetOdometer, nextTargetDate: nextTargetDate };
                        delete state.entries[idx]._isExpired;
                    }
                }
            } else {
                const confirmMessage = `È presente un promemoria attivo per "${rem.description}". Vuoi segnarlo come completato ed eliminarlo?`;
                if (confirm(confirmMessage)) {
                    const resp = await fetch(`/api/vehicle-entries/${rem.id}`, {
                        method: 'DELETE'
                    });
                    if (resp.ok) {
                        state.entries = state.entries.filter(e => e.id !== rem.id);
                    }
                }
            }
        }
    }
}

// Open Add Modal
function openAddModal(defaultType = 'refuel') {
    elActivityForm.reset();
    document.getElementById('entry-id').value = '';
    
    // Show type selector wrapper
    elModalTypeContainer.style.display = 'block';
    elModalTitle.textContent = "Aggiungi Attività";
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('f-date').value = today;
    document.getElementById('e-date').value = today;
    document.getElementById('s-date').value = today;
    document.getElementById('i-date').value = today;
    document.getElementById('rem-date').value = today;
    
    // Default fuel type should match the active vehicle's fuel type if applicable
    const activeVeh = getActiveVehicle();
    const isBicycle = activeVeh && activeVeh.type === 'Bicicletta' && activeVeh.fuel !== 'Elettrico';
    
    // Determine active tab from URL hash to match current view if header button is clicked
    const hash = window.location.hash || '#dashboard';
    const currentTab = hash.replace('#', '');
    const tabToTypeMap = {
        'refuel': 'refuel',
        'expenses': 'expense',
        'expense': 'expense',
        'services': 'service',
        'service': 'service',
        'income': 'income',
        'reminders': 'reminder',
        'reminder': 'reminder'
    };
    
    let typeToSelect = defaultType;
    if (!typeToSelect || typeToSelect === 'refuel') {
        const mappedType = tabToTypeMap[currentTab];
        if (mappedType) {
            typeToSelect = mappedType;
        } else {
            typeToSelect = 'refuel';
        }
    }
    
    // Fallback to expense if manual bicycle and refueling/charging is selected
    if (isBicycle && typeToSelect === 'refuel') {
        typeToSelect = 'expense';
    }
    
    if (activeVeh && activeVeh.fuel && activeVeh.fuel !== 'Nessuno') {
        document.getElementById('f-fuel-type').value = activeVeh.fuel;
    }
    
    window.populateReminderDescriptionDropdown(null);
    window.updateReminderRequiredFields();
    window.updateReminderRecurrenceFields();
    
    selectFormType(typeToSelect);
    window.updateRefuelLabels();
    window.updateLastOdometerDisplay();
    
    elActivityModal.classList.add('open');
}

// Edit Mode
window.editEntry = function(id, type) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    
    const toInputDate = (str) => str ? str.trim().split(' ')[0].split('T')[0] : '';
    
    elActivityForm.reset();
    
    document.getElementById('entry-id').value = entry.id;
    document.getElementById('entry-type').value = entry.type;
    
    // Hide type selector because type edit is not permitted to preserve mathematical logic integrity
    elModalTypeContainer.style.display = 'none';
    elModalTitle.textContent = "Modifica Attività";
    
    // Pre-populate shared notes
    document.getElementById('shared-notes').value = entry.notes || '';
    
    if (type === 'refuel') {
        document.getElementById('f-date').value = toInputDate(entry.date);
        document.getElementById('f-odometer').value = entry.odometer;
        document.getElementById('f-fuel-type').value = entry.fuelType;
        document.getElementById('f-liters').value = entry.liters;
        document.getElementById('f-price-unit').value = entry.priceUnit;
        document.getElementById('f-total-cost').value = entry.totalCost;
        document.getElementById('f-is-full').checked = entry.isFull;
        document.getElementById('f-missed-previous').checked = !!entry.missedPrevious;
        document.getElementById('f-gas-station').value = entry.gasStation || '';
        document.getElementById('f-driver').value = entry.driver || '';
        document.getElementById('f-reason').value = entry.reason || '';
        document.getElementById('f-payment-method').value = entry.paymentMethod || '';
        
        document.getElementById('f-battery-start').value = (entry.batteryStart !== undefined && entry.batteryStart !== null) ? entry.batteryStart : '';
        document.getElementById('f-battery-end').value = (entry.batteryEnd !== undefined && entry.batteryEnd !== null) ? entry.batteryEnd : '';
    } else if (type === 'expense') {
        document.getElementById('e-date').value = toInputDate(entry.date);
        document.getElementById('e-category').value = entry.category;
        document.getElementById('e-cost').value = entry.cost;
        document.getElementById('e-odometer').value = entry.odometer || '';
        document.getElementById('e-location').value = entry.location || '';
        document.getElementById('e-driver').value = entry.driver || '';
        document.getElementById('e-reason').value = entry.reason || '';
        document.getElementById('e-payment-method').value = entry.paymentMethod || '';
    } else if (type === 'service') {
        document.getElementById('s-date').value = toInputDate(entry.date);
        document.getElementById('s-odometer').value = entry.odometer;
        document.getElementById('s-cost').value = entry.cost;
        document.getElementById('s-provider').value = entry.provider || '';
        document.getElementById('s-driver').value = entry.driver || '';
        document.getElementById('s-payment-method').value = entry.paymentMethod || '';
        window.populateMaintenanceItems(entry.description, entry.cost);
    } else if (type === 'income') {
        document.getElementById('i-date').value = toInputDate(entry.date);
        document.getElementById('i-category').value = entry.category;
        document.getElementById('i-amount').value = entry.amount;
        document.getElementById('i-odometer').value = entry.odometer || '';

    } else if (type === 'reminder') {
        window.populateReminderDescriptionDropdown(entry.description);
        document.getElementById('rem-trigger-type').value = entry.triggerType;
        document.getElementById('rem-date').value = toInputDate(entry.targetDate);
        document.getElementById('rem-odometer').value = entry.targetOdometer || '';
        
        document.getElementById('rem-is-recurring').value = entry.isRecurring ? '1' : '0';
        document.getElementById('rem-recurrence-val').value = entry.recurrenceVal || '';
        document.getElementById('rem-recurrence-unit').value = entry.recurrenceUnit || 'months';
        document.getElementById('rem-recurrence-km').value = entry.recurrenceKm || '';
        document.getElementById('rem-next-date-display').value = toInputDate(entry.nextTargetDate) || '';
        
        window.updateReminderRequiredFields();
        window.updateReminderRecurrenceFields();
    }
    
    selectFormType(type);
    window.updateRefuelLabels();
    window.updateLastOdometerDisplay();
    elActivityModal.classList.add('open');
};

// Close Modals
function closeActivityModal() {
    elActivityModal.classList.remove('open');
}
elModalCloseBtn.addEventListener('click', closeActivityModal);
elModalCancelBtn.addEventListener('click', closeActivityModal);

// Submit Activity Form
elActivityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('entry-id').value;
    const type = document.getElementById('entry-type').value;
    const notes = document.getElementById('shared-notes').value;
    
    // Build Object based on Type
    const entryId = id || `ent-${type}-${Date.now()}`;
    let entryData = {
        id: entryId,
        vehicleId: state.activeVehicleId,
        type: type,
        notes: notes
    };
    
    // Form validation checks for custom types
    if (type === 'refuel') {
        entryData.date = normalizeToYYYYMMDD(document.getElementById('f-date').value);
        entryData.odometer = parseInt(document.getElementById('f-odometer').value);
        entryData.fuelType = document.getElementById('f-fuel-type').value;
        entryData.priceUnit = parseFloat(document.getElementById('f-price-unit').value);
        entryData.totalCost = parseFloat(document.getElementById('f-total-cost').value);
        entryData.liters = parseFloat(document.getElementById('f-liters').value) || parseFloat((entryData.totalCost / entryData.priceUnit).toFixed(2));
        entryData.isFull = document.getElementById('f-is-full').checked ? 1 : 0;
        entryData.missedPrevious = document.getElementById('f-missed-previous').checked ? 1 : 0;
        
        entryData.gasStation = document.getElementById('f-gas-station').value;
        entryData.driver = document.getElementById('f-driver').value;
        entryData.reason = document.getElementById('f-reason').value;
        entryData.paymentMethod = document.getElementById('f-payment-method').value;
        
        if (entryData.fuelType === 'Elettrico') {
            const startVal = document.getElementById('f-battery-start').value;
            const endVal = document.getElementById('f-battery-end').value;
            entryData.batteryStart = startVal !== '' ? parseInt(startVal) : null;
            entryData.batteryEnd = endVal !== '' ? parseInt(endVal) : null;
            if (entryData.batteryEnd === 100) {
                entryData.isFull = 1;
            }
            
            const activeVeh = getActiveVehicle();
            const existingEntry = id ? state.entries.find(e => e.id === id) : null;
            
            entryData.batteryCapacity = (existingEntry && existingEntry.batteryCapacity !== undefined && existingEntry.batteryCapacity !== null)
                ? existingEntry.batteryCapacity
                : (activeVeh ? activeVeh.batteryCapacity : null);
                
            entryData.batteryCapacityUnit = (existingEntry && existingEntry.batteryCapacityUnit !== undefined && existingEntry.batteryCapacityUnit !== null)
                ? existingEntry.batteryCapacityUnit
                : (activeVeh ? activeVeh.batteryCapacityUnit : 'Wh');
        } else {
            entryData.batteryStart = null;
            entryData.batteryEnd = null;
            entryData.batteryCapacity = null;
            entryData.batteryCapacityUnit = null;
        }
    } else if (type === 'expense') {
        entryData.date = normalizeToYYYYMMDD(document.getElementById('e-date').value);
        entryData.category = document.getElementById('e-category').value;
        entryData.cost = parseFloat(document.getElementById('e-cost').value);
        const odo = document.getElementById('e-odometer').value;
        entryData.odometer = odo ? parseInt(odo) : null;
        
        entryData.location = document.getElementById('e-location').value;
        entryData.driver = document.getElementById('e-driver').value;
        entryData.reason = document.getElementById('e-reason').value;
        entryData.paymentMethod = document.getElementById('e-payment-method').value;
    } else if (type === 'service') {
        entryData.date = normalizeToYYYYMMDD(document.getElementById('s-date').value);
        entryData.odometer = parseInt(document.getElementById('s-odometer').value);
        
        // Build JSON description from multi-selector
        const selected = {};
        const chks = document.querySelectorAll('.maint-item-chk');
        chks.forEach(chk => {
            if (chk.checked) {
                const row = chk.closest('div');
                const valInput = row.querySelector('.maint-item-cost');
                selected[chk.dataset.name] = parseFloat(valInput.value) || 0;
            }
        });
        
        if (Object.keys(selected).length === 0) {
            alert("Seleziona almeno un ricambio o lavoro per la manutenzione!");
            return;
        }
        
        entryData.description = JSON.stringify(selected);
        entryData.cost = parseFloat(document.getElementById('s-cost').value) || 0;
        entryData.provider = document.getElementById('s-provider').value;
        
        entryData.driver = document.getElementById('s-driver').value;
        entryData.paymentMethod = document.getElementById('s-payment-method').value;
    } else if (type === 'income') {
        entryData.date = normalizeToYYYYMMDD(document.getElementById('i-date').value);
        entryData.category = document.getElementById('i-category').value;
        entryData.amount = parseFloat(document.getElementById('i-amount').value);
        const odo = document.getElementById('i-odometer').value;
        entryData.odometer = odo ? parseInt(odo) : null;

    } else if (type === 'reminder') {
        entryData.date = normalizeToYYYYMMDD(document.getElementById('rem-date').value) || new Date().toISOString().split('T')[0];
        entryData.description = document.getElementById('rem-description').value;
        entryData.triggerType = document.getElementById('rem-trigger-type').value;
        entryData.targetDate = normalizeToYYYYMMDD(document.getElementById('rem-date').value) || null;
        const targetOdo = document.getElementById('rem-odometer').value;
        entryData.targetOdometer = targetOdo ? parseInt(targetOdo) : null;
        
        const isRec = document.getElementById('rem-is-recurring').value === '1';
        entryData.isRecurring = isRec ? 1 : 0;
        if (isRec) {
            if (entryData.triggerType === 'date' || entryData.triggerType === 'both') {
                entryData.recurrenceVal = parseInt(document.getElementById('rem-recurrence-val').value) || null;
                entryData.recurrenceUnit = document.getElementById('rem-recurrence-unit').value || 'months';
                entryData.nextTargetDate = normalizeToYYYYMMDD(document.getElementById('rem-next-date-display').value) || null;
            } else {
                entryData.recurrenceVal = null;
                entryData.recurrenceUnit = null;
                entryData.nextTargetDate = null;
            }
            if (entryData.triggerType === 'odometer' || entryData.triggerType === 'both') {
                entryData.recurrenceKm = parseFloat(document.getElementById('rem-recurrence-km').value) || null;
                if (entryData.recurrenceKm && (!id || !entryData.targetOdometer)) {
                    // Find the last recorded matching maintenance or expense
                    let lastOdometer = null;
                    const sortedMatchingEntries = state.entries
                        .filter(e => {
                            if (e.vehicleId !== state.activeVehicleId || !e.odometer) return false;
                            let isMatch = false;
                            if (e.type === 'service') {
                                try {
                                    const selectedItems = JSON.parse(e.description);
                                    if (entryData.description in selectedItems) {
                                        isMatch = true;
                                    }
                                } catch (err) {
                                    if (e.description === entryData.description) {
                                        isMatch = true;
                                    }
                                }
                            } else if (e.type === 'expense') {
                                if (e.category === entryData.description) {
                                    isMatch = true;
                                }
                            }
                            return isMatch;
                        })
                        .sort((a, b) => {
                            if (a.date !== b.date) {
                                return b.date.localeCompare(a.date);
                            }
                            return (b.odometer || 0) - (a.odometer || 0);
                        });
                        
                    if (sortedMatchingEntries.length > 0) {
                        lastOdometer = sortedMatchingEntries[0].odometer;
                    }
                    
                    const baseOdo = lastOdometer !== null ? lastOdometer : getCurrentOdometer(state.activeVehicleId, true);
                    entryData.targetOdometer = baseOdo + entryData.recurrenceKm;
                }
            } else {
                entryData.recurrenceKm = null;
            }
        } else {
            entryData.recurrenceVal = null;
            entryData.recurrenceUnit = null;
            entryData.recurrenceKm = null;
            entryData.nextTargetDate = null;
        }
    }
    
    try {
        const url = id ? `/api/vehicle-entries/${id}` : '/api/vehicle-entries?garage_id=' + activeGarageId;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entryData)
        });
        
        if (response.ok) {
            closeActivityModal();
            if (type === 'expense' || type === 'service') {
                try {
                    await checkAndHandleTriggeredReminders(entryData);
                } catch(remErr) {
                    console.error("Errore nell'elaborazione dei promemoria:", remErr);
                }
            }
            await refreshData();
        } else {
            alert("Errore durante il salvataggio dell'attività.");
        }
    } catch (err) {
        console.error(err);
        alert("Errore di rete durante il salvataggio.");
    }
});

// Delete Activity
window.deleteEntry = async function(id) {
    if (confirm("Sei sicuro di voler eliminare questa attività? Questa azione non può essere annullata.")) {
        try {
            const response = await fetch(`/api/vehicle-entries/${id}`, { method: 'DELETE' });
            if (response.ok) {
                // Optimistic UI update: remove the entry immediately from state so the
                // list re-renders at once, without waiting for the server round-trip.
                state.entries = state.entries.filter(e => e.id !== id);
                checkReminders();
                router();
                // Then do the full refresh in the background to sync any server-side changes
                await refreshData();
            } else {
                alert("Errore durante l'eliminazione dell'attività.");
            }
        } catch (err) {
            console.error(err);
            alert("Errore di rete durante l'eliminazione.");
        }
    }
};

// --- CRUD OPERATIONS FOR VEHICLES ---
function openVehicleModal(id = null) {
    elVehicleForm.reset();
    
    if (id) {
        const v = state.vehicles.find(item => item.id === id);
        if (!v) return;
        
        document.getElementById('vehicle-edit-id').value = v.id;
        document.getElementById('v-brand').value = v.brand;
        document.getElementById('v-model').value = v.model;
        document.getElementById('v-type').value = v.type;
        document.getElementById('v-fuel').value = v.fuel;
        document.getElementById('v-plate').value = v.plate || '';
        document.getElementById('v-year').value = v.year || '';
        document.getElementById('v-odometer').value = v.odometer;
        document.getElementById('v-tank-size').value = v.tankSize || '';
        
        document.getElementById('v-battery-capacity').value = v.batteryCapacity || '';
        document.getElementById('v-battery-unit').value = v.batteryCapacityUnit || 'Wh';
        document.getElementById('v-battery-voltage').value = v.batteryVoltage || '';
        document.getElementById('v-battery-amp-hours').value = v.batteryAmpHours || '';
        
        document.getElementById('v-vin').value = v.vin || '';
        document.getElementById('v-engine-capacity').value = v.engineCapacity || '';
        document.getElementById('v-power-kw').value = v.powerKw || '';
        document.getElementById('v-horse-power').value = v.horsePower || '';
        document.getElementById('v-fiscal-hp').value = v.fiscalHp || '';
        document.getElementById('v-euro-class').value = v.euroClass || '';
        
        document.getElementById('v-archived-row').style.display = 'block';
        document.getElementById('v-archived').checked = !!v.archived;
        
        elVehicleModalTitle.textContent = "Modifica Veicolo";
    } else {
        document.getElementById('vehicle-edit-id').value = '';
        document.getElementById('v-vin').value = '';
        document.getElementById('v-engine-capacity').value = '';
        document.getElementById('v-power-kw').value = '';
        document.getElementById('v-horse-power').value = '';
        document.getElementById('v-fiscal-hp').value = '';
        document.getElementById('v-euro-class').value = '';
        document.getElementById('v-archived-row').style.display = 'none';
        document.getElementById('v-archived').checked = false;
        elVehicleModalTitle.textContent = "Nuovo Veicolo";
    }
    
    // Call change trigger to adjust enabled/disabled inputs
    if (window.toggleVehicleFields) {
        window.toggleVehicleFields();
    }
    
    elVehicleModal.classList.add('open');
}

function closeVehicleModal() {
    elVehicleModal.classList.remove('open');
}

elVehicleModalCloseBtn.addEventListener('click', closeVehicleModal);
elVehicleModalCancelBtn.addEventListener('click', closeVehicleModal);
elAddVehicleBtn.addEventListener('click', () => openVehicleModal());
elAddVehicleQuickBtn.addEventListener('click', () => openVehicleModal());

// Submit Vehicle Form
elVehicleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('vehicle-edit-id').value;
    const isBicycle = document.getElementById('v-type').value === 'Bicicletta';
    const isArchivedChecked = document.getElementById('v-archived').checked;
    const fuelVal = document.getElementById('v-fuel').value;
    
    const vId = id || `veh-${Date.now()}`;
    let vData = {
        id: vId,
        brand: document.getElementById('v-brand').value,
        model: document.getElementById('v-model').value,
        type: document.getElementById('v-type').value,
        fuel: (isBicycle && fuelVal !== 'Elettrico') ? 'Nessuno' : fuelVal,
        plate: document.getElementById('v-plate').value || null,
        year: parseInt(document.getElementById('v-year').value) || null,
        odometer: parseInt(document.getElementById('v-odometer').value) || 0,
        tankSize: (isBicycle && fuelVal !== 'Elettrico') ? null : (parseFloat(document.getElementById('v-tank-size').value) || null),
        archived: isArchivedChecked ? 1 : 0,
        batteryCapacity: fuelVal === 'Elettrico' ? (parseFloat(document.getElementById('v-battery-capacity').value) || null) : null,
        batteryCapacityUnit: fuelVal === 'Elettrico' ? document.getElementById('v-battery-unit').value : 'Wh',
        batteryVoltage: fuelVal === 'Elettrico' ? (parseFloat(document.getElementById('v-battery-voltage').value) || null) : null,
        batteryAmpHours: fuelVal === 'Elettrico' ? (parseFloat(document.getElementById('v-battery-amp-hours').value) || null) : null,
        vin: (document.getElementById('v-vin').value || '').trim().toUpperCase() || null,
        engineCapacity: parseInt(document.getElementById('v-engine-capacity').value) || null,
        powerKw: parseFloat(document.getElementById('v-power-kw').value) || null,
        horsePower: parseInt(document.getElementById('v-horse-power').value) || null,
        fiscalHp: parseInt(document.getElementById('v-fiscal-hp').value) || null,
        euroClass: document.getElementById('v-euro-class').value || null
    };
    
    try {
        const url = id ? `/api/vehicles/${id}` : '/api/vehicles?garage_id=' + activeGarageId;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(vData)
        });
        
        if (response.ok) {
            if (!id) {
                state.activeVehicleId = vId;
                localStorage.setItem('vehicles_active_id', vId);
            } else if (vData.archived && state.activeVehicleId === id) {
                // If we archived the currently active vehicle, switch active selection to the first non-archived one if available
                const remaining = state.vehicles.filter(v => v.id !== id && !v.archived);
                if (remaining.length > 0) {
                    state.activeVehicleId = remaining[0].id;
                    localStorage.setItem('vehicles_active_id', state.activeVehicleId);
                }
            }
            closeVehicleModal();
            await refreshData();
        } else {
            alert("Errore durante il salvataggio del veicolo.");
        }
    } catch (err) {
        console.error(err);
        alert("Errore di rete durante il salvataggio del veicolo.");
    }
});

window.editVehicle = function(id) {
    openVehicleModal(id);
};

window.deleteVehicle = async function(id) {
    if (state.vehicles.length <= 1) {
        alert("Non puoi eliminare l'unico veicolo registrato.");
        return;
    }
    
    if (confirm("Sei sicuro di voler eliminare questo veicolo? Verranno eliminate anche TUTTE le attività (rifornimenti, spese, percorsi) ad esso associate. L'azione è irreversibile.")) {
        try {
            const response = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
            if (response.ok) {
                if (state.activeVehicleId === id) {
                    const remaining = state.vehicles.filter(v => v.id !== id);
                    state.activeVehicleId = remaining[0].id;
                    localStorage.setItem('vehicles_active_id', state.activeVehicleId);
                }
                await refreshData();
            } else {
                alert("Errore durante l'eliminazione del veicolo.");
            }
        } catch (err) {
            console.error(err);
            alert("Errore di rete durante l'eliminazione del veicolo.");
        }
    }
};

// Bind main quick action floating menu toggle
elHeaderAddBtn.addEventListener('click', () => openAddModal('refuel'));
elMobileAddBtn.addEventListener('click', () => openAddModal('refuel'));

// --- BACKUP EXPORT & IMPORT ---
const elExportBtn = document.getElementById('export-backup-btn');
const elImportInput = document.getElementById('import-backup-file');
const elResetBtn = document.getElementById('reset-data-btn');

if (elExportBtn) {
    elExportBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const downloadAnchor = document.createElement('a');
        const now = new Date().toISOString().split('T')[0];
        
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `vehicles_backup_${now}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });
}

if (elImportInput) {
    elImportInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                const imported = JSON.parse(evt.target.result);
                
                // Basic validation
                if (imported.vehicles && Array.isArray(imported.vehicles) && imported.entries && Array.isArray(imported.entries)) {
                    if (confirm("Sei sicuro di voler importare questo backup? Sostituirà tutti i dati attuali della tua applicazione.")) {
                        const payload = {
                            garage_id: activeGarageId,
                            vehicles: imported.vehicles || [],
                            entries: imported.entries || []
                        };
                        const response = await fetch('/api/vehicles/import-backup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                          });
                          if (response.ok) {
                              alert("Backup importato con successo!");
                              location.reload();
                          } else {
                              alert("Errore durante l'importazione del backup nel database.");
                          }
                    }
                } else {
                    alert("Il formato del file di backup JSON non è valido.");
                }
            } catch (err) {
                alert("Errore durante l'analisi del file di backup: " + err.message);
            }
        };
        reader.readAsText(file);
    });
}

if (elResetBtn) {
    elResetBtn.addEventListener('click', async () => {
        if (confirm("ATTENZIONE: Questa azione eliminerà permanentemente tutti i tuoi veicoli, le attività e ripristinerà l'applicazione con i dati dimostrativi storici presenti nella cartella import. Vuoi procedere?")) {
            try {
                const response = await fetch('/api/vehicles/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ garage_id: activeGarageId }) });
                if (response.ok) {
                    alert("Applicazione resettata alle impostazioni storiche con successo.");
                    location.reload();
                } else {
                    alert("Errore durante il ripristino dell'applicazione.");
                }
            } catch (err) {
                alert("Errore di rete: " + err.message);
            }
        }
    });
}

// --- CSV IMPORT & EXPORT EVENT HANDLERS ---
const elExportCsvBtn = document.getElementById('export-csv-btn');
const elImportCsvInput = document.getElementById('import-csv-file');

if (elExportCsvBtn) {
    elExportCsvBtn.addEventListener('click', () => {
        if (!state.activeVehicleId) {
            alert("Seleziona prima un veicolo.");
            return;
        }
        window.location.href = `/api/vehicles/${state.activeVehicleId}/export`;
    });
}

if (elImportCsvInput) {
    elImportCsvInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!state.activeVehicleId) {
            alert("Seleziona prima un veicolo attivo su cui importare i dati.");
            return;
        }
        
        if (!confirm(`Sei sicuro di voler importare i dati CSV per il veicolo corrente? I nuovi dati verranno aggiunti a quelli esistenti.`)) {
            return;
        }
        
        const reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                const csvContent = evt.target.result;
                const response = await fetch(`/api/vehicles/${state.activeVehicleId}/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ csvContent })
                });
                const resData = await response.json();
                if (response.ok && resData.success) {
                    alert(`Importazione completata con successo! Rifornimenti: ${resData.count.refuel}, Spese: ${resData.count.expense}, Manutenzioni: ${resData.count.service}`);
                    await refreshData();
                } else {
                    alert("Errore durante l'importazione del file CSV: " + (resData.error || "Errore sconosciuto"));
                }
            } catch (err) {
                alert("Errore di rete o di lettura file: " + err.message);
            }
        };
        reader.readAsText(file);
    });
}

window.caricaDatiVeicoli = refreshData;
window.showTab = showTab;
window.openAddModal = openAddModal;

// --- DYNAMIC CONFIGURATION AND MULTISELECT HELPERS ---

window.getGarageConfig = function() {
    const defaultMaint = [
        // Ricambi — estratti dai CSV Drivvo reali
        "Cambio olio",
        "Filtro dell'olio",
        "Filtro dell'aria",
        "Filtro dell'abitacolo",
        "Filtro aria condizionata",
        "Candele",
        "Batteria",
        "Cinghia Trasmissione",
        "Dischi freno anteriori",
        "Kit pastiglie",
        "Liquido dei freni",
        "Liquido Radiatore",
        "Nuovi pneumatici",
        "Cambio Gomme",
        "Inversione Gomme",
        "Allineamento delle ruote",
        "Ruotare gli pneumatici",
        "Sistema della frizione",
        "Sonda Lambda",
        "Kit Di Stabilizzatori",
        "Revisione",
        "Revisione metano",
        "Riparazione del motore",
        // Voci di costo officina
        "Manodopera",
        "Lavoro",
        "Totale tagliando",
        // Generici
        "Riparazione generica",
        "Altro"
    ];
    const defaultExpense = [
        // Categorie estratte dai CSV Drivvo reali
        "Assicurazione",
        "Bollo",
        "Acquisto",
        "Tassa",
        "Passaggio Di Propietà",
        // Categorie aggiuntive comuni
        "Parcheggio",
        "Pedaggio autostradale",
        "Lavaggio veicolo",
        "Multa",
        "Finanziamento / Leasing",
        "Altro"
    ];
    const defaultIncome = ["Corse (NCC, Uber, Taxi)", "Consegne (Glovo, Deliveroo, ecc.)", "Rimborso chilometrico", "Noleggio a terzi", "Altro"];
    
    if (typeof activeGarageId === 'undefined' || !activeGarageId) {
        return { maintenance: defaultMaint, expense: defaultExpense, income: defaultIncome };
    }
    const key = `garage_config_${activeGarageId}`;
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                maintenance: parsed.maintenance || defaultMaint,
                expense: parsed.expense || defaultExpense,
                income: parsed.income || defaultIncome
            };
        }
    } catch(e) {}
    
    return {
        maintenance: defaultMaint,
        expense: defaultExpense,
        income: defaultIncome
    };
};

window.saveGarageConfig = function(config) {
    if (typeof activeGarageId === 'undefined' || !activeGarageId) return;
    const key = `garage_config_${activeGarageId}`;
    localStorage.setItem(key, JSON.stringify(config));
};

window.renderConfigList = function(type) {
    const config = window.getGarageConfig();
    const listEl = document.getElementById(`config-${type}-list`);
    if (!listEl) return;
    
    listEl.innerHTML = '';
    const items = type === 'maint' ? config.maintenance : (type === 'expense' ? config.expense : config.income);
    
    items.forEach((item, idx) => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.background = '#f8f9fa';
        li.style.padding = '10px 15px';
        li.style.borderRadius = '8px';
        li.style.border = '1px solid #dee2e6';
        li.style.marginBottom = '8px';
        
        li.innerHTML = `
            <span style="font-weight: 500;">${item}</span>
            <button onclick="window.deleteConfigItem('${type}', ${idx})" style="background: transparent; border: none; color: #dc3545; cursor: pointer; font-weight: bold; font-size: 0.9em; padding: 4px 8px;">Elimina</button>
        `;
        listEl.appendChild(li);
    });
};

window.deleteConfigItem = function(type, index) {
    const config = window.getGarageConfig();
    const items = type === 'maint' ? config.maintenance : (type === 'expense' ? config.expense : config.income);
    items.splice(index, 1);
    window.saveGarageConfig(config);
    window.renderConfigList(type);
};

window.addConfigItem = function(type) {
    const input = document.getElementById(`config-${type}-input`);
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    
    const config = window.getGarageConfig();
    const items = type === 'maint' ? config.maintenance : (type === 'expense' ? config.expense : config.income);
    
    if (items.includes(val)) {
        alert("Questo elemento esiste già nella lista!");
        return;
    }
    
    items.push(val);
    window.saveGarageConfig(config);
    input.value = '';
    window.renderConfigList(type);
};

window.populateCategoryDropdowns = function() {
    const config = window.getGarageConfig();
    
    // Populate Expense Category Dropdown
    const selectExpense = document.getElementById('e-category');
    if (selectExpense) {
        selectExpense.innerHTML = '';
        config.expense.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            selectExpense.appendChild(opt);
        });
    }
    
    // Populate Income Category Dropdown
    const selectIncome = document.getElementById('i-category');
    if (selectIncome) {
        selectIncome.innerHTML = '';
        config.income.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            selectIncome.appendChild(opt);
        });
    }
};

window.populateMaintenanceItems = function(entryDescription = null, entryCost = 0, focusItemName = null) {
    const container = document.getElementById('maint-multiselect-container');
    if (!container) return;
    
    container.innerHTML = '';
    const config = window.getGarageConfig();
    
    let selectedItems = {};
    if (entryDescription) {
        try {
            selectedItems = JSON.parse(entryDescription);
        } catch (e) {
            // Legacy format, description is a plain string
            selectedItems[entryDescription] = entryCost;
        }
    }
    
    // Sort items so selected ones appear first
    const allItems = [...config.maintenance];
    allItems.sort((a, b) => {
        const aSel = a in selectedItems ? 1 : 0;
        const bSel = b in selectedItems ? 1 : 0;
        return bSel - aSel;
    });
    
    let inputToFocus = null;
    
    allItems.forEach(itemName => {
        const itemDiv = document.createElement('div');
        itemDiv.style.display = 'flex';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.gap = '10px';
        itemDiv.style.marginBottom = '8px';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'maint-item-chk';
        checkbox.dataset.name = itemName;
        
        const span = document.createElement('span');
        span.textContent = itemName;
        span.style.flex = '1';
        span.style.fontSize = '0.95em';
        span.style.fontWeight = '500';
        
        const costInput = document.createElement('input');
        costInput.type = 'number';
        costInput.step = '0.01';
        costInput.min = '0';
        costInput.placeholder = '€ 0.00';
        costInput.style.width = '100px';
        costInput.style.border = '1px solid #ced4da';
        costInput.style.borderRadius = '4px';
        costInput.style.padding = '4px 8px';
        costInput.className = 'maint-item-cost';
        
        if (itemName in selectedItems) {
            checkbox.checked = true;
            costInput.value = selectedItems[itemName];
            costInput.disabled = false;
        } else {
            checkbox.checked = false;
            costInput.disabled = true;
        }
        
        checkbox.addEventListener('change', () => {
            costInput.disabled = !checkbox.checked;
            if (!checkbox.checked) {
                costInput.value = '';
            }
            window.recalcMaintTotal();
            
            // Gather updated selections
            const currentSel = window.getCurrentMaintenanceSelections();
            const total = parseFloat(document.getElementById('s-cost').value) || 0;
            // Re-render sorted list; if checked, focus the cost input
            const nextFocusName = checkbox.checked ? itemName : null;
            window.populateMaintenanceItems(JSON.stringify(currentSel), total, nextFocusName);
        });
        
        costInput.addEventListener('input', window.recalcMaintTotal);
        
        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(span);
        itemDiv.appendChild(costInput);
        
        container.appendChild(itemDiv);
        
        if (focusItemName && itemName === focusItemName) {
            inputToFocus = costInput;
        }
    });
    
    if (inputToFocus) {
        setTimeout(() => {
            inputToFocus.focus();
            inputToFocus.select();
        }, 0);
    }
};

window.getCurrentMaintenanceSelections = function() {
    const selections = {};
    const chks = document.querySelectorAll('.maint-item-chk');
    chks.forEach(chk => {
        if (chk.checked) {
            const name = chk.dataset.name;
            const row = chk.closest('div');
            const valInput = row.querySelector('.maint-item-cost');
            selections[name] = parseFloat(valInput.value) || 0;
        }
    });
    return selections;
};

window.recalcMaintTotal = function() {
    let total = 0;
    const chks = document.querySelectorAll('.maint-item-chk');
    chks.forEach(chk => {
        if (chk.checked) {
            const row = chk.closest('div');
            const valInput = row.querySelector('.maint-item-cost');
            total += parseFloat(valInput.value) || 0;
        }
    });
    document.getElementById('s-cost').value = total.toFixed(2);
};

window.formatDescription = function(desc) {
    try {
        const obj = JSON.parse(desc);
        if (typeof obj === 'object' && obj !== null) {
            return Object.entries(obj).map(([item, val]) => `${item} (€ ${parseFloat(val).toFixed(2)})`).join(', ');
        }
    } catch(e) {}
    return desc;
};

window.clearVehicleHistory = async function() {
    const vId = state.activeVehicleId;
    if (!vId) return;
    const confirmation = confirm("Sei sicuro di voler eliminare TUTTE le attività (rifornimenti, spese, entrate, manutenzioni) di questo veicolo? Questa azione non può essere annullata.");
    if (!confirmation) return;
    
    try {
        const res = await fetch(`/api/vehicles/${vId}/activities/clear`, { method: 'DELETE' });
        if (res.ok) {
            alert("Cronologia attività svuotata con successo.");
            await loadState();
            router();
        } else {
            alert("Errore durante l'eliminazione della cronologia.");
        }
    } catch (e) {
        alert("Errore di connessione.");
    }
};

/* -------------------------------------------------------------
   MECHANICAL CERTIFICATE CONTROLLER
------------------------------------------------------------- */
let certActiveVehicleId = null;
let currentCertServices = [];

window.openMechanicalCertificate = function(vehicleId) {
    certActiveVehicleId = vehicleId || state.activeVehicleId || (state.vehicles[0] ? state.vehicles[0].id : null);
    if (!certActiveVehicleId || state.vehicles.length === 0) {
        alert("Nessun veicolo registrato nel garage.");
        return;
    }
    const modal = document.getElementById('mechanical-certificate-modal');
    if (modal) {
        modal.classList.add('open');
        window.renderMechanicalCertificate(certActiveVehicleId);
    }
};

window.closeMechanicalCertificateModal = function() {
    const modal = document.getElementById('mechanical-certificate-modal');
    if (modal) {
        modal.classList.remove('open');
    }
};

// Close modal if user clicks outside the modal card
document.addEventListener('click', (e) => {
    const modal = document.getElementById('mechanical-certificate-modal');
    if (modal && modal.classList.contains('open') && e.target === modal) {
        window.closeMechanicalCertificateModal();
    }
});

window.renderMechanicalCertificate = function(vehicleId) {
    if (vehicleId) {
        certActiveVehicleId = vehicleId;
    } else if (!certActiveVehicleId) {
        certActiveVehicleId = state.activeVehicleId;
    }

    const v = state.vehicles.find(item => item.id === certActiveVehicleId) || getActiveVehicle();
    if (!v) return;

    // Populate vehicle picker in modal header
    const sel = document.getElementById('cert-vehicle-select');
    if (sel) {
        sel.innerHTML = '';
        state.vehicles.forEach(veh => {
            const opt = document.createElement('option');
            opt.value = veh.id;
            opt.textContent = `${veh.brand} ${veh.model} ${veh.plate ? '(' + veh.plate + ')' : ''}`;
            if (veh.id === v.id) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    const curOdo = getCurrentOdometer(v.id, true);
    const garageName = document.getElementById('select-garage')?.selectedOptions?.[0]?.text || 'Garage Principale';
    const now = new Date();
    const issueDateStr = now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const issueTimeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const todayStr = now.toISOString().split('T')[0];
    const today = new Date();
    today.setHours(0,0,0,0);

    // Get vehicle activities
    const vEntries = state.entries.filter(e => e.vehicleId === v.id);
    const services = vEntries.filter(e => e.type === 'service').sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (dateB - dateA !== 0) return dateB - dateA;
        return (parseInt(b.odometer) || 0) - (parseInt(a.odometer) || 0);
    });
    currentCertServices = services;
    const reminders = vEntries.filter(e => e.type === 'reminder');

    // 1. EVALUATE TAGLIANDO (SERVICE)
    const tagliandoReminders = reminders.filter(r => /tagliand|manutenz|serviz|cambio olio|olio|filtr/i.test(r.description || ''));
    const lastService = services[0];
    
    let tagliandoCardHtml = '';
    let tagliandoStatusClass = 'badge-neutral';
    let tagliandoBorderClass = 'border-neutral';
    let tagliandoStatusLabel = 'Da pianificare';
    let tagliandoDetailsHtml = '';

    if (tagliandoReminders.length > 0) {
        const tr = tagliandoReminders[0];
        const effectiveDate = (tr.isRecurring && tr.nextTargetDate) ? tr.nextTargetDate : tr.targetDate;
        const targetOdo = tr.targetOdometer ? parseInt(tr.targetOdometer) : null;
        
        let isExp = false;
        let isWarn = false;
        let daysLeft = null;
        let kmLeft = null;

        if (effectiveDate) {
            const targetD = new Date(effectiveDate);
            targetD.setHours(0,0,0,0);
            daysLeft = Math.ceil((targetD - today) / (1000 * 60 * 60 * 24));
            if (effectiveDate < todayStr) isExp = true;
            else if (daysLeft <= 30) isWarn = true;
        }

        if (targetOdo) {
            kmLeft = targetOdo - curOdo;
            if (curOdo >= targetOdo) isExp = true;
            else if (kmLeft <= 1000) isWarn = true;
        }

        if (isExp) {
            tagliandoStatusClass = 'badge-danger';
            tagliandoBorderClass = 'border-danger';
            tagliandoStatusLabel = 'Intervento Scaduto';
        } else if (isWarn) {
            tagliandoStatusClass = 'badge-warn';
            tagliandoBorderClass = 'border-warn';
            tagliandoStatusLabel = 'In Scadenza';
        } else {
            tagliandoStatusClass = 'badge-ok';
            tagliandoBorderClass = 'border-ok';
            tagliandoStatusLabel = 'Regolare';
        }

        let recurrenceStr = 'Singolo';
        if (tr.isRecurring) {
            const parts = [];
            if (tr.recurrenceVal && tr.recurrenceUnit) {
                const u = tr.recurrenceUnit === 'days' ? 'giorni' : (tr.recurrenceUnit === 'months' ? 'mesi' : 'anni');
                parts.push(`Ogni ${tr.recurrenceVal} ${u}`);
            }
            if (tr.recurrenceKm) parts.push(`Ogni ${parseInt(tr.recurrenceKm).toLocaleString('it-IT')} km`);
            recurrenceStr = parts.join(' / ');
        }

        tagliandoDetailsHtml = `
            <div class="cert-detail-row">
                <span class="cert-detail-label">Intervento Programmato:</span>
                <span class="cert-detail-val">${tr.description}</span>
            </div>
            ${effectiveDate ? `
            <div class="cert-detail-row">
                <span class="cert-detail-label">Scadenza Data:</span>
                <span class="cert-detail-val">${formatDate(effectiveDate)} ${daysLeft !== null ? (daysLeft >= 0 ? `(tra ${daysLeft} gg)` : `<span style="color:#c62828;">(scaduto da ${Math.abs(daysLeft)} gg)</span>`) : ''}</span>
            </div>` : ''}
            ${targetOdo ? `
            <div class="cert-detail-row">
                <span class="cert-detail-label">Scadenza Chilometri:</span>
                <span class="cert-detail-val">${targetOdo.toLocaleString('it-IT')} km ${kmLeft !== null ? (kmLeft >= 0 ? `(mancano ${kmLeft.toLocaleString('it-IT')} km)` : `<span style="color:#c62828;">(superato di ${Math.abs(kmLeft).toLocaleString('it-IT')} km)</span>`) : ''}</span>
            </div>` : ''}
            <div class="cert-detail-row">
                <span class="cert-detail-label">Frequenza:</span>
                <span class="cert-detail-val">${recurrenceStr}</span>
            </div>
            ${lastService ? `
            <div class="cert-detail-row">
                <span class="cert-detail-label">Ultimo Eseguito:</span>
                <span class="cert-detail-val">${formatDate(lastService.date)} a ${parseInt(lastService.odometer || 0).toLocaleString('it-IT')} km</span>
            </div>` : ''}
        `;
    } else {
        // No explicit reminder set
        if (lastService) {
            tagliandoStatusClass = 'badge-neutral';
            tagliandoBorderClass = 'border-neutral';
            tagliandoStatusLabel = 'Nessun promemoria attivo';
            const kmSince = lastService.odometer ? (curOdo - parseInt(lastService.odometer)) : 0;
            tagliandoDetailsHtml = `
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Ultimo Tagliando Eseguito:</span>
                    <span class="cert-detail-val">${formatDate(lastService.date)} (${parseInt(lastService.odometer || 0).toLocaleString('it-IT')} km)</span>
                </div>
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Km percorsi dall'ultimo:</span>
                    <span class="cert-detail-val">${kmSince.toLocaleString('it-IT')} km</span>
                </div>
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Intervallo consigliato:</span>
                    <span class="cert-detail-val">Ogni 15.000 - 20.000 km o 12 mesi</span>
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-style: italic;">
                    Consigliato registrare un promemoria ricorrente per il prossimo tagliando.
                </div>
            `;
        } else {
            tagliandoStatusClass = 'badge-neutral';
            tagliandoBorderClass = 'border-neutral';
            tagliandoStatusLabel = 'Non registrato';
            tagliandoDetailsHtml = `
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Stato Manutenzione:</span>
                    <span class="cert-detail-val">Nessun tagliando registrato a sistema</span>
                </div>
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Intervallo consigliato:</span>
                    <span class="cert-detail-val">Ogni 15.000 - 20.000 km / 1 anno</span>
                </div>
            `;
        }
    }

    tagliandoCardHtml = `
        <div class="cert-upcoming-card ${tagliandoBorderClass}">
            <div class="cert-upcoming-card-header">
                <div class="cert-upcoming-card-title">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: #795548;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                    Prossimo Tagliando / Manutenzione
                </div>
                <span class="cert-status-badge ${tagliandoStatusClass}">${tagliandoStatusLabel}</span>
            </div>
            <div class="cert-upcoming-details">
                ${tagliandoDetailsHtml}
            </div>
        </div>
    `;

    // 2. EVALUATE REVISIONE (MOT)
    const revisioneReminders = reminders.filter(r => /revision|collaud|ispezion/i.test(r.description || '') && !/bombol|metano|gpl/i.test(r.description || ''));
    let revisioneCardHtml = '';
    let revStatusClass = 'badge-neutral';
    let revBorderClass = 'border-neutral';
    let revStatusLabel = 'Da verificare';
    let revDetailsHtml = '';

    if (revisioneReminders.length > 0) {
        const rr = revisioneReminders[0];
        const effectiveDate = (rr.isRecurring && rr.nextTargetDate) ? rr.nextTargetDate : rr.targetDate;
        let isExp = false;
        let isWarn = false;
        let daysLeft = null;

        if (effectiveDate) {
            const targetD = new Date(effectiveDate);
            targetD.setHours(0,0,0,0);
            daysLeft = Math.ceil((targetD - today) / (1000 * 60 * 60 * 24));
            if (effectiveDate < todayStr) isExp = true;
            else if (daysLeft <= 30) isWarn = true;
        }

        if (isExp) {
            revStatusClass = 'badge-danger';
            revBorderClass = 'border-danger';
            revStatusLabel = 'Revisione Scaduta';
        } else if (isWarn) {
            revStatusClass = 'badge-warn';
            revBorderClass = 'border-warn';
            revStatusLabel = 'In Scadenza';
        } else {
            revStatusClass = 'badge-ok';
            revBorderClass = 'border-ok';
            revStatusLabel = 'Regolare';
        }

        revDetailsHtml = `
            <div class="cert-detail-row">
                <span class="cert-detail-label">Controllo Ministeriale:</span>
                <span class="cert-detail-val">${rr.description}</span>
            </div>
            ${effectiveDate ? `
            <div class="cert-detail-row">
                <span class="cert-detail-label">Data Scadenza Prevista:</span>
                <span class="cert-detail-val">${formatDate(effectiveDate)} ${daysLeft !== null ? (daysLeft >= 0 ? `(tra ${daysLeft} gg)` : `<span style="color:#c62828;">(scaduta da ${Math.abs(daysLeft)} gg)</span>`) : ''}</span>
            </div>` : ''}
            <div class="cert-detail-row">
                <span class="cert-detail-label">Periodicità:</span>
                <span class="cert-detail-val">Biennale (ogni 2 anni)</span>
            </div>
        `;
    } else {
        if (v.year) {
            const currentYear = now.getFullYear();
            const age = currentYear - v.year;
            let estYear = null;
            if (age < 4) {
                estYear = v.year + 4;
            } else {
                estYear = currentYear + (2 - (age % 2));
            }
            revStatusClass = 'badge-neutral';
            revBorderClass = 'border-neutral';
            revStatusLabel = 'Periodicità di Legge';
            revDetailsHtml = `
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Anno Immatricolazione:</span>
                    <span class="cert-detail-val">${v.year} (Età: ${age} anni)</span>
                </div>
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Scadenza Stimata:</span>
                    <span class="cert-detail-val">${estYear} (Entro il mese di immatricolazione)</span>
                </div>
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Normativa:</span>
                    <span class="cert-detail-val">Prima revisione a 4 anni, poi ogni 2 anni</span>
                </div>
            `;
        } else {
            revStatusClass = 'badge-neutral';
            revBorderClass = 'border-neutral';
            revStatusLabel = 'Non impostata';
            revDetailsHtml = `
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Revisione Periodica:</span>
                    <span class="cert-detail-val">Nessuna data di revisione registrata</span>
                </div>
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Normativa:</span>
                    <span class="cert-detail-val">Obbligatoria ogni 2 anni (4 anni da nuovo)</span>
                </div>
            `;
        }
    }

    revisioneCardHtml = `
        <div class="cert-upcoming-card ${revBorderClass}">
            <div class="cert-upcoming-card-header">
                <div class="cert-upcoming-card-title">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: #0288d1;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                    Prossima Revisione Ministeriale
                </div>
                <span class="cert-status-badge ${revStatusClass}">${revStatusLabel}</span>
            </div>
            <div class="cert-upcoming-details">
                ${revDetailsHtml}
            </div>
        </div>
    `;

    // 3. EVALUATE REVISIONE BOMBOLE METANO (CNG)
    const isMetano = (v.fuel && /metano/i.test(v.fuel)) || reminders.some(r => /bombol|metano/i.test(r.description || '')) || vEntries.some(e => e.fuelType === 'Metano' || e.fuel2 === 'Metano' || e.fuel3 === 'Metano');
    const metanoReminders = reminders.filter(r => /bombol|metano/i.test(r.description || ''));
    let metanoCardHtml = '';

    if (isMetano || metanoReminders.length > 0) {
        let metStatusClass = 'badge-neutral';
        let metBorderClass = 'border-neutral';
        let metStatusLabel = 'Da pianificare';
        let metDetailsHtml = '';

        if (metanoReminders.length > 0) {
            const mr = metanoReminders[0];
            const effectiveDate = (mr.isRecurring && mr.nextTargetDate) ? mr.nextTargetDate : mr.targetDate;
            let isExp = false;
            let isWarn = false;
            let daysLeft = null;

            if (effectiveDate) {
                const targetD = new Date(effectiveDate);
                targetD.setHours(0,0,0,0);
                daysLeft = Math.ceil((targetD - today) / (1000 * 60 * 60 * 24));
                if (effectiveDate < todayStr) isExp = true;
                else if (daysLeft <= 30) isWarn = true;
            }

            if (isExp) {
                metStatusClass = 'badge-danger';
                metBorderClass = 'border-danger';
                metStatusLabel = 'Revisione Scaduta';
            } else if (isWarn) {
                metStatusClass = 'badge-warn';
                metBorderClass = 'border-warn';
                metStatusLabel = 'In Scadenza';
            } else {
                metStatusClass = 'badge-ok';
                metBorderClass = 'border-ok';
                metStatusLabel = 'Regolare';
            }

            let recStr = 'Quadriennale (R110) / Quinquennale (DGM)';
            if (mr.isRecurring) {
                const parts = [];
                if (mr.recurrenceVal && mr.recurrenceUnit) {
                    const u = mr.recurrenceUnit === 'days' ? 'giorni' : (mr.recurrenceUnit === 'months' ? 'mesi' : 'anni');
                    parts.push(`Ogni ${mr.recurrenceVal} ${u}`);
                }
                if (mr.recurrenceKm) parts.push(`Ogni ${parseInt(mr.recurrenceKm).toLocaleString('it-IT')} km`);
                if (parts.length > 0) recStr = parts.join(' / ');
            }

            metDetailsHtml = `
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Controllo Bombole:</span>
                    <span class="cert-detail-val">${mr.description}</span>
                </div>
                ${effectiveDate ? `
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Data Scadenza Prevista:</span>
                    <span class="cert-detail-val">${formatDate(effectiveDate)} ${daysLeft !== null ? (daysLeft >= 0 ? `(tra ${daysLeft} gg)` : `<span style="color:#c62828;">(scaduta da ${Math.abs(daysLeft)} gg)</span>`) : ''}</span>
                </div>` : ''}
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Periodicità:</span>
                    <span class="cert-detail-val">${recStr}</span>
                </div>
            `;
        } else {
            // Metano vehicle without explicit reminder
            metStatusClass = 'badge-neutral';
            metBorderClass = 'border-neutral';
            metStatusLabel = 'Obbligatoria per Legge';
            
            let estYearStr = 'Da verificare';
            if (v.year) {
                const currentYear = now.getFullYear();
                const cycle = 4; // Standard European R110
                const yearsPassed = currentYear - v.year;
                const nextCycleYear = v.year + (Math.floor(yearsPassed / cycle) + 1) * cycle;
                estYearStr = `Circa ${nextCycleYear} (ogni 4 anni R110)`;
            }

            metDetailsHtml = `
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Impianto Metano:</span>
                    <span class="cert-detail-val">Bombole CNG installate a bordo</span>
                </div>
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Normativa Collaudo:</span>
                    <span class="cert-detail-val">ECE R110: 4 anni • DGM: 5 anni</span>
                </div>
                <div class="cert-detail-row">
                    <span class="cert-detail-label">Scadenza Stimata:</span>
                    <span class="cert-detail-val">${estYearStr}</span>
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-style: italic;">
                    Consigliato registrare la data di scadenza del cartellino GFBM per il calcolo esatto.
                </div>
            `;
        }

        metanoCardHtml = `
            <div class="cert-upcoming-card ${metBorderClass}">
                <div class="cert-upcoming-card-header">
                    <div class="cert-upcoming-card-title">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: #10b981;"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                        Revisione Bombole Metano
                    </div>
                    <span class="cert-status-badge ${metStatusClass}">${metStatusLabel}</span>
                </div>
                <div class="cert-upcoming-details">
                    ${metDetailsHtml}
                </div>
            </div>
        `;
    }

    // 4. OTHER ACTIVE REMINDERS
    const gplReminders = reminders.filter(r => /gpl/i.test(r.description || ''));
    const otherReminders = reminders.filter(r => 
        !tagliandoReminders.some(tr => tr.id === r.id) && 
        !revisioneReminders.some(rr => rr.id === r.id) &&
        !metanoReminders.some(mr => mr.id === r.id) &&
        !gplReminders.some(gr => gr.id === r.id)
    );

    let otherRemindersHtml = '';
    if (otherReminders.length > 0) {
        otherRemindersHtml = `
            <div class="cert-other-reminders-list">
                <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 2px;">Altri Promemoria e Scadenze Attive:</div>
                ${otherReminders.map(r => {
                    const effectiveDate = (r.isRecurring && r.nextTargetDate) ? r.nextTargetDate : r.targetDate;
                    let badgeClass = 'badge-ok';
                    let badgeLabel = 'Attivo';
                    if (r._isExpired) {
                        badgeClass = 'badge-danger';
                        badgeLabel = 'Scaduto';
                    }
                    return `
                        <div class="cert-reminder-compact-row">
                            <span style="font-weight: 600;">📌 ${r.description}</span>
                            <span style="color: #475569;">${effectiveDate ? formatDate(effectiveDate) : ''} ${r.targetOdometer ? `• ${parseInt(r.targetOdometer).toLocaleString('it-IT')} km` : ''}</span>
                            <span class="cert-status-badge ${badgeClass}">${badgeLabel}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // OVERALL STATUS
    let overallBadgeClass = 'status-ok';
    let overallBadgeText = 'STATO VEICOLO: REGOLARE';
    if (reminders.some(r => r._isExpired)) {
        overallBadgeClass = 'status-danger';
        overallBadgeText = 'ATTENZIONE: INTERVENTI SCADUTI';
    } else if (tagliandoStatusClass === 'badge-warn' || revStatusClass === 'badge-warn') {
        overallBadgeClass = 'status-warn';
        overallBadgeText = 'PROMEMORIA: INTERVENTI IN SCADENZA';
    }

    // 4. MAINTENANCE HISTORY STATS & TABLE
    const totalMaintCost = services.reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);
    const avgIntervalKm = services.length > 1 && services[0].odometer && services[services.length - 1].odometer
        ? Math.round((parseInt(services[0].odometer) - parseInt(services[services.length - 1].odometer)) / (services.length - 1))
        : null;

    const kpiRowHtml = `
        <div class="cert-kpi-row">
            <div class="cert-kpi-card">
                <div class="cert-kpi-num">${services.length}</div>
                <div class="cert-kpi-label">Manutenzioni Registrate</div>
            </div>
            <div class="cert-kpi-card">
                <div class="cert-kpi-num">€ ${totalMaintCost.toFixed(2)}</div>
                <div class="cert-kpi-label">Spesa Totale Manutenzioni</div>
            </div>
            <div class="cert-kpi-card">
                <div class="cert-kpi-num">${lastService ? formatDate(lastService.date) : 'Nessuna'}</div>
                <div class="cert-kpi-label">Ultima Manutenzione</div>
            </div>
            <div class="cert-kpi-card">
                <div class="cert-kpi-num">${avgIntervalKm ? avgIntervalKm.toLocaleString('it-IT') + ' km' : '---'}</div>
                <div class="cert-kpi-label">Intervallo Medio Rilevato</div>
            </div>
        </div>
    `;

    // Render Table Rows
    const tableRowsHtml = services.length === 0
        ? `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 24px; font-style: italic;">Nessuna manutenzione registrata per questo veicolo.</td></tr>`
        : services.map((s) => {
            let descHtml = '';
            try {
                const parsed = JSON.parse(s.description);
                if (typeof parsed === 'object' && parsed !== null) {
                    descHtml = Object.entries(parsed).map(([item, cost]) => 
                        `<span class="cert-service-part-item"><strong>${item}</strong> (€ ${parseFloat(cost).toFixed(2)})</span>`
                    ).join(' ');
                } else {
                    descHtml = `<span class="cert-service-tag">${s.description || 'Manutenzione'}</span>`;
                }
            } catch(e) {
                descHtml = `<span class="cert-service-tag">${s.description || 'Manutenzione'}</span>`;
            }

            return `
                <tr class="cert-table-row" data-search="${(s.description + ' ' + (s.provider || '') + ' ' + (s.notes || '') + ' ' + s.date).toLowerCase()}">
                    <td style="font-weight: 600; white-space: nowrap;">${formatDate(s.date)}</td>
                    <td style="white-space: nowrap; font-weight: 700; color: #0284c7;">${s.odometer ? parseInt(s.odometer).toLocaleString('it-IT') + ' km' : '---'}</td>
                    <td>${descHtml}</td>
                    <td>${s.provider || '<span style="color:#94a3b8;">---</span>'}</td>
                    <td class="cert-service-cost">${s.cost ? '€ ' + parseFloat(s.cost).toFixed(2) : '€ 0.00'}</td>
                    <td style="color: #475569; font-size: 11px;">${s.notes || ''}</td>
                </tr>
            `;
        }).join('');

    // BUILD COMPLETE CERTIFICATE HTML
    const certHtml = `
        <!-- Document Header -->
        <div class="cert-doc-header">
            <div class="cert-brand-block">
                <div class="cert-brand-logo">
                    <svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path>
                        <circle cx="7" cy="17" r="2"></circle>
                        <path d="M9 17h6"></path>
                        <circle cx="17" cy="17" r="2"></circle>
                    </svg>
                </div>
                <div class="cert-brand-text">
                    <h1>Certificato Meccanico e Storico Manutenzioni</h1>
                    <p>CoTrack Vehicle Management System • Passaporto Digitale del Veicolo</p>
                </div>
            </div>
            <div class="cert-meta-block">
                <div class="cert-doc-badge ${overallBadgeClass}">${overallBadgeText}</div>
                <div class="cert-meta-date">Emesso il: <strong>${issueDateStr} ${issueTimeStr}</strong></div>
                <div class="cert-meta-date">Garage: <strong>${garageName}</strong></div>
            </div>
        </div>

        <!-- Vehicle Hero Banner -->
        <div class="cert-vehicle-hero">
            <div class="cert-veh-main">
                <h2>${v.brand} ${v.model}</h2>
                <span class="cert-veh-plate">${v.plate || 'SENZA TARGA'}</span>
                <span style="font-size: 12px; margin-left: 8px; opacity: 0.85;">${v.type} (${v.year || 'N/A'})</span>
            </div>
            <div class="cert-veh-odometer">
                <div class="cert-veh-odometer-label">Chilometraggio Rilevato</div>
                <div class="cert-veh-odometer-val">${curOdo.toLocaleString('it-IT')} km</div>
            </div>
        </div>

        <!-- Section 1: Dati Tecnici -->
        <div class="cert-section">
            <div class="cert-section-header">
                <h3>
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                    Dati Tecnici del Veicolo
                </h3>
            </div>
            <div class="cert-tech-grid">
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Marca e Modello</div>
                    <div class="cert-tech-value">${v.brand} ${v.model}</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Targa</div>
                    <div class="cert-tech-value" style="font-family: monospace;">${v.plate || 'Nessuna'}</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Numero Telaio (VIN)</div>
                    <div class="cert-tech-value" style="font-family: monospace;">${v.vin || 'Non specificato'}</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Tipologia Veicolo</div>
                    <div class="cert-tech-value">${v.type}</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Anno Immatricolazione</div>
                    <div class="cert-tech-value">${v.year || 'Non specificato'}</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Alimentazione</div>
                    <div class="cert-tech-value">${v.fuel}</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Classe Ambientale (Euro)</div>
                    <div class="cert-tech-value">${v.euroClass || 'Non specificata'}</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Cilindrata</div>
                    <div class="cert-tech-value">${v.engineCapacity ? v.engineCapacity.toLocaleString('it-IT') + ' cc' : 'Non specificata'}</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Potenza & Cavalli</div>
                    <div class="cert-tech-value">
                        ${(v.powerKw || v.horsePower)
                            ? `${v.powerKw ? v.powerKw + ' kW' : ''}${v.powerKw && v.horsePower ? ' • ' : ''}${v.horsePower ? v.horsePower + ' CV' : ''}`
                            : 'Non specificata'
                        }
                    </div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Cavalli Fiscali (HP)</div>
                    <div class="cert-tech-value">${v.fiscalHp ? v.fiscalHp + ' CF / HP' : 'Non specificati'}</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">${v.fuel === 'Elettrico' ? 'Batteria' : 'Serbatoio'}</div>
                    <div class="cert-tech-value">
                        ${v.fuel === 'Elettrico'
                            ? (v.batteryCapacity ? `${v.batteryCapacity} ${v.batteryCapacityUnit || 'Wh'}` : '---') + (v.batteryVoltage ? ` (${v.batteryVoltage}V)` : '')
                            : (v.tankSize ? `${v.tankSize} ${v.fuel === 'Metano' ? 'kg' : 'Litri'}` : '---')
                        }
                    </div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Contachilometri Attuale</div>
                    <div class="cert-tech-value" style="color: #0284c7;">${curOdo.toLocaleString('it-IT')} km</div>
                </div>
                <div class="cert-tech-item">
                    <div class="cert-tech-label">Campagne di Richiamo</div>
                    <div class="cert-tech-value">
                        ${v.recall_status === 'found' ? '<span style="color: #dc2626; font-weight: bold;">⚠️ Richiamo Attivo</span>' :
                          v.recall_status === 'not_found' ? '<span style="color: #16a34a; font-weight: bold;">✅ Nessun richiamo</span>' :
                          v.recall_status === 'unsupported' ? '<span style="color: #64748b;">Non supportato</span>' :
                          '<span style="color: #64748b;">Non verificato</span>'
                        }
                        ${v.last_recall_check ? `<span style="font-size: 11px; color: #64748b; font-weight: normal; display: block;">(${new Date(v.last_recall_check).toLocaleDateString('it-IT')})</span>` : ''}
                    </div>
                </div>
            </div>
        </div>

        <!-- Section 2: Prossimi Interventi da Fare -->
        <div class="cert-section">
            <div class="cert-section-header">
                <h3>
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    Riepilogo Prossimi Interventi da Fare
                </h3>
            </div>
            <div class="cert-upcoming-grid">
                ${tagliandoCardHtml}
                ${revisioneCardHtml}
                ${metanoCardHtml}
            </div>
            ${otherRemindersHtml}
        </div>

        <!-- Section 3: Storico Manutenzioni -->
        <div class="cert-section">
            <div class="cert-section-header">
                <h3>
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                    Storico Completo Manutenzioni Registrate
                </h3>
                <div class="no-print" style="display: flex; align-items: center; gap: 8px;">
                    <input type="text" id="cert-maint-search" placeholder="🔍 Cerca intervento / officina..." oninput="window.filterCertificateMaintenance(this.value)" style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 10px; font-size: 12px; outline: none; background: #ffffff;" />
                </div>
            </div>

            ${kpiRowHtml}

            <div class="cert-table-container">
                <table class="cert-table" id="cert-maintenance-table">
                    <thead>
                        <tr>
                            <th style="width: 100px;">Data</th>
                            <th style="width: 110px;">Chilometri</th>
                            <th>Argomento / Lavori e Ricambi</th>
                            <th style="width: 140px;">Officina / Fornitore</th>
                            <th style="width: 90px;">Costo</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody id="cert-maintenance-table-body">
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Document Footer -->
        <div class="cert-doc-footer">
            <div>
                Documento ufficiale generato dal sistema di tracciamento <strong>CoTrack</strong>.<br>
                I dati riflettono fedelmente tutte le registrazioni e i controlli manutentivi inseriti.
            </div>
            <div class="cert-stamp-box">
                CERTIFICATO DIGITALE COTRACK<br>
                <strong style="color: #0f172a;">${v.brand.toUpperCase()} - ${v.plate ? v.plate.toUpperCase() : 'NO-PLATE'}</strong><br>
                ${issueDateStr}
            </div>
        </div>
    `;

    const placeholder = document.getElementById('certificate-content-placeholder');
    if (placeholder) {
        placeholder.innerHTML = certHtml;
    }
};

window.filterCertificateMaintenance = function(query) {
    const q = (query || '').trim().toLowerCase();
    const rows = document.querySelectorAll('#cert-maintenance-table-body tr.cert-table-row');
    rows.forEach(row => {
        const searchData = row.getAttribute('data-search') || '';
        if (!q || searchData.includes(q)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
};

window.printCertificate = function() {
    window.print();
};

window.checkVehicleRecall = async function(vehicleId, btnEl) {
    if (!vehicleId) return;
    const originalHtml = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = `<svg class="recall-icon spinning" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Verifica...`;
    }

    try {
        const res = await fetch(`/api/vehicles/${vehicleId}/check-recall`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        
        if (!res.ok) {
            alert(data.errore || 'Errore durante la verifica dei richiami.');
            return;
        }

        // Update local vehicle in state
        const idx = state.vehicles.findIndex(v => v.id === vehicleId);
        if (idx !== -1 && data.vehicle) {
            state.vehicles[idx] = data.vehicle;
        } else if (idx !== -1) {
            state.vehicles[idx].recall_status = data.recall_status;
            state.vehicles[idx].recall_details = data.recall_details;
            state.vehicles[idx].last_recall_check = data.last_recall_check;
        }

        renderVehiclesTab();

        // Inform user with feedback
        if (data.has_recall || data.recall_status === 'found') {
            alert(`⚠️ ATTENZIONE: È stata rilevata una campagna di richiamo attiva per il veicolo!\n\n${data.recall_details || ''}\n\nÈ stata inviata una notifica email con i dettagli. Ti consigliamo di contattare un'officina autorizzata.`);
        } else if (data.recall_status === 'not_found') {
            alert(`✅ Verifica completata con successo!\n\n${data.recall_details || 'Nessuna campagna di richiamo attiva per questo veicolo.'}`);
        } else if (data.recall_details) {
            alert(`Esito verifica:\n\n${data.recall_details}`);
        }
    } catch (err) {
        console.error('Error checking vehicle recall:', err);
        alert('Errore di connessione durante la verifica dei richiami.');
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = originalHtml;
        }
    }
};