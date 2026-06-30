// ── STIPENDI STATE ────────────────────────────────────────────────────────────
const stipState = {
    groups: [],
    activeGroupId: null,
    persons: [],      // unique person names in the active group
    activePersonName: null,
    salaries: [],     // all salaries for active group
    activeSalaryId: null,
    items: [],
    subTab: 'dashboard'
};

let chartStipDonut = null;
let chartStipLine  = null;

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
    if (!stipState.activeGroupId) await loadSalaryGroups();
    if (!stipState.activeGroupId) return;

    const res = await fetch(`/api/salary_groups/${stipState.activeGroupId}/salaries`);
    stipState.salaries = res.ok ? await res.json() : [];

    // Build unique persons list
    const names = [...new Set(stipState.salaries.map(s => s.person_name))];
    stipState.persons = names;

    populatePersonSelector();
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
    stipState.persons.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        sel.appendChild(opt);
    });
    if (stipState.persons.length > 0) {
        const saved = localStorage.getItem('activeStipPerson');
        if (saved && stipState.persons.includes(saved)) {
            stipState.activePersonName = saved;
        } else {
            stipState.activePersonName = stipState.persons[0];
        }
        sel.value = stipState.activePersonName;
    } else {
        stipState.activePersonName = null;
    }
}

window.handlePersonChange = function(e) {
    stipState.activePersonName = e.target.value;
    localStorage.setItem('activeStipPerson', stipState.activePersonName);
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

function personSalaries() {
    if (!stipState.activePersonName) return [];
    return stipState.salaries.filter(s => s.person_name === stipState.activePersonName);
}

function renderStipDashboard() {
    const ps = personSalaries();
    const now = new Date();
    const last12 = ps.filter(s => {
        const d = new Date(s.month + '-01');
        const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        return diff >= 0 && diff < 12;
    });

    const grossTotal = last12.reduce((a, s) => a + s.gross, 0);
    const netTotal   = last12.reduce((a, s) => a + s.net, 0);
    const netAvg     = last12.length > 0 ? netTotal / last12.length : 0;

    document.getElementById('kpi-gross-total').textContent = fmtEur(grossTotal);
    document.getElementById('kpi-net-total').textContent   = fmtEur(netTotal);
    document.getElementById('kpi-net-avg').textContent     = fmtEur(netAvg);
    document.getElementById('kpi-assegno-unico').textContent = '– calcolato dalle voci –';
    document.getElementById('stip-dashboard-title').textContent = stipState.activePersonName || 'Dashboard Stipendi';

    // Recent table (last 5)
    const recent = [...ps].sort((a,b) => b.month.localeCompare(a.month)).slice(0, 5);
    const tbody = document.getElementById('stip-recent-table-body');
    if (!tbody) return;
    tbody.innerHTML = recent.length === 0
        ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">${window.Translations.noPayslips || 'No payslips.'}</td></tr>`
        : recent.map(s => `<tr>
            <td>${s.month}</td>
            <td style="text-align:right;">${fmtEur(s.gross)}</td>
            <td style="text-align:right;">${fmtEur(s.net)}</td>
            <td style="text-align:right;">–</td>
            <td>${s.notes || '–'}</td>
        </tr>`).join('');

    renderStipCharts(last12);
}

function renderStipCharts(data) {
    const colors = {
        net: '#8b5cf6',
        deductions: '#ef4444',
        allowances: '#3b82f6'
    };

    // Donut: avg gross breakdown (net vs deductions estimate)
    const avgGross = data.length ? data.reduce((a,s)=>a+s.gross,0)/data.length : 0;
    const avgNet   = data.length ? data.reduce((a,s)=>a+s.net,0)/data.length : 0;
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

    // Line chart: net per month
    const sorted = [...data].sort((a,b) => a.month.localeCompare(b.month));
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
}

// ── SALARY HISTORY TABLE ──────────────────────────────────────────────────────
function renderSalaryHistoryTable() {
    const ps = personSalaries().sort((a,b) => b.month.localeCompare(a.month));
    const tbody = document.getElementById('stip-history-table-body');
    if (!tbody) return;
    tbody.innerHTML = ps.length === 0
        ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">${window.Translations.noPayslips || 'No payslips.'}</td></tr>`
        : ps.map(s => `<tr>
            <td>${s.month}</td>
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
        </tr>`).join('');
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
        return `<div class="person-card">
            <div class="person-card-name">${name}</div>
            <div class="person-card-sub">${myS.length} busta/e paga · Ultimo netto: ${fmtEur(latestNet)}</div>
        </div>`;
    }).join('');
}

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
    // Persons are implicit – just add a placeholder salary month entry
    const name = document.getElementById('stip-person-name').value.trim();
    if (!name) return;
    if (!stipState.persons.includes(name)) stipState.persons.push(name);
    // Update selector
    populatePersonSelector();
    document.getElementById('active-person-select').value = name;
    stipState.activePersonName = name;
    window.closeSalaryPersonModal();
    renderPersonsGrid();
};

