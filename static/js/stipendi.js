// ── STIPENDI STATE ────────────────────────────────────────────────────────────
const stipState = {
    groups: [],
    activeGroupId: null,
    persons: [],      // unique person names in the active group
    activePersonName: null,
    salaries: [],     // all salaries for active group
    activeSalaryId: null,
    items: [],
    subTab: 'dashboard',
    dateFilter: 'all-time',
    customDateFrom: '',
    customDateTo: ''
};

let chartStipDonut = null;
let chartStipLine  = null;
let chartStipLavoroDonut = null;
let chartStipLavoroLine  = null;
let chartStipAnnuale = null;

// ── THEME SYNC ────────────────────────────────────────────────────────────────
function syncStipTheme() {
    const tab = document.getElementById('tab-stipendi');
    if (!tab) return;
    const isDark = document.body.classList.contains('dark-theme') ||
                   document.documentElement.getAttribute('data-theme') === 'dark';
    tab.classList.toggle('dark-theme', isDark);
    tab.classList.toggle('light-theme', !isDark);
}

// ── GROUP MANAGEMENT ──────────────────────────────────────────────────────────
async function loadSalaryGroups(selectId = null) {
    const res = await fetch('/api/salary_groups');
    stipState.groups = await res.json();
    const sel = document.getElementById('select-stip-group');
    if (!sel) return;
    sel.innerHTML = '';
    stipState.groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id; opt.textContent = g.name;
        sel.appendChild(opt);
    });
    if (stipState.groups.length > 0) {
        const savedId = localStorage.getItem('activeStipGroupId');
        if (selectId && stipState.groups.find(g => g.id == selectId)) {
            stipState.activeGroupId = selectId;
        } else if (savedId && stipState.groups.find(g => g.id == savedId)) {
            stipState.activeGroupId = parseInt(savedId);
        } else {
            stipState.activeGroupId = stipState.groups[0].id;
        }
        localStorage.setItem('activeStipGroupId', stipState.activeGroupId);
        sel.value = stipState.activeGroupId;
    } else {
        const r = await fetch('/api/salary_groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:'Famiglia'}) });
        if (r.ok) { const g = await r.json(); await loadSalaryGroups(g.id); }
    }
}

window.cambiaGruppoStipendi = async function() {
    const sel = document.getElementById('select-stip-group');
    stipState.activeGroupId = parseInt(sel.value);
    localStorage.setItem('activeStipGroupId', stipState.activeGroupId);
    await window.caricaDatiStipendi();
};

window.nuovoGruppoStipendi = async function() {
    const nome = prompt('Nome nuovo gruppo stipendi:');
    if (nome && nome.trim()) {
        const r = await fetch('/api/salary_groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: nome.trim()}) });
        if (r.ok) { const g = await r.json(); await loadSalaryGroups(g.id); await window.caricaDatiStipendi(); }
    }
};

window.rinominaGruppoStipendi = async function() {
    if (!stipState.activeGroupId) return;
    const sel = document.getElementById('select-stip-group');
    const cur = sel.options[sel.selectedIndex].text;
    const n = prompt('Nuovo nome:', cur);
    if (n && n.trim() && n.trim() !== cur) {
        await fetch(`/api/salary_groups/${stipState.activeGroupId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: n.trim()}) });
        await loadSalaryGroups(stipState.activeGroupId);
    }
};

window.eliminaGruppoStipendi = async function() {
    if (!stipState.activeGroupId) return;
    const sel = document.getElementById('select-stip-group');
    const cur = sel.options[sel.selectedIndex].text;
    if (!confirm(`Eliminare il gruppo "${cur}" e tutti i dati associati?`)) return;
    await fetch(`/api/salary_groups/${stipState.activeGroupId}`, { method:'DELETE' });
    stipState.activeGroupId = null;
    localStorage.removeItem('activeStipGroupId');
    await loadSalaryGroups();
    await window.caricaDatiStipendi();
};

// ── DATA LOADING ──────────────────────────────────────────────────────────────
window.caricaDatiStipendi = async function() {
    syncStipTheme();
    initStipSettingsTags();
    initStipPeriodFilterListeners();
    if (!stipState.activeGroupId) await loadSalaryGroups();
    if (!stipState.activeGroupId) return;

    const res = await fetch(`/api/salary_groups/${stipState.activeGroupId}/salaries`);
    stipState.salaries = res.ok ? await res.json() : [];

    // Build unique persons list from recorded salaries
    const names = [...new Set(stipState.salaries.map(s => s.person_name))];

    // Read custom added persons from localStorage for the active group
    const storedPersonsKey = `salary_group_${stipState.activeGroupId}_persons`;
    let storedPersons = [];
    try {
        const raw = localStorage.getItem(storedPersonsKey);
        if (raw) {
            storedPersons = JSON.parse(raw);
        }
    } catch (e) {
        console.error("Errore lettura persone da localStorage:", e);
    }

    // Merge database names with custom stored names
    stipState.persons = [...new Set([...names, ...storedPersons])];

    populatePersonSelector();

    // Toggle group members filter & form person select
    populateGroupMembersFilter();
    const formPersonGroup = document.getElementById('stip-form-person-group');
    if (formPersonGroup) {
        if (stipState.activePersonName === '__GROUP__') {
            formPersonGroup.style.display = 'flex';
            populateFormPersonSelect();
        } else {
            formPersonGroup.style.display = 'none';
        }
    }

    renderStipDashboard();
    renderSalaryHistoryTable();
    renderPersonsGrid();
};

function initStipSettingsTags() {
    const stipMonthInput = document.getElementById('setting-stip-month-tags');
    if (stipMonthInput) {
        if (!localStorage.getItem('stip_month_tags')) {
            localStorage.setItem('stip_month_tags', 'competenza, periodo, mese, cedolino, mensilità, retribuzione');
        }
        stipMonthInput.value = localStorage.getItem('stip_month_tags');
    }
    const stipPersonInput = document.getElementById('setting-stip-person-tags');
    if (stipPersonInput) {
        if (!localStorage.getItem('stip_person_tags')) {
            localStorage.setItem('stip_person_tags', 'dipendente, lavoratore, collaboratore, cognome e nome, nome e cognome, nominativo, anagrafica dipendente');
        }
        stipPersonInput.value = localStorage.getItem('stip_person_tags');
    }
    const stipGrossInput = document.getElementById('setting-stip-gross-tags');
    if (stipGrossInput) {
        if (!localStorage.getItem('stip_gross_tags')) {
            localStorage.setItem('stip_gross_tags', 'totale competenze, lordo mensile, totale lordo, retribuzione lorda, lordo, imponibile fiscale, imponibile inps, imponibile previdenziale, imponibile');
        }
        stipGrossInput.value = localStorage.getItem('stip_gross_tags');
    }
    const stipNetInput = document.getElementById('setting-stip-net-tags');
    if (stipNetInput) {
        if (!localStorage.getItem('stip_net_tags')) {
            localStorage.setItem('stip_net_tags', 'netto in busta, netto da pagare, netto a pagare, totale netto, netto cedolino, netto dovuto, netto spettante, totale a pagare, netto');
        }
        stipNetInput.value = localStorage.getItem('stip_net_tags');
    }

    // Collapsible state
    const isOpen = localStorage.getItem('stip_sidebar_tags_open') === 'true';
    const content = document.getElementById('stip-sidebar-tags-content');
    const chevron = document.getElementById('stip-sidebar-tags-chevron');
    if (content && chevron) {
        if (isOpen) {
            content.style.display = 'flex';
            chevron.style.transform = 'rotate(180deg)';
        } else {
            content.style.display = 'none';
            chevron.style.transform = 'rotate(0deg)';
        }
    }
}

window.toggleStipSidebarTags = function() {
    const content = document.getElementById('stip-sidebar-tags-content');
    const chevron = document.getElementById('stip-sidebar-tags-chevron');
    if (!content || !chevron) return;
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        chevron.style.transform = 'rotate(180deg)';
        localStorage.setItem('stip_sidebar_tags_open', 'true');
    } else {
        content.style.display = 'none';
        chevron.style.transform = 'rotate(0deg)';
        localStorage.setItem('stip_sidebar_tags_open', 'false');
    }
};

window.saveStipTagSetting = function(storageKey, value) {
    localStorage.setItem(storageKey, value);
};

window.resetStipTagsToDefault = function() {
    localStorage.setItem('stip_month_tags', 'competenza, periodo, mese, cedolino, mensilità, retribuzione');
    localStorage.setItem('stip_person_tags', 'dipendente, lavoratore, collaboratore, cognome e nome, nome e cognome, nominativo, anagrafica dipendente');
    localStorage.setItem('stip_gross_tags', 'totale competenze, lordo mensile, totale lordo, retribuzione lorda, lordo, imponibile fiscale, imponibile inps, imponibile previdenziale, imponibile');
    localStorage.setItem('stip_net_tags', 'netto in busta, netto da pagare, netto a pagare, totale netto, netto cedolino, netto dovuto, netto spettante, totale a pagare, netto');
    
    const stipMonthInput = document.getElementById('setting-stip-month-tags');
    if (stipMonthInput) stipMonthInput.value = localStorage.getItem('stip_month_tags');
    const stipPersonInput = document.getElementById('setting-stip-person-tags');
    if (stipPersonInput) stipPersonInput.value = localStorage.getItem('stip_person_tags');
    const stipGrossInput = document.getElementById('setting-stip-gross-tags');
    if (stipGrossInput) stipGrossInput.value = localStorage.getItem('stip_gross_tags');
    const stipNetInput = document.getElementById('setting-stip-net-tags');
    if (stipNetInput) stipNetInput.value = localStorage.getItem('stip_net_tags');
};

function populatePersonSelector() {
    const sel = document.getElementById('active-person-select');
    if (!sel) return;
    sel.innerHTML = '';
    
    // Add the Group option
    const optGroup = document.createElement('option');
    optGroup.value = '__GROUP__';
    optGroup.textContent = '👥 ' + (window.Translations.allGroup || 'Tutto il gruppo');
    sel.appendChild(optGroup);

    stipState.persons.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        sel.appendChild(opt);
    });
    
    const saved = localStorage.getItem(`activeStipPerson_${stipState.activeGroupId}`);
    if (saved && (saved === '__GROUP__' || stipState.persons.includes(saved))) {
        stipState.activePersonName = saved;
    } else {
        stipState.activePersonName = '__GROUP__';
    }
    sel.value = stipState.activePersonName;
}

window.handlePersonChange = function(e) {
    stipState.activePersonName = e.target.value;
    localStorage.setItem(`activeStipPerson_${stipState.activeGroupId}`, stipState.activePersonName);
    
    // Toggle group members filter
    populateGroupMembersFilter();
    
    // Toggle person select in form
    const formPersonGroup = document.getElementById('stip-form-person-group');
    if (formPersonGroup) {
        if (stipState.activePersonName === '__GROUP__') {
            formPersonGroup.style.display = 'flex';
            populateFormPersonSelect();
        } else {
            formPersonGroup.style.display = 'none';
        }
    }
    
    renderStipDashboard();
    renderSalaryHistoryTable();
};

function populateFormPersonSelect() {
    const sel = document.getElementById('stip-form-person');
    if (!sel) return;
    sel.innerHTML = '';
    stipState.persons.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        sel.appendChild(opt);
    });
}

function getSelectedGroupPersons() {
    const storageKey = `stip_group_selected_persons_${stipState.activeGroupId}`;
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length > 0) {
                return arr.filter(p => stipState.persons.includes(p));
            }
        }
    } catch(e) {}
    return [...stipState.persons];
}

function populateGroupMembersFilter() {
    const container = document.getElementById('stip-group-members-filter');
    const listContainer = document.getElementById('stip-group-members-list');
    if (!container || !listContainer) return;
    
    if (stipState.activePersonName === '__GROUP__') {
        container.classList.remove('hidden');
        
        const selected = getSelectedGroupPersons();
        
        listContainer.innerHTML = stipState.persons.map(name => {
            const isChecked = selected.includes(name) ? 'checked' : '';
            return `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85em; cursor: pointer; color: var(--text-secondary); font-weight: 500; user-select: none;">
                    <input type="checkbox" class="stip-group-person-cb" value="${name}" ${isChecked} onchange="window.handleGroupPersonToggle()" style="accent-color: var(--primary-color); width: 15px; height: 15px; cursor: pointer;">
                    <span>${name}</span>
                </label>
            `;
        }).join('');
    } else {
        container.classList.add('hidden');
        listContainer.innerHTML = '';
    }
}

window.handleGroupPersonToggle = function() {
    const checkboxes = document.querySelectorAll('.stip-group-person-cb');
    const selected = [];
    checkboxes.forEach(cb => {
        if (cb.checked) selected.push(cb.value);
    });
    
    const storageKey = `stip_group_selected_persons_${stipState.activeGroupId}`;
    localStorage.setItem(storageKey, JSON.stringify(selected));
    
    renderStipDashboard();
    renderSalaryHistoryTable();
};

// ── SUB-TAB SWITCHER ──────────────────────────────────────────────────────────
window.switchStipSubTab = function(tab, event) {
    if (event) event.preventDefault();
    stipState.subTab = tab;
    document.querySelectorAll('[data-stip-tab]').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-stip-tab') === tab);
    });
    document.querySelectorAll('.stip-tab-content').forEach(el => {
        el.classList.toggle('active', el.id === `stip-tab-${tab}`);
    });
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function fmtEur(v) { return '€ ' + (v || 0).toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}); }

function getPeriodDateRangeLocal(period, customFrom, customTo) {
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

function personSalaries() {
    if (stipState.activePersonName === '__GROUP__') {
        const selected = getSelectedGroupPersons();
        return stipState.salaries.filter(s => selected.includes(s.person_name));
    }
    if (!stipState.activePersonName) return [];
    return stipState.salaries.filter(s => s.person_name === stipState.activePersonName);
}

function getFilteredSalaries() {
    const ps = personSalaries();
    const filter = stipState.dateFilter || 'all-time';
    if (filter === 'all-time') {
        return ps;
    }
    const { startDate, endDate } = getPeriodDateRangeLocal(filter, stipState.customDateFrom, stipState.customDateTo);
    return ps.filter(s => {
        const sDate = s.month + '-01';
        if (startDate && sDate < startDate) return false;
        if (endDate && sDate > endDate) return false;
        return true;
    });
}

function initStipPeriodFilterListeners() {
    const elPeriodFilterSelect = document.getElementById('stip-period-filter-select');
    const elCustomDateInputs = document.getElementById('stip-custom-date-inputs');
    const elFilterDateFrom = document.getElementById('stip-filter-date-from');
    const elFilterDateTo = document.getElementById('stip-filter-date-to');

    if (elPeriodFilterSelect) {
        elPeriodFilterSelect.value = stipState.dateFilter || 'all-time';
        if (stipState.dateFilter === 'custom') {
            elCustomDateInputs.classList.remove('hidden');
        } else {
            elCustomDateInputs.classList.add('hidden');
        }
        elPeriodFilterSelect.onchange = (e) => {
            const val = e.target.value;
            stipState.dateFilter = val;
            if (val === 'custom') {
                elCustomDateInputs.classList.remove('hidden');
            } else {
                elCustomDateInputs.classList.add('hidden');
            }
            renderStipDashboard();
            renderSalaryHistoryTable();
        };
    }
    if (elFilterDateFrom) {
        elFilterDateFrom.value = stipState.customDateFrom || '';
        elFilterDateFrom.onchange = (e) => {
            stipState.customDateFrom = e.target.value;
            renderStipDashboard();
            renderSalaryHistoryTable();
        };
    }
    if (elFilterDateTo) {
        elFilterDateTo.value = stipState.customDateTo || '';
        elFilterDateTo.onchange = (e) => {
            stipState.customDateTo = e.target.value;
            renderStipDashboard();
            renderSalaryHistoryTable();
        };
    }
}

function renderStipDashboard() {
    const filtered = getFilteredSalaries();

    const grossTotal    = filtered.reduce((a, s) => a + s.gross, 0);
    const netTotal      = filtered.reduce((a, s) => a + s.net, 0);
    
    // Average calculated over unique months in filtered set
    const uniqueMonths  = [...new Set(filtered.map(s => s.month))].length;
    const netAvg        = uniqueMonths > 0 ? netTotal / uniqueMonths : 0;

    // Derived: lordo/netto da lavoro (exclude extra components)
    const grossLavoroTotal = filtered.reduce((a, s) => a + calcolaLordoLavoro(s), 0);
    const netLavoroTotal   = filtered.reduce((a, s) => a + calcolaNettoLavoro(s), 0);
    const netLavoroAvg     = uniqueMonths > 0 ? netLavoroTotal / uniqueMonths : 0;

    document.getElementById('kpi-gross-total').textContent = fmtEur(grossTotal);
    document.getElementById('kpi-net-total').textContent   = fmtEur(netTotal);
    document.getElementById('kpi-net-avg').textContent     = fmtEur(netAvg);

    // Update Lordo/Netto Lavoro KPIs
    const kpiGrossLavoro = document.getElementById('kpi-gross-lavoro-total');
    if (kpiGrossLavoro) kpiGrossLavoro.textContent = fmtEur(grossLavoroTotal);

    const kpiNetLavoro = document.getElementById('kpi-net-lavoro-total');
    if (kpiNetLavoro) kpiNetLavoro.textContent = fmtEur(netLavoroTotal);

    const kpiNetLavoroAvg = document.getElementById('kpi-net-lavoro-avg');
    if (kpiNetLavoroAvg) kpiNetLavoroAvg.textContent = fmtEur(netLavoroAvg);

    const activeGroupName = document.getElementById('select-stip-group')?.options[document.getElementById('select-stip-group').selectedIndex]?.text || '';
    document.getElementById('stip-dashboard-title').textContent = stipState.activePersonName === '__GROUP__'
        ? (activeGroupName ? `Dashboard ${activeGroupName}` : 'Dashboard Gruppo')
        : (stipState.activePersonName || 'Dashboard Stipendi');

    // Recent table (last 5)
    const recent = [...filtered].sort((a,b) => b.month.localeCompare(a.month)).slice(0, 5);
    const tbody = document.getElementById('stip-recent-table-body');
    if (!tbody) return;
    tbody.innerHTML = recent.length === 0
        ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">${window.Translations.noPayslips || 'No payslips.'}</td></tr>`
        : recent.map(s => {
            const lavoroLordo = calcolaLordoLavoro(s);
            const lavoroNetto = calcolaNettoLavoro(s);
            const badge13 = s.tredicesima ? ' <span style="font-size:0.7em;background:#f3e5f5;color:#7b1fa2;border-radius:3px;padding:1px 5px;font-weight:700;">13ª</span>' : '';
            const labelPerson = stipState.activePersonName === '__GROUP__' ? ` <span style="font-size:0.8em;color:var(--text-muted);">(${s.person_name})</span>` : '';
            return `<tr>
                <td>${s.month}${labelPerson}${badge13}</td>
                <td style="text-align:right;">${fmtEur(s.gross)}</td>
                <td style="text-align:right;">${fmtEur(s.net)}</td>
                <td style="text-align:right;color:var(--primary-color);font-weight:600;" title="Lordo lavoro: ${fmtEur(lavoroLordo)}">${fmtEur(lavoroNetto)}</td>
                <td>${s.notes || '–'}</td>
            </tr>`;
        }).join('');

    renderStipCharts(filtered);
}

// ── HELPER: calcolo lordo/netto da lavoro ─────────────────────────────────────
function calcolaLordoLavoro(s) {
    return Math.max(0, (s.gross || 0) - (s.premio_produzione_lordo || 0) - (s.tfr_liquidato || 0));
}
function calcolaNettoLavoro(s) {
    return Math.max(0, (s.net || 0) - (s.rimborso_spese || 0) - (s.conguaglio_fiscale || 0)
                                     - (s.premio_produzione_netto || 0) - (s.tfr_liquidato || 0));
}

// Live preview in form
window.updateStipPreview = function() {
    const gross  = parseFloat(document.getElementById('stip-gross')?.value) || 0;
    const net    = parseFloat(document.getElementById('stip-net')?.value) || 0;
    const rimb   = parseFloat(document.getElementById('stip-rimborso-spese')?.value) || 0;
    const cong   = parseFloat(document.getElementById('stip-conguaglio-fiscale')?.value) || 0;
    const pLordo = parseFloat(document.getElementById('stip-premio-lordo')?.value) || 0;
    const pNetto = parseFloat(document.getElementById('stip-premio-netto')?.value) || 0;
    const tfr    = parseFloat(document.getElementById('stip-tfr-liquidato')?.value) || 0;
    const lordo  = Math.max(0, gross - pLordo - tfr);
    const netto  = Math.max(0, net - rimb - cong - pNetto - tfr);
    const elL = document.getElementById('stip-preview-lordo');
    const elN = document.getElementById('stip-preview-netto');
    if (elL) elL.textContent = fmtEur(lordo);
    if (elN) elN.textContent = fmtEur(netto);
};

function renderStipCharts(data) {
    const colors = {
        net: '#8b5cf6',
        deductions: '#ef4444',
        allowances: '#3b82f6'
    };

    const uniqueMonths = [...new Set(data.map(s => s.month))].length;

    // Donut: avg gross breakdown (net vs deductions estimate)
    const avgGross = uniqueMonths > 0 ? data.reduce((a,s)=>a+s.gross,0)/uniqueMonths : 0;
    const avgNet   = uniqueMonths > 0 ? data.reduce((a,s)=>a+s.net,0)/uniqueMonths : 0;
    const avgDed   = Math.max(0, avgGross - avgNet);

    const donutCtx = document.getElementById('chart-stip-donut');
    if (donutCtx) {
        if (chartStipDonut) chartStipDonut.destroy();
        chartStipDonut = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Netto', 'Trattenute Stimate'],
                datasets: [{ data: [avgNet, avgDed], backgroundColor: ['#8b5cf6','#ef4444'], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: { legend: { position: 'bottom', labels: { color: '#64748b', padding: 16, font: { size: 12 } } } }
            }
        });
    }

    // Merge monthly values for line charts (if group mode has multiple people in same month)
    let monthlyMerged = [];
    if (stipState.activePersonName === '__GROUP__') {
        const monthlyMap = {};
        data.forEach(s => {
            if (!monthlyMap[s.month]) {
                monthlyMap[s.month] = { month: s.month, net: 0, gross: 0, grossLavoro: 0, netLavoro: 0 };
            }
            monthlyMap[s.month].net += s.net || 0;
            monthlyMap[s.month].gross += s.gross || 0;
            monthlyMap[s.month].grossLavoro += calcolaLordoLavoro(s) || 0;
            monthlyMap[s.month].netLavoro += calcolaNettoLavoro(s) || 0;
        });
        monthlyMerged = Object.values(monthlyMap);
    } else {
        monthlyMerged = data.map(s => ({
            month: s.month,
            net: s.net,
            gross: s.gross,
            grossLavoro: calcolaLordoLavoro(s),
            netLavoro: calcolaNettoLavoro(s)
        }));
    }
    const sorted = monthlyMerged.sort((a,b) => a.month.localeCompare(b.month));

    const lineCtx = document.getElementById('chart-stip-line');
    if (lineCtx) {
        if (chartStipLine) chartStipLine.destroy();
        chartStipLine = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: sorted.map(s => s.month),
                datasets: [{
                    label: 'Netto', data: sorted.map(s => s.net),
                    borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)',
                    fill: true, tension: 0.4, pointBackgroundColor: '#8b5cf6', pointRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { ticks: { color: '#64748b', font: { size: 11 }, callback: v => '€' + v.toLocaleString('it-IT') }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }

    // Donut Lavoro: avg gross work breakdown (net work vs work deductions estimate)
    const avgGrossLavoro = uniqueMonths > 0 ? data.reduce((a,s)=>a+calcolaLordoLavoro(s),0)/uniqueMonths : 0;
    const avgNetLavoro   = uniqueMonths > 0 ? data.reduce((a,s)=>a+calcolaNettoLavoro(s),0)/uniqueMonths : 0;
    const avgDedLavoro   = Math.max(0, avgGrossLavoro - avgNetLavoro);

    const lavoroDonutCtx = document.getElementById('chart-stip-lavoro-donut');
    if (lavoroDonutCtx) {
        if (chartStipLavoroDonut) chartStipLavoroDonut.destroy();
        chartStipLavoroDonut = new Chart(lavoroDonutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Netto Lavoro', 'Trattenute Lavoro'],
                datasets: [{ data: [avgNetLavoro, avgDedLavoro], backgroundColor: ['#14b8a6','#f97316'], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: { legend: { position: 'bottom', labels: { color: '#64748b', padding: 16, font: { size: 12 } } } }
            }
        });
    }

    // Line chart Lavoro: lordo vs netto lavoro per month
    const lavoroLineCtx = document.getElementById('chart-stip-lavoro-line');
    if (lavoroLineCtx) {
        if (chartStipLavoroLine) chartStipLavoroLine.destroy();
        chartStipLavoroLine = new Chart(lavoroLineCtx, {
            type: 'line',
            data: {
                labels: sorted.map(s => s.month),
                datasets: [
                    {
                        label: 'Lordo Lavoro', data: sorted.map(s => s.grossLavoro),
                        borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.05)',
                        fill: true, tension: 0.4, pointBackgroundColor: '#f97316', pointRadius: 4
                    },
                    {
                        label: 'Netto Lavoro', data: sorted.map(s => s.netLavoro),
                        borderColor: '#14b8a6', backgroundColor: 'rgba(20,184,166,0.05)',
                        fill: true, tension: 0.4, pointBackgroundColor: '#14b8a6', pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { color: '#64748b', font: { size: 12 } } } },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { ticks: { color: '#64748b', font: { size: 11 }, callback: v => '€' + v.toLocaleString('it-IT') }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }

    // ── CHART: ANNUAL TREND (Gross, Net, Gross Work, Net Work) ───────────────────
    const yearlyData = {};
    data.forEach(s => {
        const year = s.month.split('-')[0];
        if (!yearlyData[year]) {
            yearlyData[year] = { gross: 0, net: 0, grossLavoro: 0, netLavoro: 0 };
        }
        yearlyData[year].gross += s.gross || 0;
        yearlyData[year].net += s.net || 0;
        yearlyData[year].grossLavoro += calcolaLordoLavoro(s) || 0;
        yearlyData[year].netLavoro += calcolaNettoLavoro(s) || 0;
    });
    const years = Object.keys(yearlyData).sort();

    const annualCtx = document.getElementById('chart-stip-annuale');
    if (annualCtx) {
        if (chartStipAnnuale) chartStipAnnuale.destroy();
        chartStipAnnuale = new Chart(annualCtx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [
                    {
                        label: 'Lordo',
                        data: years.map(y => yearlyData[y].gross),
                        borderColor: '#8b5cf6', // purple
                        backgroundColor: 'rgba(139,92,246,0.05)',
                        fill: false, tension: 0.3, pointBackgroundColor: '#8b5cf6', pointRadius: 5, borderWidth: 3
                    },
                    {
                        label: 'Netto',
                        data: years.map(y => yearlyData[y].net),
                        borderColor: '#22c55e', // green
                        backgroundColor: 'rgba(34,197,94,0.05)',
                        fill: false, tension: 0.3, pointBackgroundColor: '#22c55e', pointRadius: 5, borderWidth: 3
                    },
                    {
                        label: 'Lordo Lavoro',
                        data: years.map(y => yearlyData[y].grossLavoro),
                        borderColor: '#f97316', // orange
                        backgroundColor: 'rgba(249,115,22,0.05)',
                        fill: false, tension: 0.3, pointBackgroundColor: '#f97316', pointRadius: 5, borderWidth: 3
                    },
                    {
                        label: 'Netto Lavoro',
                        data: years.map(y => yearlyData[y].netLavoro),
                        borderColor: '#14b8a6', // teal
                        backgroundColor: 'rgba(20,184,166,0.05)',
                        fill: false, tension: 0.3, pointBackgroundColor: '#14b8a6', pointRadius: 5, borderWidth: 3
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#64748b', font: { size: 12, weight: 'bold' } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += fmtEur(context.parsed.y);
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 12, weight: '600' } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { ticks: { color: '#64748b', font: { size: 11 }, callback: v => '€' + v.toLocaleString('it-IT') }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }
}

// ── SALARY HISTORY TABLE ──────────────────────────────────────────────────────
function renderSalaryHistoryTable() {
    const filtered = getFilteredSalaries().sort((a,b) => b.month.localeCompare(a.month));
    const tbody = document.getElementById('stip-history-table-body');
    if (!tbody) return;
    tbody.innerHTML = filtered.length === 0
        ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">${window.Translations.noPayslips || 'No payslips.'}</td></tr>`
        : filtered.map(s => {
            const labelPerson = stipState.activePersonName === '__GROUP__' ? ` <span style="font-size:0.8em;color:var(--text-muted);">(${s.person_name})</span>` : '';
            return `<tr>
                <td>${s.month}${labelPerson}</td>
                <td style="text-align:right;">${fmtEur(s.gross)}</td>
                <td style="text-align:right;">${fmtEur(s.net)}</td>
                <td>${s.notes || '–'}</td>
                <td style="text-align:center;">
                    <button class="icon-btn" onclick="window.openStipItems('${s.id}')" title="Voci" style="margin-right:4px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    </button>
                    <button class="icon-btn" onclick="window.editSalary('${s.id}')" title="Modifica" style="margin-right:4px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="icon-btn btn-delete" onclick="window.deleteSalary('${s.id}')" title="Elimina">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </td>
            </tr>`;
        }).join('');
}

// ── PERSONS GRID ──────────────────────────────────────────────────────────────
function renderPersonsGrid() {
    const container = document.getElementById('stip-persons-grid');
    if (!container) return;
    if (stipState.persons.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);">${window.Translations.noPeopleRegistered || 'No people. Add a payslip to create a person.'}</p>`;
        return;
    }
    container.innerHTML = stipState.persons.map(name => {
        const myS = stipState.salaries.filter(s => s.person_name === name);
        const latestNet = myS.length ? myS.sort((a,b) => b.month.localeCompare(a.month))[0].net : 0;
        
        // Show delete button only if the person has no payslips registered
        const deleteBtn = myS.length === 0 
            ? `<button class="icon-btn btn-delete" onclick="window.removeSalaryPerson('${name}')" title="Elimina" style="border:none; background:none; cursor:pointer; color:#ef4444; font-size:1.1em; padding:4px;">🗑️</button>`
            : '';

        return `<div class="person-card" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
            <div>
                <div class="person-card-name">${name}</div>
                <div class="person-card-sub">${myS.length} busta/e paga · Ultimo netto: ${fmtEur(latestNet)}</div>
            </div>
            ${deleteBtn}
        </div>`;
    }).join('');
}

window.removeSalaryPerson = function(name) {
    if (!confirm(`Eliminare la persona "${name}"?`)) return;
    
    // Remove from localStorage stored persons list
    const storedPersonsKey = `salary_group_${stipState.activeGroupId}_persons`;
    let storedPersons = [];
    try {
        const raw = localStorage.getItem(storedPersonsKey);
        if (raw) storedPersons = JSON.parse(raw);
    } catch (e) {}
    
    storedPersons = storedPersons.filter(p => p !== name);
    localStorage.setItem(storedPersonsKey, JSON.stringify(storedPersons));
    
    // Clear selection if it was this person
    const activeKey = `activeStipPerson_${stipState.activeGroupId}`;
    if (localStorage.getItem(activeKey) === name) {
        localStorage.removeItem(activeKey);
    }
    
    window.caricaDatiStipendi();
};

// ── PERSON MODAL ──────────────────────────────────────────────────────────────
window.openSalaryPersonModal = function(name = null) {
    document.getElementById('stip-person-edit-name').value = name || '';
    document.getElementById('stip-person-name').value = name || '';
    document.getElementById('stip-person-modal-title').textContent = name ? 'Modifica Persona' : 'Nuova Persona';
    document.getElementById('stip-person-modal').classList.add('open');
};
window.closeSalaryPersonModal = function() { document.getElementById('stip-person-modal').classList.remove('open'); };
window.handlePersonSubmit = function(e) {
    e.preventDefault();
    const name = document.getElementById('stip-person-name').value.trim();
    if (!name) return;
    
    // Save to localStorage for this group to persist the person
    const storedPersonsKey = `salary_group_${stipState.activeGroupId}_persons`;
    let storedPersons = [];
    try {
        const raw = localStorage.getItem(storedPersonsKey);
        if (raw) storedPersons = JSON.parse(raw);
    } catch (e) {}
    
    if (!storedPersons.includes(name)) {
        storedPersons.push(name);
        localStorage.setItem(storedPersonsKey, JSON.stringify(storedPersons));
    }

    if (!stipState.persons.includes(name)) stipState.persons.push(name);
    // Update selector
    populatePersonSelector();
    document.getElementById('active-person-select').value = name;
    stipState.activePersonName = name;
    localStorage.setItem(`activeStipPerson_${stipState.activeGroupId}`, name);
    window.closeSalaryPersonModal();
    renderPersonsGrid();
};

// ── SALARY CRUD ───────────────────────────────────────────────────────────────
window.handleSalarySubmit = async function(e) {
    e.preventDefault();
    const id   = document.getElementById('stip-edit-id').value;
    let personName = stipState.activePersonName;
    if (personName === '__GROUP__') {
        personName = document.getElementById('stip-form-person').value;
    }
    if (!personName || personName === '__GROUP__') {
        alert("Seleziona una persona a cui associare la busta paga.");
        return;
    }
    const month = document.getElementById('stip-month').value;
    const gross = parseFloat(document.getElementById('stip-gross').value) || 0;
    const net   = parseFloat(document.getElementById('stip-net').value) || 0;
    const notes = document.getElementById('stip-notes').value;
    const rimborso_spese           = parseFloat(document.getElementById('stip-rimborso-spese').value) || 0;
    const conguaglio_fiscale       = parseFloat(document.getElementById('stip-conguaglio-fiscale').value) || 0;
    const premio_produzione_lordo  = parseFloat(document.getElementById('stip-premio-lordo').value) || 0;
    const premio_produzione_netto  = parseFloat(document.getElementById('stip-premio-netto').value) || 0;
    const tfr_liquidato            = parseFloat(document.getElementById('stip-tfr-liquidato').value) || 0;
    const tredicesima              = document.getElementById('stip-tredicesima').checked;

    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/salaries/${id}` : `/api/salary_groups/${stipState.activeGroupId}/salaries`;
    const body   = { person_name: personName, month, gross, net, notes,
                     rimborso_spese, conguaglio_fiscale,
                     premio_produzione_lordo, premio_produzione_netto,
                     tfr_liquidato, tredicesima };

    const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) {
        window.resetSalaryForm();
        await window.caricaDatiStipendi();
    } else {
        alert('Errore durante il salvataggio.');
    }
};

window.resetSalaryForm = function() {
    document.getElementById('stip-edit-id').value = '';
    document.getElementById('stip-salary-form').reset();
    // Reset numeric extras to 0 (form.reset() sets them to '' since they have value="0")
    ['stip-rimborso-spese','stip-conguaglio-fiscale','stip-premio-lordo','stip-premio-netto','stip-tfr-liquidato'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '0';
    });
    window.updateStipPreview();
};

window.editSalary = function(id) {
    const s = stipState.salaries.find(x => x.id === id);
    if (!s) return;
    document.getElementById('stip-edit-id').value = s.id;
    document.getElementById('stip-month').value = s.month;
    document.getElementById('stip-gross').value = s.gross;
    document.getElementById('stip-net').value   = s.net;
    document.getElementById('stip-notes').value = s.notes || '';
    document.getElementById('stip-rimborso-spese').value    = s.rimborso_spese || 0;
    document.getElementById('stip-conguaglio-fiscale').value = s.conguaglio_fiscale || 0;
    document.getElementById('stip-premio-lordo').value      = s.premio_produzione_lordo || 0;
    document.getElementById('stip-premio-netto').value      = s.premio_produzione_netto || 0;
    document.getElementById('stip-tfr-liquidato').value     = s.tfr_liquidato || 0;
    document.getElementById('stip-tredicesima').checked     = !!s.tredicesima;
    // Open the details section if any extra field is set
    const hasExtras = (s.rimborso_spese || s.conguaglio_fiscale || s.premio_produzione_lordo ||
                       s.premio_produzione_netto || s.tfr_liquidato || s.tredicesima);
    const details = document.getElementById('stip-extra-details');
    if (details && hasExtras) details.open = true;
    window.updateStipPreview();
    window.switchStipSubTab('buste', null);
    document.getElementById('stip-salary-form').scrollIntoView({ behavior:'smooth' });
};

window.deleteSalary = async function(id) {
    if (!confirm('Eliminare questa busta paga e le voci associate?')) return;
    const res = await fetch(`/api/salaries/${id}`, { method:'DELETE' });
    if (res.ok) await window.caricaDatiStipendi();
    else alert('Errore durante l\'eliminazione.');
};

// ── SALARY ITEMS MODAL ────────────────────────────────────────────────────────
window.openStipItems = async function(salaryId) {
    stipState.activeSalaryId = salaryId;
    document.getElementById('stip-items-salary-id').value = salaryId;
    const s = stipState.salaries.find(x => x.id === salaryId);
    document.getElementById('stip-items-current-info').textContent = s ? `${s.person_name} – ${s.month}` : '';
    await loadAndRenderItems(salaryId);
    document.getElementById('stip-items-modal').classList.add('open');
};

window.closeStipItemsModal = function() { document.getElementById('stip-items-modal').classList.remove('open'); };

async function loadAndRenderItems(salaryId) {
    const res = await fetch(`/api/salaries/${salaryId}/items`);
    stipState.items = res.ok ? await res.json() : [];
    const typeLabels = { bonus:'Bonus/Assegno', deduction:'Trattenuta', allowance:'Rimborso' };
    const badgeCls   = { bonus:'badge-bonus', deduction:'badge-deduction', allowance:'badge-allowance' };
    const tbody = document.getElementById('stip-items-table-body');
    tbody.innerHTML = stipState.items.length === 0
        ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:12px;">${window.Translations.noItems || 'No items.'}</td></tr>`
        : stipState.items.map(i => `<tr>
            <td>${i.label}</td>
            <td><span class="badge ${badgeCls[i.item_type]||''}">${typeLabels[i.item_type]||i.item_type}</span></td>
            <td style="text-align:right;">${fmtEur(i.amount)}</td>
            <td style="text-align:center;">
                <button class="icon-btn btn-delete" onclick="window.deleteSalaryItem('${i.id}','${salaryId}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </td>
        </tr>`).join('');
}

window.handleSalaryItemSubmit = async function(e) {
    e.preventDefault();
    const salaryId = document.getElementById('stip-items-salary-id').value;
    const label  = document.getElementById('stip-item-label').value.trim();
    const type   = document.getElementById('stip-item-type').value;
    const amount = parseFloat(document.getElementById('stip-item-amount').value);
    if (!label || isNaN(amount)) return;
    const res = await fetch(`/api/salaries/${salaryId}/items`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ label, item_type: type, amount })
    });
    if (res.ok) {
        document.getElementById('stip-item-label').value = '';
        document.getElementById('stip-item-amount').value = '';
        await loadAndRenderItems(salaryId);
    }
};

window.deleteSalaryItem = async function(itemId, salaryId) {
    if (!confirm('Eliminare questa voce?')) return;
    await fetch(`/api/salary_items/${itemId}`, { method:'DELETE' });
    await loadAndRenderItems(salaryId);
};

// ── PDF IMPORT ────────────────────────────────────────────────────────────────
// ── PDF IMPORT ────────────────────────────────────────────────────────────────
let parsedStipPdfSalaries = [];

window.handleStipPdfUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!stipState.activeGroupId) { alert('Seleziona un gruppo prima.'); event.target.value=''; return; }

    const loader = document.getElementById('stip-pdf-loading');
    if (loader) loader.style.display = 'block';

    const fd = new FormData();
    fd.append('file', file);
    
    // Add custom parsing tags
    fd.append('month_tags', localStorage.getItem('stip_month_tags') || 'competenza, periodo, mese, cedolino, mensilità, retribuzione');
    fd.append('person_tags', localStorage.getItem('stip_person_tags') || 'dipendente, lavoratore, collaboratore, cognome e nome, nome e cognome, nominativo, anagrafica dipendente');
    fd.append('gross_tags', localStorage.getItem('stip_gross_tags') || 'totale competenze, lordo mensile, totale lordo, retribuzione lorda, lordo, imponibile fiscale, imponibile inps, imponibile previdenziale, imponibile');
    fd.append('net_tags', localStorage.getItem('stip_net_tags') || 'netto in busta, netto da pagare, netto a pagare, totale netto, netto cedolino, netto dovuto, netto spettante, totale a pagare, netto');

    try {
        const res = await fetch('/api/salaries/parse_pdf', { method:'POST', body: fd });
        if (loader) loader.style.display = 'none';
        event.target.value = '';
        if (res.ok) {
            const data = await res.json();
            const salaries = data.salaries || [];
            if (salaries.length === 0) {
                alert("Nessuno stipendio rilevato nel file PDF.");
                return;
            }
            window.openStipPdfReviewModal(salaries);
        } else {
            const err = await res.json();
            alert('Errore PDF: ' + (err.errore || 'Errore sconosciuto'));
        }
    } catch(e) {
        if (loader) loader.style.display = 'none';
        event.target.value = '';
        alert('Errore di rete.');
    }
};

window.openStipPdfReviewModal = function(salaries) {
    parsedStipPdfSalaries = salaries;
    const tbody = document.getElementById("stip-pdf-salaries-review-body");
    if (!tbody) return;
    
    tbody.innerHTML = salaries.map((c, index) => {
        const itemsCount = c.items ? c.items.length : 0;
        
        let personSelectHtml = '';
        if (stipState.activePersonName === '__GROUP__') {
            personSelectHtml = `<select class="stip-pdf-row-person" style="border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}">
                ${stipState.persons.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>`;
        } else {
            personSelectHtml = `<span class="stip-pdf-row-person-name" data-index="${index}">${stipState.activePersonName || 'Dipendente'}</span>`;
        }
        
        return `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="text-align: center; padding: 8px;"><input type="checkbox" class="stip-pdf-row-checkbox" data-index="${index}" checked></td>
                <td style="padding: 8px;"><input type="month" class="stip-pdf-row-month" value="${c.month || ''}" style="border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}"></td>
                <td style="padding: 8px; font-weight: 500;">
                    ${personSelectHtml}
                </td>
                <td style="padding: 8px;"><input type="number" step="0.01" class="stip-pdf-row-gross" value="${c.gross || 0.00}" style="width: 90px; text-align: right; border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}"></td>
                <td style="padding: 8px;"><input type="number" step="0.01" class="stip-pdf-row-net" value="${c.net || 0.00}" style="width: 90px; text-align: right; border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}"></td>
                <td style="text-align: center; padding: 8px; font-weight: bold; color: var(--primary-color);">${itemsCount}</td>
                <td style="padding: 8px;"><input type="text" class="stip-pdf-row-notes" value="${c.notes || ''}" style="width: 100%; min-width: 120px; border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}"></td>
            </tr>
        `;
    }).join("");
    
    document.getElementById("stip-pdf-select-all-checkbox").checked = true;
    document.getElementById("stip-pdf-review-modal").classList.add("open");
};

window.closeStipPdfReviewModal = function() {
    document.getElementById("stip-pdf-review-modal").classList.remove("open");
    parsedStipPdfSalaries = [];
};

window.toggleSelectAllStipContributions = function(masterCb) {
    const checkboxes = document.querySelectorAll(".stip-pdf-row-checkbox");
    checkboxes.forEach(cb => cb.checked = masterCb.checked);
};

window.submitStipPdfImportedSalaries = async function() {
    if (!stipState.activeGroupId) return;
    
    const checkboxes = document.querySelectorAll(".stip-pdf-row-checkbox:checked");
    if (checkboxes.length === 0) {
        alert("Seleziona almeno uno stipendio da importare.");
        return;
    }
    
    let importedCount = 0;
    for (let cb of checkboxes) {
        const index = parseInt(cb.getAttribute("data-index"));
        const originalSalary = parsedStipPdfSalaries[index];
        if (!originalSalary) continue;
        
        const monthInput = document.querySelector(`.stip-pdf-row-month[data-index="${index}"]`);
        const grossInput = document.querySelector(`.stip-pdf-row-gross[data-index="${index}"]`);
        const netInput = document.querySelector(`.stip-pdf-row-net[data-index="${index}"]`);
        const notesInput = document.querySelector(`.stip-pdf-row-notes[data-index="${index}"]`);
        
        const month = monthInput ? monthInput.value : originalSalary.month;
        
        let person_name;
        if (stipState.activePersonName === '__GROUP__') {
            const selectEl = document.querySelector(`.stip-pdf-row-person[data-index="${index}"]`);
            person_name = selectEl ? selectEl.value : '';
        } else {
            person_name = stipState.activePersonName || "Dipendente";
        }
        const gross = grossInput ? parseFloat(grossInput.value) : (originalSalary.gross || 0.0);
        const net = netInput ? parseFloat(netInput.value) : (originalSalary.net || 0.0);
        const notes = notesInput ? notesInput.value : (originalSalary.notes || "Importato da PDF");
        
        if (!month || !person_name) {
            alert("Mese e nome persona sono obbligatori.");
            return;
        }
        
        const body = { person_name, month, gross, net, notes };
        
        try {
            const res = await fetch(`/api/salary_groups/${stipState.activeGroupId}/salaries`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const newSalary = await res.json();
                importedCount++;
                
                const items = originalSalary.items || [];
                for (let item of items) {
                    const itemBody = {
                        label: item.label || "Voce",
                        amount: item.amount || 0.0,
                        item_type: item.item_type || "deduction"
                    };
                    await fetch(`/api/salaries/${newSalary.id}/items`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(itemBody)
                    });
                }
            }
        } catch (e) {
            console.error("Errore importazione stipendio:", e);
        }
    }
    
    window.closeStipPdfReviewModal();
    alert(`${importedCount} stipendi importati con successo.`);
    await window.caricaDatiStipendi();
};

// ── CSV IMPORT & MAPPING ──────────────────────────────────────────────────────
let currentStipCsvFile = null;

window.handleStipCSVUpload = async function(event) {
    let file = event.target.files[0];
    if (!file) return;
    if (!stipState.activeGroupId) {
        alert("Seleziona un gruppo stipendi prima di caricare.");
        event.target.value = '';
        return;
    }
    
    let formData = new FormData();
    formData.append("file", file);
    
    try {
        let res = await fetch('/api/preview_csv', { method: 'POST', body: formData });
        if (!res.ok) {
            let err = await res.json();
            alert(err.errore || "Errore nella lettura del file");
            event.target.value = '';
            return;
        }
        let data = await res.json();
        openStipMappingModal(file, data.headers, data.sample);
    } catch (e) {
        alert("Errore di rete");
        event.target.value = '';
    }
};

function openStipMappingModal(file, headers, sample) {
    currentStipCsvFile = file;
    let container = document.getElementById('stip-mapping-fields');
    if (!container) return;
    container.innerHTML = '';

    const isIt = document.documentElement.lang === 'it';
    const isPersonRequired = !stipState.activePersonName || stipState.activePersonName === '__GROUP__';
    const dbFields = [
        { id: 'month', label: isIt ? 'Mese (YYYY-MM)' : 'Month (YYYY-MM)', required: true },
        { id: 'person_name', label: isIt ? 'Nome Persona' : 'Person Name', required: isPersonRequired },
        { id: 'gross', label: isIt ? 'Stipendio Lordo' : 'Gross Salary', required: true },
        { id: 'net', label: isIt ? 'Stipendio Netto' : 'Net Salary', required: true },
        { id: 'notes', label: isIt ? 'Note / Descrizione' : 'Notes / Description', required: false }
    ];

    let optionsHtml = '<option value="">-- Ignora / Non presente --</option>';
    headers.forEach((h, i) => {
        let sampleText = sample[i] ? ` (es., ${sample[i]})` : '';
        optionsHtml += `<option value="${h}">${h}${sampleText}</option>`;
    });

    dbFields.forEach(field => {
        let row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        let reqStar = field.required ? '<span style="color:red;">*</span>' : '';
        row.innerHTML = `<label style="margin: 0; width: 45%; font-size: 0.9em; font-weight: 600;">${field.label} ${reqStar}</label><select id="stipmap_${field.id}" style="width: 50%; padding: 8px; border-radius: 6px; border: 1px solid #ced4da;">${optionsHtml}</select>`;
        container.appendChild(row);

        let select = row.querySelector('select');
        let bestMatch = '';
        let labelLower = field.id.toLowerCase();
        for (let i = 0; i < headers.length; i++) {
            let hLower = headers[i].toLowerCase();
            if (hLower.includes(labelLower) || labelLower.includes(hLower) ||
                (labelLower === 'month' && (hLower.includes('mese') || hLower.includes('month') || hLower.includes('data') || hLower.includes('date'))) ||
                (labelLower === 'person_name' && (hLower.includes('persona') || hLower.includes('nome') || hLower.includes('person') || hLower.includes('name'))) ||
                (labelLower === 'gross' && (hLower.includes('lordo') || hLower.includes('gross') || hLower.includes('imponibile'))) ||
                (labelLower === 'net' && (hLower.includes('netto') || hLower.includes('net'))) ||
                (labelLower === 'notes' && (hLower.includes('note') || hLower.includes('descrizione') || hLower.includes('info')))
            ) {
                bestMatch = headers[i];
                break;
            }
        }
        if (bestMatch) select.value = bestMatch;
    });

    document.getElementById('stip-csv-mapping-modal').style.display = 'flex';
}

window.confermaMappingStipendiCSV = async function() {
    let mapping = {
        month: document.getElementById('stipmap_month').value,
        person_name: document.getElementById('stipmap_person_name').value,
        gross: document.getElementById('stipmap_gross').value,
        net: document.getElementById('stipmap_net').value,
        notes: document.getElementById('stipmap_notes').value
    };

    const isPersonRequired = !stipState.activePersonName || stipState.activePersonName === '__GROUP__';
    if (!mapping.month || (isPersonRequired && !mapping.person_name) || !mapping.gross || !mapping.net) {
        alert("Compila tutti i campi obbligatori (*).");
        return;
    }

    document.getElementById('stip-csv-mapping-modal').style.display = 'none';

    let formData = new FormData();
    formData.append("file", currentStipCsvFile);
    formData.append("mapping", JSON.stringify(mapping));

    try {
        let url = `/api/salaries/import_custom_csv?salary_group_id=${stipState.activeGroupId}`;
        if (stipState.activePersonName && stipState.activePersonName !== '__GROUP__') {
            url += `&person_name=${encodeURIComponent(stipState.activePersonName)}`;
        }
        let risposta = await fetch(url, { method: 'POST', body: formData });
        let result = await risposta.json();
        if (risposta.ok) {
            alert(result.messaggio);
            await window.caricaDatiStipendi();
        } else {
            alert(result.errore || "Errore durante l'importazione.");
        }
    } catch (error) {
        alert("Errore di rete durante l'importazione.");
    } finally {
        currentStipCsvFile = null;
        document.getElementById('stip-custom-csv-file').value = '';
    }
};

// ── INIT ──────────────────────────────────────────────────────────────────────
window.caricaDatiStipendi = window.caricaDatiStipendi || (async function() {});

// ── CUSTOM PDF IMPORT ─────────────────────────────────────────────────────────
let parsedStipCustomPdfRows = [];

function cleanFloatStr(str) {
    if (!str) return '0.00';
    str = str.replace('€', '').replace('$', '').trim();
    str = str.replace(/\s/g, '');
    if (str.includes('.') && str.includes(',')) {
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            str = str.replace(/,/g, '');
        }
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    const val = parseFloat(str);
    return isNaN(val) ? '0.00' : val.toFixed(2);
}

function formatDateForInput(str) {
    if (!str) return '';
    str = str.trim();
    let m = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
    if (m) {
        return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    m = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
    if (m) {
        return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    // Handle YYYY-MM
    m = str.match(/^(\d{4})[\/\.-](\d{1,2})$/);
    if (m) {
        return `${m[1]}-${m[2].padStart(2, '0')}`;
    }
    return str;
}

window.handleStipCustomPdfUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!stipState.activeGroupId) {
        alert("Seleziona un gruppo stipendi prima di caricare.");
        event.target.value = '';
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch('/api/extract_pdf_text', { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json();
            alert(err.errore || "Errore durante l'estrazione del testo.");
            event.target.value = '';
            return;
        }
        const data = await res.json();
        
        document.getElementById('stip-custom-pdf-text').value = data.text;
        
        // Initialize mapping selectors
        const selectors = [
            { id: 'stip-custom-pdf-map-month', def: '1' },
            { id: 'stip-custom-pdf-map-person', def: '2' },
            { id: 'stip-custom-pdf-map-gross', def: '3' },
            { id: 'stip-custom-pdf-map-net', def: '4' },
            { id: 'stip-custom-pdf-map-notes', def: 'none' }
        ];
        
        selectors.forEach(selObj => {
            const sel = document.getElementById(selObj.id);
            if (!sel) return;
            sel.innerHTML = '<option value="none">-- Ignora --</option>';
            for (let i = 1; i <= 9; i++) {
                sel.innerHTML += `<option value="${i}">Group ${i}</option>`;
            }
            sel.value = selObj.def;
        });

        // Set default regex
        document.getElementById('stip-custom-pdf-regex').value = '(\\d{4}-\\d{2})\\s+([\\w\\s]+?)\\s+([\\d.,]+)\\s+([\\d.,]+)';
        document.getElementById('stip-custom-pdf-preview-body').innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Clicca Test & Parse per elaborare.</td></tr>`;
        
        document.getElementById('stip-custom-pdf-modal').style.display = 'flex';
    } catch (e) {
        alert("Errore di rete durante la lettura del PDF.");
    } finally {
        event.target.value = '';
    }
};

window.testStipCustomPdfRegex = function() {
    const text = document.getElementById('stip-custom-pdf-text').value;
    const patternStr = document.getElementById('stip-custom-pdf-regex').value.trim();
    if (!patternStr) { alert("Inserisci un pattern regex."); return; }
    
    let regex;
    try {
        regex = new RegExp(patternStr, 'g');
    } catch(e) {
        alert("Regex non valida: " + e.message);
        return;
    }
    
    const monthGroup = document.getElementById('stip-custom-pdf-map-month').value;
    const personGroup = document.getElementById('stip-custom-pdf-map-person').value;
    const grossGroup = document.getElementById('stip-custom-pdf-map-gross').value;
    const netGroup = document.getElementById('stip-custom-pdf-map-net').value;
    const notesGroup = document.getElementById('stip-custom-pdf-map-notes').value;
    
    const tbody = document.getElementById('stip-custom-pdf-preview-body');
    tbody.innerHTML = '';
    
    let match;
    let index = 0;
    parsedStipCustomPdfRows = [];
    
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
        if (match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        const monthVal = monthGroup !== 'none' ? (match[parseInt(monthGroup)] || '').trim() : '';
        const personVal = personGroup !== 'none' ? (match[parseInt(personGroup)] || '').trim() : '';
        const grossVal = grossGroup !== 'none' ? (match[parseInt(grossGroup)] || '').trim() : '';
        const netVal = netGroup !== 'none' ? (match[parseInt(netGroup)] || '').trim() : '';
        const notesVal = notesGroup !== 'none' ? (match[parseInt(notesGroup)] || '').trim() : '';
        
        parsedStipCustomPdfRows.push({
            month: monthVal,
            person_name: stipState.activePersonName || 'Dipendente',
            gross: grossVal,
            net: netVal,
            notes: notesVal
        });
        
        let personHtml = '';
        if (stipState.activePersonName === '__GROUP__') {
            personHtml = `<select class="stip-custom-pdf-row-person" style="padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}">
                ${stipState.persons.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>`;
        } else {
            personHtml = `<span class="stip-custom-pdf-row-person-name" data-index="${index}">${stipState.activePersonName || "Dipendente"}</span>`;
        }
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="text-align: center;"><input type="checkbox" class="stip-custom-pdf-row-cb" data-index="${index}" checked></td>
                <td><input type="month" class="stip-custom-pdf-row-month" value="${formatDateForInput(monthVal)}" style="padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
                <td style="font-weight: 500; font-size: 12px; padding: 4px;">
                    ${personHtml}
                </td>
                <td><input type="number" step="0.01" class="stip-custom-pdf-row-gross" value="${cleanFloatStr(grossVal)}" style="width: 80px; text-align: right; padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
                <td><input type="number" step="0.01" class="stip-custom-pdf-row-net" value="${cleanFloatStr(netVal)}" style="width: 80px; text-align: right; padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
                <td><input type="text" class="stip-custom-pdf-row-notes" value="${notesVal || 'Importazione PDF Personalizzata'}" style="width: 100%; min-width: 100px; padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
            </tr>
        `;
        index++;
    }
    
    if (parsedStipCustomPdfRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nessuna corrispondenza trovata con questo pattern.</td></tr>`;
    }
};

window.toggleAllStipCustomPdfRows = function(masterCb) {
    const checkBoxes = document.querySelectorAll('.stip-custom-pdf-row-cb');
    checkBoxes.forEach(cb => cb.checked = masterCb.checked);
};

window.confirmStipCustomPdfImport = async function() {
    if (!stipState.activeGroupId) return;
    
    const checkboxes = document.querySelectorAll(".stip-custom-pdf-row-cb:checked");
    if (checkboxes.length === 0) {
        alert("Seleziona almeno uno stipendio da importare.");
        return;
    }
    
    let importedCount = 0;
    for (let cb of checkboxes) {
        const index = parseInt(cb.getAttribute("data-index"));
        const monthInput = document.querySelector(`.stip-custom-pdf-row-month[data-index="${index}"]`);
        const grossInput = document.querySelector(`.stip-custom-pdf-row-gross[data-index="${index}"]`);
        const netInput = document.querySelector(`.stip-custom-pdf-row-net[data-index="${index}"]`);
        const notesInput = document.querySelector(`.stip-custom-pdf-row-notes[data-index="${index}"]`);
        
        const month = monthInput ? monthInput.value : '';
        
        let person_name;
        if (stipState.activePersonName === '__GROUP__') {
            const selectEl = document.querySelector(`.stip-custom-pdf-row-person[data-index="${index}"]`);
            person_name = selectEl ? selectEl.value : '';
        } else {
            person_name = stipState.activePersonName || 'Dipendente';
        }
        const gross = grossInput ? parseFloat(grossInput.value) : 0.0;
        const net = netInput ? parseFloat(netInput.value) : 0.0;
        const notes = notesInput ? notesInput.value : 'Importato da PDF personalizzato';
        
        if (!month || !person_name) {
            alert("Mese e nome persona sono obbligatori.");
            return;
        }
        
        const body = { person_name, month, gross, net, notes };
        
        try {
            const res = await fetch(`/api/salary_groups/${stipState.activeGroupId}/salaries`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                importedCount++;
            }
        } catch (e) {
            console.error("Errore importazione stipendio:", e);
        }
    }
    
    document.getElementById('stip-custom-pdf-modal').style.display = 'none';
    alert(`${importedCount} stipendi importati con successo.`);
    await window.caricaDatiStipendi();
};

window.clearSalaryHistory = async function() {
    const gId = stipState.activeGroupId;
    const personName = stipState.activePersonName;
    if (!gId || !personName) return;
    if (personName === '__GROUP__') {
        alert("Seleziona una singola persona per svuotare la sua cronologia.");
        return;
    }
    const confirmation = confirm(`Sei sicuro di voler eliminare TUTTE le buste paga di "${personName}"? Questa azione non può essere annullata.`);
    if (!confirmation) return;

    try {
        const res = await fetch(`/api/salary_groups/${gId}/salaries/clear?person_name=${encodeURIComponent(personName)}`, { method: 'DELETE' });
        if (res.ok) {
            alert('Cronologia buste paga svuotata con successo.');
            await window.caricaDatiStipendi();
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.errore || 'Errore durante l\'eliminazione della cronologia.');
        }
    } catch (e) {
        alert('Errore di connessione.');
    }
};