// ── SALARY CRUD ───────────────────────────────────────────────────────────────
window.handleSalarySubmit = async function(e) {
    e.preventDefault();
    const id   = document.getElementById('stip-edit-id').value;
    const personName = stipState.activePersonName || document.getElementById('active-person-select').value || 'Senza nome';
    const month = document.getElementById('stip-month').value;
    const gross = parseFloat(document.getElementById('stip-gross').value);
    const net   = parseFloat(document.getElementById('stip-net').value);
    const notes = document.getElementById('stip-notes').value;

    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/salaries/${id}` : `/api/salary_groups/${stipState.activeGroupId}/salaries`;
    const body   = { person_name: personName, month, gross, net, notes };

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
};

window.editSalary = function(id) {
    const s = stipState.salaries.find(x => x.id === id);
    if (!s) return;
    document.getElementById('stip-edit-id').value = s.id;
    document.getElementById('stip-month').value = s.month;
    document.getElementById('stip-gross').value = s.gross;
    document.getElementById('stip-net').value   = s.net;
    document.getElementById('stip-notes').value = s.notes || '';
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
        let optionsHtml = '';
        stipState.persons.forEach(p => {
            const selected = (c.person_name && p.toLowerCase() === c.person_name.toLowerCase()) ? 'selected' : '';
            optionsHtml += `<option value="${p}" ${selected}>${p}</option>`;
        });
        if (c.person_name && !stipState.persons.some(p => p.toLowerCase() === c.person_name.toLowerCase())) {
            optionsHtml += `<option value="${c.person_name}" selected>${c.person_name}</option>`;
        }
        if (!optionsHtml) {
            optionsHtml = `<option value="Dipendente" selected>Dipendente</option>`;
        }
        
        const itemsCount = c.items ? c.items.length : 0;
        
        return `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="text-align: center; padding: 8px;"><input type="checkbox" class="stip-pdf-row-checkbox" data-index="${index}" checked></td>
                <td style="padding: 8px;"><input type="month" class="stip-pdf-row-month" value="${c.month || ''}" style="border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}"></td>
                <td style="padding: 8px;">
                    <select class="stip-pdf-row-person" style="border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px; max-width: 150px;" data-index="${index}">
                        ${optionsHtml}
                    </select>
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
        const personSelect = document.querySelector(`.stip-pdf-row-person[data-index="${index}"]`);
        const grossInput = document.querySelector(`.stip-pdf-row-gross[data-index="${index}"]`);
        const netInput = document.querySelector(`.stip-pdf-row-net[data-index="${index}"]`);
        const notesInput = document.querySelector(`.stip-pdf-row-notes[data-index="${index}"]`);
        
        const month = monthInput ? monthInput.value : originalSalary.month;
        const person_name = personSelect ? personSelect.value : (originalSalary.person_name || "Dipendente");
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
    const dbFields = [
        { id: 'month', label: isIt ? 'Mese (YYYY-MM)' : 'Month (YYYY-MM)', required: true },
        { id: 'person_name', label: isIt ? 'Nome Persona' : 'Person Name', required: true },
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

    if (!mapping.month || !mapping.person_name || !mapping.gross || !mapping.net) {
        alert("Compila tutti i campi obbligatori (*).");
        return;
    }

    document.getElementById('stip-csv-mapping-modal').style.display = 'none';

    let formData = new FormData();
    formData.append("file", currentStipCsvFile);
    formData.append("mapping", JSON.stringify(mapping));

    try {
        let risposta = await fetch('/api/salaries/import_custom_csv?salary_group_id=' + stipState.activeGroupId, { method: 'POST', body: formData });
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
            person_name: personVal,
            gross: grossVal,
            net: netVal,
            notes: notesVal
        });
        
        let optionsHtml = '';
        stipState.persons.forEach(p => {
            const selected = (personVal && p.toLowerCase() === personVal.toLowerCase()) ? 'selected' : '';
            optionsHtml += `<option value="${p}" ${selected}>${p}</option>`;
        });
        if (personVal && !stipState.persons.some(p => p.toLowerCase() === personVal.toLowerCase())) {
            optionsHtml += `<option value="${personVal}" selected>${personVal}</option>`;
        }
        if (!optionsHtml) {
            optionsHtml = `<option value="Dipendente" selected>Dipendente</option>`;
        }
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="text-align: center;"><input type="checkbox" class="stip-custom-pdf-row-cb" data-index="${index}" checked></td>
                <td><input type="month" class="stip-custom-pdf-row-month" value="${formatDateForInput(monthVal)}" style="padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
                <td>
                    <select class="stip-custom-pdf-row-person" style="padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}">
                        ${optionsHtml}
                    </select>
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
        const personSelect = document.querySelector(`.stip-custom-pdf-row-person[data-index="${index}"]`);
        const grossInput = document.querySelector(`.stip-custom-pdf-row-gross[data-index="${index}"]`);
        const netInput = document.querySelector(`.stip-custom-pdf-row-net[data-index="${index}"]`);
        const notesInput = document.querySelector(`.stip-custom-pdf-row-notes[data-index="${index}"]`);
        
        const month = monthInput ? monthInput.value : '';
        const person_name = personSelect ? personSelect.value : 'Dipendente';
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
