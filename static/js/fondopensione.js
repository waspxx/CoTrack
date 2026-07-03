// ── FONDO PENSIONE STATE ──────────────────────────────────────────────────────
const fpState = {
    groups: [],
    activeGroupId: null,
    funds: [],
    activeFundId: null,
    contributions: [],
    subTab: 'dashboard',
    dateFilter: 'all-time',
    customDateFrom: '',
    customDateTo: '',
    scrapedFunds: null,
    selectedScrapedFund: null
};

let chartFPDonut = null;
let chartFPBar   = null;
let chartFPTrend = null;

// ── THEME SYNC ────────────────────────────────────────────────────────────────
function syncFPTheme() {
    const tab = document.getElementById('tab-fondopensione');
    if (!tab) return;
    const isDark = document.body.classList.contains('dark-theme') ||
                   document.documentElement.getAttribute('data-theme') === 'dark';
    tab.classList.toggle('dark-theme', isDark);
    tab.classList.toggle('light-theme', !isDark);
}

function populateScrapedFundsDatalist() {
    const list = document.getElementById('scraped-funds-list');
    if (!list || !fpState.scrapedFunds) return;
    list.innerHTML = '';
    fpState.scrapedFunds.forEach(fund => {
        const option = document.createElement('option');
        option.value = fund.nome;
        list.appendChild(option);
    });
}

function setupScrapedFundsAutocompleteListener() {
    const nameInput = document.getElementById('fp-fund-name');
    if (!nameInput) return;
    
    nameInput.addEventListener('input', () => {
        const val = nameInput.value.trim();
        const matched = fpState.scrapedFunds.find(f => f.nome.toLowerCase() === val.toLowerCase());
        if (matched) {
            fpState.selectedScrapedFund = matched;
            
            // Auto fill Manager/Provider
            const providerInput = document.getElementById('fp-fund-provider');
            if (providerInput && !providerInput.value) {
                providerInput.value = matched.ente_o_promotore || '';
            }
            
            // Auto fill Type
            const typeSelect = document.getElementById('fp-fund-type');
            if (typeSelect) {
                if (matched.tipo === 'FPN') typeSelect.value = 'category';
                else if (matched.tipo === 'FPA') typeSelect.value = 'open';
                else if (matched.tipo === 'PIP') typeSelect.value = 'pip';
            }
            
            // Auto fill Investing link with first compartment link
            const linkInput = document.getElementById('fp-fund-investing-link');
            if (linkInput && !linkInput.value && matched.comparti && matched.comparti.length > 0) {
                linkInput.value = matched.comparti[0].link_dati_storici || '';
            }
        } else {
            fpState.selectedScrapedFund = null;
        }
    });
}

// ── GROUP MANAGEMENT ──────────────────────────────────────────────────────────
async function loadFPGroups(selectId = null) {
    const res = await fetch('/api/pension_fund_groups');
    fpState.groups = await res.json();
    const sel = document.getElementById('select-fp-group');
    if (!sel) return;
    sel.innerHTML = '';
    fpState.groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id; opt.textContent = g.name;
        sel.appendChild(opt);
    });
    if (fpState.groups.length > 0) {
        const savedId = localStorage.getItem('activeFPGroupId');
        if (selectId && fpState.groups.find(g => g.id == selectId)) {
            fpState.activeGroupId = selectId;
        } else if (savedId && fpState.groups.find(g => g.id == savedId)) {
            fpState.activeGroupId = parseInt(savedId);
        } else {
            fpState.activeGroupId = fpState.groups[0].id;
        }
        localStorage.setItem('activeFPGroupId', fpState.activeGroupId);
        sel.value = fpState.activeGroupId;
    } else {
        const r = await fetch('/api/pension_fund_groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:'I Miei Fondi'}) });
        if (r.ok) { const g = await r.json(); await loadFPGroups(g.id); }
    }
}

window.cambiaGruppoFP = async function() {
    const sel = document.getElementById('select-fp-group');
    fpState.activeGroupId = parseInt(sel.value);
    localStorage.setItem('activeFPGroupId', fpState.activeGroupId);
    await window.caricaDatiFP();
};

window.nuovoGruppoFP = async function() {
    const nome = prompt('Nome nuovo gruppo:');
    if (nome && nome.trim()) {
        const r = await fetch('/api/pension_fund_groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: nome.trim()}) });
        if (r.ok) { const g = await r.json(); await loadFPGroups(g.id); await window.caricaDatiFP(); }
    }
};

window.rinominaGruppoFP = async function() {
    if (!fpState.activeGroupId) return;
    const sel = document.getElementById('select-fp-group');
    const cur = sel.options[sel.selectedIndex].text;
    const n = prompt('Nuovo nome:', cur);
    if (n && n.trim() && n.trim() !== cur) {
        await fetch(`/api/pension_fund_groups/${fpState.activeGroupId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: n.trim()}) });
        await loadFPGroups(fpState.activeGroupId);
    }
};

window.eliminaGruppoFP = async function() {
    if (!fpState.activeGroupId) return;
    const sel = document.getElementById('select-fp-group');
    const cur = sel.options[sel.selectedIndex].text;
    if (!confirm(`Eliminare il gruppo "${cur}" e tutti i fondi associati?`)) return;
    await fetch(`/api/pension_fund_groups/${fpState.activeGroupId}`, { method:'DELETE' });
    fpState.activeGroupId = null;
    localStorage.removeItem('activeFPGroupId');
    await loadFPGroups();
    await window.caricaDatiFP();
};

// ── DATA LOADING ──────────────────────────────────────────────────────────────
window.caricaDatiFP = async function() {
    syncFPTheme();
    if (!fpState.scrapedFunds) {
        try {
            const r = await fetch('/api/scraped_funds');
            if (r.ok) {
                fpState.scrapedFunds = await r.json();
                populateScrapedFundsDatalist();
                setupScrapedFundsAutocompleteListener();
            }
        } catch (e) {
            console.error('Failed to load scraped funds:', e);
        }
    }
    initFPPeriodFilterListeners();
    if (!fpState.activeGroupId) await loadFPGroups();
    if (!fpState.activeGroupId) return;

    const res = await fetch(`/api/pension_fund_groups/${fpState.activeGroupId}/funds`);
    fpState.funds = res.ok ? await res.json() : [];

    populateFundSelector();

    if (fpState.activeFundId) {
        await loadContributions(fpState.activeFundId);
    } else {
        fpState.contributions = [];
    }

    await renderFPDashboard();
    renderFPContribTable();
    renderFundsGrid();
};

function populateFundSelector() {
    const sel = document.getElementById('active-fund-select');
    if (!sel) return;
    sel.innerHTML = '';
    fpState.funds.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id; opt.textContent = f.name;
        sel.appendChild(opt);
    });
    if (fpState.funds.length > 0) {
        const saved = localStorage.getItem('activeFundId');
        if (saved && fpState.funds.find(f => f.id === saved)) {
            fpState.activeFundId = saved;
        } else {
            fpState.activeFundId = fpState.funds[0].id;
        }
        sel.value = fpState.activeFundId;
    } else {
        fpState.activeFundId = null;
    }
}

window.handleFundChange = async function(e) {
    fpState.activeFundId = e.target.value;
    localStorage.setItem('activeFundId', fpState.activeFundId);
    await loadContributions(fpState.activeFundId);
    renderFPDashboard();
    renderFPContribTable();
};

async function loadContributions(fundId) {
    const res = await fetch(`/api/pension_funds/${fundId}/contributions`);
    fpState.contributions = res.ok ? await res.json() : [];
}

// ── SUB-TAB SWITCHER ──────────────────────────────────────────────────────────
window.switchFPSubTab = function(tab, event) {
    if (event) event.preventDefault();
    fpState.subTab = tab;
    document.querySelectorAll('[data-fp-tab]').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-fp-tab') === tab);
    });
    document.querySelectorAll('.fp-tab-content').forEach(el => {
        el.classList.toggle('active', el.id === `fp-tab-${tab}`);
    });
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function fmtEurFP(v) { return '€ ' + (v || 0).toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}); }

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

function getFilteredContributions() {
    const cs = fpState.contributions;
    const filter = fpState.dateFilter || 'all-time';
    if (filter === 'all-time') {
        return cs;
    }
    const { startDate, endDate } = getPeriodDateRangeLocal(filter, fpState.customDateFrom, fpState.customDateTo);
    return cs.filter(c => {
        const cDate = c.month + '-01';
        if (startDate && cDate < startDate) return false;
        if (endDate && cDate > endDate) return false;
        return true;
    });
}

function initFPPeriodFilterListeners() {
    const elPeriodFilterSelect = document.getElementById('fp-period-filter-select');
    const elCustomDateInputs = document.getElementById('fp-custom-date-inputs');
    const elFilterDateFrom = document.getElementById('fp-filter-date-from');
    const elFilterDateTo = document.getElementById('fp-filter-date-to');

    if (elPeriodFilterSelect) {
        elPeriodFilterSelect.value = fpState.dateFilter || 'all-time';
        if (fpState.dateFilter === 'custom') {
            elCustomDateInputs.classList.remove('hidden');
        } else {
            elCustomDateInputs.classList.add('hidden');
        }
        elPeriodFilterSelect.onchange = (e) => {
            const val = e.target.value;
            fpState.dateFilter = val;
            if (val === 'custom') {
                elCustomDateInputs.classList.remove('hidden');
            } else {
                elCustomDateInputs.classList.add('hidden');
            }
            renderFPDashboard();
            renderFPContribTable();
        };
    }
    if (elFilterDateFrom) {
        elFilterDateFrom.value = fpState.customDateFrom || '';
        elFilterDateFrom.onchange = (e) => {
            fpState.customDateFrom = e.target.value;
            renderFPDashboard();
            renderFPContribTable();
        };
    }
    if (elFilterDateTo) {
        elFilterDateTo.value = fpState.customDateTo || '';
        elFilterDateTo.onchange = (e) => {
            fpState.customDateTo = e.target.value;
            renderFPDashboard();
            renderFPContribTable();
        };
    }
}

async function renderFPDashboard() {
    const cs = getFilteredContributions();
    const totalTFR      = cs.reduce((a,c) => a + c.tfr, 0);
    const totalWorker   = cs.reduce((a,c) => a + c.worker_contrib, 0);
    const totalEmployer = cs.reduce((a,c) => a + c.employer_contrib, 0);
    const totalPaid     = totalTFR + totalWorker + totalEmployer;
    const totalSpese    = cs.reduce((a,c) => a + (parseFloat(c.spese) || 0), 0);
    const totalNet      = totalPaid - totalSpese;

    document.getElementById('fp-kpi-total').textContent    = fmtEurFP(totalPaid);
    document.getElementById('fp-kpi-tfr').textContent      = fmtEurFP(totalTFR);
    document.getElementById('fp-kpi-worker').textContent   = fmtEurFP(totalWorker);
    document.getElementById('fp-kpi-employer').textContent = fmtEurFP(totalEmployer);

    const kpiTotalSpeseEl = document.getElementById('fp-kpi-total-spese');
    if (kpiTotalSpeseEl) {
        const pctSpese = totalPaid > 0 ? (totalSpese / totalPaid) * 100 : 0;
        const labelSpese = window.Translations.expensesLabel || 'Spese';
        kpiTotalSpeseEl.textContent = `${labelSpese}: ${fmtEurFP(totalSpese)} (${pctSpese.toFixed(2)}%)`;
    }

    // Default calculations if no historical data is loaded
    let controvalore = 0;
    const totalQuote = cs.reduce((a,c) => a + (parseFloat(c.numero_quote) || 0), 0);
    const lastContribWithPrice = cs.find(c => (parseFloat(c.valore_quota) || 0) > 0);
    const lastPrice = lastContribWithPrice ? parseFloat(lastContribWithPrice.valore_quota) : 0;
    controvalore = totalQuote * lastPrice;
    
    let trendMonths = [];
    let trendValuation = [];
    let trendInvested = [];
    let currentDetailsText = `${totalQuote.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} quote @ ${lastPrice.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €`;

    if (fpState.activeFundId) {
        try {
            const vRes = await fetch(`/api/pension_funds/${fpState.activeFundId}/valuation_data`);
            if (vRes.ok) {
                const vData = await vRes.json();
                if (vData.trend_months && vData.trend_months.length > 0) {
                    controvalore = vData.current_val;
                    trendMonths = vData.trend_months;
                    trendValuation = vData.trend_valuation;
                    trendInvested = vData.trend_invested;
                    
                    // Build detailed string for compartments
                    if (vData.current_price_details && vData.current_price_details.length > 0) {
                        const parts = vData.current_price_details.map(d => {
                            if (d.quotes > 0) {
                                return `${d.name}: ${d.quotes.toLocaleString('it-IT')} q. @ ${d.latest_price.toLocaleString('it-IT')} €`;
                            }
                            return '';
                        }).filter(Boolean);
                        if (parts.length > 0) {
                            currentDetailsText = parts.join(' | ');
                        } else {
                            currentDetailsText = '0,00 quote';
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Errore nel recupero dati di controvalore storico:", e);
        }
    }

    const kpiControvaloreEl = document.getElementById('fp-kpi-controvalore');
    if (kpiControvaloreEl) {
        kpiControvaloreEl.textContent = fmtEurFP(controvalore);
        
        // Rendimento / Gain
        const perfEl = document.getElementById('fp-kpi-controvalore-perf');
        if (perfEl) {
            if (controvalore > 0 && totalPaid > 0) {
                const diff = controvalore - totalPaid;
                const pct = (diff / totalPaid) * 100;
                const sign = diff >= 0 ? '+' : '';
                const color = diff >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
                perfEl.textContent = `${sign}${fmtEurFP(diff)} (${sign}${pct.toFixed(2)}%)`;
                perfEl.style.color = color;
                perfEl.style.display = 'block';
            } else {
                perfEl.style.display = 'none';
            }
        }

        // Details: quote @ price or compartments info
        const detailsEl = document.getElementById('fp-kpi-controvalore-details');
        if (detailsEl) {
            detailsEl.textContent = currentDetailsText;
        }
    }

    const activeFund = fpState.funds.find(f => f.id === fpState.activeFundId);
    document.getElementById('fp-dashboard-title').textContent = activeFund ? activeFund.name : 'Dashboard Fondo Pensione';

    // Recent table (last 6)
    const recent = [...cs].slice(0, 6);
    const tbody = document.getElementById('fp-recent-table-body');
    if (tbody) {
        tbody.innerHTML = recent.length === 0
            ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">${window.Translations.noContributions || 'No contributions.'}</td></tr>`
            : recent.map(c => `<tr>
                <td>${c.month}</td>
                <td style="text-align:right;">${fmtEurFP(c.tfr)}</td>
                <td style="text-align:right;">${fmtEurFP(c.worker_contrib)}</td>
                <td style="text-align:right;">${fmtEurFP(c.employer_contrib)}</td>
                <td style="text-align:right;font-weight:700;">${fmtEurFP(c.tfr + c.worker_contrib + c.employer_contrib)}</td>
                <td>${c.notes||'–'}</td>
            </tr>`).join('');
    }

    renderFPCharts(cs);
    renderFPHistoricalTrendChart(trendMonths, trendValuation, trendInvested);
}

function renderFPHistoricalTrendChart(months, valuation, invested) {
    const trendCtx = document.getElementById('chart-fp-trend');
    if (!trendCtx) return;
    
    if (chartFPTrend) chartFPTrend.destroy();
    
    if (!months || months.length === 0) {
        chartFPTrend = null;
        return;
    }

    chartFPTrend = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Controvalore (€)',
                    data: valuation,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    pointHoverRadius: 5
                },
                {
                    label: 'Capitale Versato Netto (€)',
                    data: invested,
                    borderColor: '#94a3b8',
                    backgroundColor: 'rgba(148, 163, 184, 0.05)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#64748b', font: { size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += '€ ' + context.parsed.y.toLocaleString('it-IT', { minimumFractionDigits: 2 });
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', font: { size: 11 } },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#64748b',
                        font: { size: 11 },
                        callback: v => '€ ' + v.toLocaleString('it-IT')
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
}

function renderFPCharts(cs) {
    const totalTFR      = cs.reduce((a,c)=>a+c.tfr,0);
    const totalWorker   = cs.reduce((a,c)=>a+c.worker_contrib,0);
    const totalEmployer = cs.reduce((a,c)=>a+c.employer_contrib,0);

    // Donut
    const donutCtx = document.getElementById('chart-fp-donut');
    if (donutCtx) {
        if (chartFPDonut) chartFPDonut.destroy();
        chartFPDonut = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['TFR','Quota Lavoratore','Quota Datore'],
                datasets: [{ data:[totalTFR,totalWorker,totalEmployer], backgroundColor:['#f59e0b','#3b82f6','#22c55e'], borderWidth:0 }]
            },
            options: {
                responsive:true, maintainAspectRatio:false, cutout:'65%',
                plugins:{ legend:{ position:'bottom', labels:{ color:'#64748b', padding:14, font:{size:12} } } }
            }
        });
    }

    // Bar chart – monthly totals (last 12)
    const sorted = [...cs].sort((a,b)=>a.month.localeCompare(b.month)).slice(-12);
    const barCtx = document.getElementById('chart-fp-bar');
    if (barCtx) {
        if (chartFPBar) chartFPBar.destroy();
        chartFPBar = new Chart(barCtx, {
            type:'bar',
            data:{
                labels: sorted.map(c=>c.month),
                datasets:[
                    { label:'TFR', data:sorted.map(c=>c.tfr), backgroundColor:'rgba(245,158,11,0.7)', borderRadius:4 },
                    { label:'Lavoratore', data:sorted.map(c=>c.worker_contrib), backgroundColor:'rgba(59,130,246,0.7)', borderRadius:4 },
                    { label:'Datore', data:sorted.map(c=>c.employer_contrib), backgroundColor:'rgba(34,197,94,0.7)', borderRadius:4 }
                ]
            },
            options:{
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ position:'bottom', labels:{ color:'#64748b', font:{size:12} } } },
                scales:{
                    x:{ stacked:true, ticks:{color:'#64748b',font:{size:11}}, grid:{display:false} },
                    y:{ stacked:true, ticks:{color:'#64748b',font:{size:11},callback:v=>'€'+v.toLocaleString('it-IT')}, grid:{color:'rgba(0,0,0,0.05)'} }
                }
            }
        });
    }
}

// ── CONTRIB TABLE ─────────────────────────────────────────────────────────────
function renderFPContribTable() {
    const tbody = document.getElementById('fp-contrib-table-body');
    if (!tbody) return;
    const cs = getFilteredContributions();
    
    const fmtDec = (val, maxDec = 6) => {
        return parseFloat(val || 0).toLocaleString('it-IT', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: maxDec 
        });
    };
    
    tbody.innerHTML = cs.length === 0
        ? `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px;">${window.Translations.noContributions || 'No contributions.'}</td></tr>`
        : cs.map(c => `<tr>
            <td>${c.month}</td>
            <td style="text-align:right;">${fmtEurFP(c.tfr)}</td>
            <td style="text-align:right;">${fmtEurFP(c.worker_contrib)}</td>
            <td style="text-align:right;">${fmtEurFP(c.employer_contrib)}</td>
            <td style="text-align:right;font-weight:700;">${fmtEurFP(c.tfr + c.worker_contrib + c.employer_contrib)}</td>
            <td style="text-align:right;">${fmtDec(c.numero_quote, 6)}</td>
            <td style="text-align:right;">${c.valore_quota ? fmtDec(c.valore_quota, 4) + ' €' : '0,00 €'}</td>
            <td style="text-align:right;">${fmtEurFP(c.spese)}</td>
            <td style="text-align:center;">
                <button class="icon-btn" onclick="window.editFPContrib('${c.id}')" title="Modifica" style="margin-right:4px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="icon-btn btn-delete" onclick="window.deleteFPContrib('${c.id}')" title="Elimina">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </td>
        </tr>`).join('');
}

// ── CONTRIB CRUD ──────────────────────────────────────────────────────────────
window.handleFPContribSubmit = async function(e) {
    e.preventDefault();
    if (!fpState.activeFundId) { alert('Seleziona un fondo prima.'); return; }
    const id = document.getElementById('fp-contrib-edit-id').value;
    const month    = document.getElementById('fp-contrib-month').value;
    const tfr      = parseFloat(document.getElementById('fp-contrib-tfr').value)    || 0;
    const worker   = parseFloat(document.getElementById('fp-contrib-worker').value)  || 0;
    const employer = parseFloat(document.getElementById('fp-contrib-employer').value)|| 0;
    const notes    = document.getElementById('fp-contrib-notes').value;
    const nq       = parseFloat(document.getElementById('fp-contrib-numero-quote').value) || 0;
    const vq       = parseFloat(document.getElementById('fp-contrib-valore-quota').value) || 0;
    const spese    = parseFloat(document.getElementById('fp-contrib-spese').value)        || 0;
    const total    = tfr + worker + employer;

    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/pension_contributions/${id}` : `/api/pension_funds/${fpState.activeFundId}/contributions`;
    const body   = { 
        month, 
        tfr, 
        worker_contrib: worker, 
        employer_contrib: employer, 
        total_value: total, 
        notes,
        numero_quote: nq,
        valore_quota: vq,
        spese: spese
    };

    const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) {
        window.resetFPContribForm();
        await loadContributions(fpState.activeFundId);
        renderFPDashboard();
        renderFPContribTable();
    } else {
        alert('Errore durante il salvataggio.');
    }
};

window.resetFPContribForm = function() {
    document.getElementById('fp-contrib-edit-id').value = '';
    document.getElementById('fp-contrib-form').reset();
};

window.editFPContrib = function(id) {
    const c = fpState.contributions.find(x => x.id === id);
    if (!c) return;
    document.getElementById('fp-contrib-edit-id').value     = c.id;
    document.getElementById('fp-contrib-month').value       = c.month;
    document.getElementById('fp-contrib-tfr').value         = c.tfr;
    document.getElementById('fp-contrib-worker').value      = c.worker_contrib;
    document.getElementById('fp-contrib-employer').value    = c.employer_contrib;
    document.getElementById('fp-contrib-numero-quote').value = c.numero_quote || 0;
    document.getElementById('fp-contrib-valore-quota').value = c.valore_quota || 0;
    document.getElementById('fp-contrib-spese').value        = c.spese || 0;
    document.getElementById('fp-contrib-notes').value       = c.notes || '';
    window.switchFPSubTab('contributi', null);
    document.getElementById('fp-contrib-form').scrollIntoView({ behavior:'smooth' });
};

window.deleteFPContrib = async function(id) {
    if (!confirm('Eliminare questo contributo?')) return;
    const res = await fetch(`/api/pension_contributions/${id}`, { method:'DELETE' });
    if (res.ok) {
        await loadContributions(fpState.activeFundId);
        renderFPDashboard();
        renderFPContribTable();
    } else {
        alert('Errore durante l\'eliminazione.');
    }
};

// ── FUND MODAL ────────────────────────────────────────────────────────────────
window.openFundModal = function(id = null) {
    fpState.selectedScrapedFund = null;
    const compGroup = document.getElementById('fp-fund-initial-compartment-group');
    if (compGroup) compGroup.style.display = 'none';
    const compSelect = document.getElementById('fp-fund-initial-compartment');
    if (compSelect) compSelect.innerHTML = '<option value="">Default</option>';
    
    document.getElementById('fp-fund-form').reset();
    document.getElementById('fp-fund-edit-id').value = '';
    if (id) {
        const f = fpState.funds.find(x => x.id === id);
        if (!f) return;
        document.getElementById('fp-fund-edit-id').value   = f.id;
        document.getElementById('fp-fund-name').value      = f.name;
        document.getElementById('fp-fund-provider').value  = f.provider || '';
        document.getElementById('fp-fund-type').value      = f.fund_type;
        document.getElementById('fp-fund-notes').value     = f.notes || '';
        document.getElementById('fp-fund-investing-link').value = f.investing_link || '';
        document.getElementById('fp-fund-modal-title').textContent = 'Modifica Fondo';
    } else {
        document.getElementById('fp-fund-modal-title').textContent = 'Nuovo Fondo Pensione';
    }
    document.getElementById('fp-fund-modal').classList.add('open');
};
window.closeFundModal = function() { document.getElementById('fp-fund-modal').classList.remove('open'); };

window.handleFundSubmit = async function(e) {
    e.preventDefault();
    if (!fpState.activeGroupId) { alert('Seleziona un gruppo prima.'); return; }
    const id       = document.getElementById('fp-fund-edit-id').value;
    const name     = document.getElementById('fp-fund-name').value;
    const provider = document.getElementById('fp-fund-provider').value;
    const type     = document.getElementById('fp-fund-type').value;
    const notes    = document.getElementById('fp-fund-notes').value;
    const link     = document.getElementById('fp-fund-investing-link').value;

    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/pension_funds/${id}` : `/api/pension_fund_groups/${fpState.activeGroupId}/funds`;
    
    const body   = { name, provider, fund_type: type, notes, investing_link: link };
    
    // Attach compartment_name if it's a new fund and name matches the selected autocomplete fund
    if (!id && fpState.selectedScrapedFund && fpState.selectedScrapedFund.nome.toLowerCase() === name.toLowerCase()) {
        const compSelect = document.getElementById('fp-fund-initial-compartment');
        if (compSelect) {
            const idx = parseInt(compSelect.value);
            const c = fpState.selectedScrapedFund.comparti[idx];
            if (c) {
                body.compartment_name = c.nome;
            }
        }
    }

    const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) {
        window.closeFundModal();
        await window.caricaDatiFP();
    } else {
        alert('Errore durante il salvataggio.');
    }
};

window.deleteFund = async function(id) {
    if (!confirm('Eliminare questo fondo e tutti i contributi associati?')) return;
    const res = await fetch(`/api/pension_funds/${id}`, { method:'DELETE' });
    if (res.ok) await window.caricaDatiFP();
    else alert('Errore durante l\'eliminazione.');
};

// ── FUNDS GRID ────────────────────────────────────────────────────────────────
function renderFundsGrid() {
    const container = document.getElementById('fp-funds-grid');
    if (!container) return;
    if (fpState.funds.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);">${window.Translations.noPensionFunds || 'No pension funds. Add one with the button above.'}</p>`;
        return;
    }
    const typeLabels = { category:'Fondo di Categoria', open:'Fondo Aperto', pip:'PIP', other:'Altro' };
    container.innerHTML = fpState.funds.map(f => {
        const isActive = f.id === fpState.activeFundId;
        const compartmentsList = f.compartments || [];
        return `<div class="fund-card" style="display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <div class="fund-card-name" style="font-weight:bold; font-size:1.1em;">${f.name}</div>
                    <div class="fund-card-provider" style="font-size:0.85em; color:var(--text-muted);">${f.provider || 'Gestore non specificato'} · ${typeLabels[f.fund_type]||f.fund_type}</div>
                </div>
                <div class="fund-card-actions" style="display:flex; align-items:center; gap:6px;">
                    ${!isActive ? `<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;height:auto;" onclick="document.getElementById('active-fund-select').value='${f.id}';window.handleFundChange({target:{value:'${f.id}'}})">Seleziona</button>` : '<span style="font-size:11px;font-weight:700;color:var(--success-color);">Attivo</span>'}
                    <button class="icon-btn" onclick="window.openFundModal('${f.id}')" title="Modifica">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="icon-btn btn-delete" onclick="window.deleteFund('${f.id}')" title="Elimina">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
            ${f.notes ? `<div style="font-size:0.8em;color:var(--text-muted);">${f.notes}</div>` : ''}
            
            <!-- Sezione Comparti -->
            <div class="fund-compartments-section" style="margin-top: 8px; border-top: 1px solid var(--border-color); padding-top: 10px;">
                 <div style="font-weight: 600; font-size: 0.85em; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <span>Comparti / Switch</span>
                      <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 10px; height:auto;" onclick="window.openSwitchCompartoModal('${f.id}')">+ Switch</button>
                 </div>
                 <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.8em;">
                      ${compartmentsList.map(c => `
                           <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--bg-body); border-radius: 6px; border: 1px solid var(--border-color);">
                                <div style="max-width: 80%;">
                                     <div style="font-weight: 600; color: var(--text-primary);">${c.name}</div>
                                     <div style="font-size: 0.85em; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.investing_link || ''}">${c.investing_link || 'Nessun link'}</div>
                                     <div style="font-size: 0.85em; color: var(--primary-color); font-weight: 600; margin-top:2px;">Da: ${c.start_date || 'Inizio'}</div>
                                </div>
                                <div style="display: flex; gap: 4px;">
                                     <button class="icon-btn" style="padding:3px;" onclick="window.editComparto('${c.id}', '${f.id}')" title="Modifica">✏️</button>
                                     ${c.start_date ? `<button class="icon-btn btn-delete" style="padding:3px;" onclick="window.deleteComparto('${c.id}', '${f.id}')" title="Elimina">🗑️</button>` : ''}
                                </div>
                           </div>
                      `).join('')}
                 </div>
            </div>
        </div>`;
    }).join('');
}

window.openSwitchCompartoModal = function(fundId) {
    console.log("openSwitchCompartoModal called for fundId:", fundId);
    
    // Autocomplete list for switch compartments
    const fund = fpState.funds.find(f => f.id === fundId);
    const compDatalist = document.getElementById('scraped-compartments-list');
    const compNameInput = document.getElementById('fp-comparto-name');
    const compLinkInput = document.getElementById('fp-comparto-link');
    
    if (compDatalist) compDatalist.innerHTML = '';
    
    let matchedScrapedFund = null;
    if (fund && fpState.scrapedFunds) {
        matchedScrapedFund = fpState.scrapedFunds.find(f => f.nome.toLowerCase() === fund.name.toLowerCase());
        if (matchedScrapedFund && compDatalist) {
            matchedScrapedFund.comparti.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome;
                compDatalist.appendChild(opt);
            });
        }
    }
    
    if (compNameInput && compLinkInput) {
        const handleCompInput = () => {
            const val = compNameInput.value.trim();
            if (matchedScrapedFund) {
                const matchedComp = matchedScrapedFund.comparti.find(c => c.nome.toLowerCase() === val.toLowerCase());
                if (matchedComp) {
                    compLinkInput.value = matchedComp.link_dati_storici || '';
                }
            }
        };
        if (compNameInput._handleCompInput) {
            compNameInput.removeEventListener('input', compNameInput._handleCompInput);
        }
        compNameInput._handleCompInput = handleCompInput;
        compNameInput.addEventListener('input', compNameInput._handleCompInput);
    }

    const form = document.getElementById('fp-comparto-form');
    if (!form) {
        console.error("Form fp-comparto-form not found!");
        return;
    }
    form.reset();
    document.getElementById('fp-comparto-edit-id').value = '';
    document.getElementById('fp-comparto-fund-id').value = fundId;
    document.getElementById('fp-comparto-modal-title').textContent = 'Aggiungi Comparto / Switch';
    
    const dateGroup = document.getElementById('fp-comparto-start-date-group');
    if (dateGroup) dateGroup.style.display = 'block';
    
    const startDateInput = document.getElementById('fp-comparto-start-date');
    if (startDateInput) startDateInput.setAttribute('required', 'true');
    
    const modal = document.getElementById('fp-comparto-modal');
    if (modal) {
        modal.classList.add('open');
        console.log("Modal opened successfully:", modal);
    } else {
        console.error("Modal fp-comparto-modal not found!");
    }
};

window.editComparto = function(compId, fundId) {
    console.log("editComparto called for compId:", compId, "fundId:", fundId);
    const form = document.getElementById('fp-comparto-form');
    if (!form) {
        console.error("Form fp-comparto-form not found!");
        return;
    }
    form.reset();
    
    const f = fpState.funds.find(x => x.id === fundId);
    if (!f) {
        console.error("Fund not found for ID:", fundId);
        return;
    }
    const c = (f.compartments || []).find(x => x.id === compId);
    if (!c) {
        console.error("Compartment not found for ID:", compId);
        return;
    }

    document.getElementById('fp-comparto-edit-id').value = c.id;
    document.getElementById('fp-comparto-fund-id').value = fundId;
    document.getElementById('fp-comparto-name').value = c.name;
    document.getElementById('fp-comparto-link').value = c.investing_link || '';
    
    const dateGroup = document.getElementById('fp-comparto-start-date-group');
    const startDateInput = document.getElementById('fp-comparto-start-date');
    
    if (c.start_date === null) {
        if (dateGroup) dateGroup.style.display = 'none';
        if (startDateInput) startDateInput.removeAttribute('required');
    } else {
        if (dateGroup) dateGroup.style.display = 'block';
        if (startDateInput) {
            startDateInput.value = c.start_date;
            startDateInput.setAttribute('required', 'true');
        }
    }
    
    document.getElementById('fp-comparto-modal-title').textContent = 'Modifica Comparto';
    const modal = document.getElementById('fp-comparto-modal');
    if (modal) {
        modal.classList.add('open');
    } else {
        console.error("Modal fp-comparto-modal not found!");
    }
};

window.closeCompartoModal = function() {
    const modal = document.getElementById('fp-comparto-modal');
    if (modal) {
        modal.classList.remove('open');
    }
};

window.handleCompartoSubmit = async function(e) {
    e.preventDefault();
    const compId = document.getElementById('fp-comparto-edit-id').value;
    const fundId = document.getElementById('fp-comparto-fund-id').value;
    const name = document.getElementById('fp-comparto-name').value;
    const link = document.getElementById('fp-comparto-link').value;
    const startDate = document.getElementById('fp-comparto-start-date').value;

    const body = { name, investing_link: link };
    let url = `/api/pension_funds/${fundId}/compartments`;
    let method = 'POST';

    if (compId) {
        url = `/api/pension_compartments/${compId}`;
        method = 'PUT';
        const isDefault = document.getElementById('fp-comparto-start-date-group').style.display === 'none';
        if (!isDefault) {
            body.start_date = startDate;
        }
    } else {
        body.start_date = startDate;
    }

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (res.ok) {
        window.closeCompartoModal();
        await window.caricaDatiFP();
    } else {
        alert('Errore durante il salvataggio del comparto.');
    }
};

window.deleteComparto = async function(compId, fundId) {
    if (!confirm('Sei sicuro di voler eliminare questo switch di comparto? Lo storico dei contributi prima di questa data verrà ri-associato al comparto precedente.')) return;
    const res = await fetch(`/api/pension_compartments/${compId}`, { method: 'DELETE' });
    if (res.ok) {
        await window.caricaDatiFP();
    } else {
        alert('Errore durante l\'eliminazione del comparto.');
    }
};

// ── PDF IMPORT & REVIEW ───────────────────────────────────────────────────────
let parsedFPPdfContributions = [];

window.handleFPPdfUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!fpState.activeFundId) {
        alert("Seleziona un fondo prima di caricare il PDF.");
        event.target.value = "";
        return;
    }
    
    const loadingDiv = document.getElementById("fp-pdf-import-loading");
    if (loadingDiv) loadingDiv.style.display = "block";
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
        const res = await fetch("/api/pension_funds/parse_pdf", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        
        if (!res.ok) {
            alert(data.errore || "Errore durante l'elaborazione del PDF.");
            return;
        }
        
        const contribs = data.contributions || [];
        if (contribs.length === 0) {
            alert("Nessun contributo rilevato nel file PDF.");
            return;
        }
        
        window.openFPPdfReviewModal(contribs);
    } catch (e) {
        console.error(e);
        alert("Errore di rete durante il caricamento del PDF.");
    } finally {
        if (loadingDiv) loadingDiv.style.display = "none";
        event.target.value = "";
    }
};

window.openFPPdfReviewModal = function(contribs) {
    parsedFPPdfContributions = contribs;
    const tbody = document.getElementById("fp-pdf-contributions-review-body");
    if (!tbody) return;
    
    tbody.innerHTML = contribs.map((c, index) => {
        const total = (c.tfr || 0) + (c.worker_contrib || 0) + (c.employer_contrib || 0);
        return `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="text-align: center; padding: 8px;"><input type="checkbox" class="fp-pdf-row-checkbox" data-index="${index}" checked></td>
                <td style="padding: 8px;"><input type="month" class="fp-pdf-row-month" value="${c.month || ''}" style="border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}"></td>
                <td style="padding: 8px;"><input type="number" step="0.01" class="fp-pdf-row-tfr" value="${c.tfr || 0.00}" style="width: 85px; text-align: right; border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}" oninput="window.updateFPPdfRowTotal(${index})"></td>
                <td style="padding: 8px;"><input type="number" step="0.01" class="fp-pdf-row-worker" value="${c.worker_contrib || 0.00}" style="width: 85px; text-align: right; border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}" oninput="window.updateFPPdfRowTotal(${index})"></td>
                <td style="padding: 8px;"><input type="number" step="0.01" class="fp-pdf-row-employer" value="${c.employer_contrib || 0.00}" style="width: 85px; text-align: right; border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}" oninput="window.updateFPPdfRowTotal(${index})"></td>
                <td style="text-align: right; padding: 8px;"><span class="fp-pdf-row-total" id="fp-pdf-row-total-${index}" style="font-weight: bold;">${fmtEurFP(total)}</span></td>
                <td style="padding: 8px;"><input type="text" class="fp-pdf-row-notes" value="${c.notes || ''}" style="width: 100%; min-width: 120px; border: 1px solid var(--border-color); padding: 4px; border-radius: 4px; font-size: 13px;" data-index="${index}"></td>
            </tr>
        `;
    }).join("");
    
    document.getElementById("fp-pdf-select-all-checkbox").checked = true;
    document.getElementById("fp-pdf-review-modal").classList.add("open");
};

window.updateFPPdfRowTotal = function(index) {
    const tfrInput = document.querySelector(`.fp-pdf-row-tfr[data-index="${index}"]`);
    const workerInput = document.querySelector(`.fp-pdf-row-worker[data-index="${index}"]`);
    const employerInput = document.querySelector(`.fp-pdf-row-employer[data-index="${index}"]`);
    
    const tfrVal = tfrInput ? (parseFloat(tfrInput.value) || 0) : 0;
    const workerVal = workerInput ? (parseFloat(workerInput.value) || 0) : 0;
    const employerVal = employerInput ? (parseFloat(employerInput.value) || 0) : 0;
    
    const totalSpan = document.getElementById(`fp-pdf-row-total-${index}`);
    if (totalSpan) {
        totalSpan.textContent = fmtEurFP(tfrVal + workerVal + employerVal);
    }
};

window.closeFPPdfReviewModal = function() {
    document.getElementById("fp-pdf-review-modal").classList.remove("open");
    parsedFPPdfContributions = [];
};

window.toggleSelectAllFPContributions = function(masterCb) {
    const checkboxes = document.querySelectorAll(".fp-pdf-row-checkbox");
    checkboxes.forEach(cb => cb.checked = masterCb.checked);
};

window.submitFPPdfImportedContributions = async function() {
    if (!fpState.activeFundId) return;
    
    const checkboxes = document.querySelectorAll(".fp-pdf-row-checkbox:checked");
    if (checkboxes.length === 0) {
        alert("Seleziona almeno un contributo da importare.");
        return;
    }
    
    let importedCount = 0;
    for (let cb of checkboxes) {
        const index = parseInt(cb.getAttribute("data-index"));
        const originalContrib = parsedFPPdfContributions[index];
        if (!originalContrib) continue;
        
        const monthInput = document.querySelector(`.fp-pdf-row-month[data-index="${index}"]`);
        const tfrInput = document.querySelector(`.fp-pdf-row-tfr[data-index="${index}"]`);
        const workerInput = document.querySelector(`.fp-pdf-row-worker[data-index="${index}"]`);
        const employerInput = document.querySelector(`.fp-pdf-row-employer[data-index="${index}"]`);
        const notesInput = document.querySelector(`.fp-pdf-row-notes[data-index="${index}"]`);
        
        const month = monthInput ? monthInput.value : originalContrib.month;
        const tfr = tfrInput ? (parseFloat(tfrInput.value) || 0.0) : (originalContrib.tfr || 0.0);
        const worker_contrib = workerInput ? (parseFloat(workerInput.value) || 0.0) : (originalContrib.worker_contrib || 0.0);
        const employer_contrib = employerInput ? (parseFloat(employerInput.value) || 0.0) : (originalContrib.employer_contrib || 0.0);
        const notes = notesInput ? notesInput.value : (originalContrib.notes || "Importato da PDF");
        
        if (!month) {
            alert("Mese obbligatorio.");
            return;
        }
        
        const total = tfr + worker_contrib + employer_contrib;
        const body = {
            month,
            tfr,
            worker_contrib,
            employer_contrib,
            total_value: total,
            notes
        };
        
        try {
            const res = await fetch(`/api/pension_funds/${fpState.activeFundId}/contributions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                importedCount++;
            }
        } catch (e) {
            console.error(e);
        }
    }
    
    window.closeFPPdfReviewModal();
    alert(`${importedCount} contributi importati con successo.`);
    
    await loadContributions(fpState.activeFundId);
    renderFPDashboard();
    renderFPContribTable();
};

// ── CSV IMPORT & MAPPING ──────────────────────────────────────────────────────
let currentFPCsvFile = null;

window.handleFPCSVUpload = async function(event) {
    console.log("handleFPCSVUpload: Event triggered");
    let file = event.target.files[0];
    if (!file) {
        console.log("handleFPCSVUpload: No file selected");
        return;
    }
    console.log("handleFPCSVUpload: Selected file", file.name, file.size);
    if (!fpState.activeFundId) {
        console.warn("handleFPCSVUpload: No active fund selected in fpState");
        alert("Seleziona un fondo pensione prima di caricare.");
        event.target.value = '';
        return;
    }
    console.log("handleFPCSVUpload: Active fund ID:", fpState.activeFundId);
    
    let formData = new FormData();
    formData.append("file", file);
    
    try {
        console.log("handleFPCSVUpload: Fetching /api/preview_csv...");
        let res = await fetch('/api/preview_csv', { method: 'POST', body: formData });
        console.log("handleFPCSVUpload: Received response status:", res.status);
        if (!res.ok) {
            let errMsg = "Errore nella lettura del file";
            try {
                let err = await res.json();
                errMsg = err.errore || errMsg;
            } catch (jsonErr) {
                errMsg = `Server error (${res.status}): ${res.statusText}`;
            }
            console.error("handleFPCSVUpload: Preview failed:", errMsg);
            alert(errMsg);
            event.target.value = '';
            return;
        }
        let data = await res.json();
        console.log("handleFPCSVUpload: Parsed headers:", data.headers);
        console.log("handleFPCSVUpload: Parsed sample row:", data.sample);
        openFPMappingModal(file, data.headers, data.sample);
    } catch (e) {
        console.error("Errore durante l'upload del CSV:", e);
        alert("Errore di rete o di lettura del file: " + e.message);
        event.target.value = '';
    }
};

function openFPMappingModal(file, headers, sample) {
    console.log("openFPMappingModal: Initializing mapping UI...");
    currentFPCsvFile = file;
    let container = document.getElementById('fp-mapping-fields');
    if (!container) {
        console.error("openFPMappingModal: Element 'fp-mapping-fields' not found in DOM!");
        return;
    }
    container.innerHTML = '';


    const isIt = document.documentElement.lang === 'it';
    const dbFields = [
        { id: 'month', label: isIt ? 'Mese (YYYY-MM)' : 'Month (YYYY-MM)', required: true },
        { id: 'tfr', label: isIt ? 'TFR (€)' : 'TFR (€)', required: false },
        { id: 'worker_contrib', label: isIt ? 'Quota Dipendente (€)' : 'Worker Share (€)', required: false },
        { id: 'employer_contrib', label: isIt ? 'Quota Azienda (€)' : 'Employer Share (€)', required: false },
        { id: 'total_value', label: isIt ? 'Valore Totale (€)' : 'Total Value (€)', required: false },
        { id: 'numero_quote', label: isIt ? 'Numero Quote' : 'Number of Shares', required: false },
        { id: 'valore_quota', label: isIt ? 'Valore Quota' : 'Share Value', required: false },
        { id: 'spese', label: isIt ? 'Spese / Quota Spese (€)' : 'Expenses (€)', required: false },
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
        row.innerHTML = `<label style="margin: 0; width: 45%; font-size: 0.9em; font-weight: 600;">${field.label} ${reqStar}</label><select id="fpmap_${field.id}" style="width: 50%; padding: 8px; border-radius: 6px; border: 1px solid #ced4da;">${optionsHtml}</select>`;
        container.appendChild(row);

        let select = row.querySelector('select');
        let bestMatch = '';
        let labelLower = field.id.toLowerCase();
        for (let i = 0; i < headers.length; i++) {
            let hLower = (headers[i] || '').toLowerCase();
            if (hLower.includes(labelLower) || labelLower.includes(hLower) ||
                (labelLower === 'month' && (hLower.includes('mese') || hLower.includes('month') || hLower.includes('data') || hLower.includes('date'))) ||
                (labelLower === 'tfr' && (hLower.includes('tfr') || hLower.includes('trattamento'))) ||
                (labelLower === 'worker_contrib' && (hLower.includes('dipendente') || hLower.includes('worker') || hLower.includes('lavoratore') || hLower.includes('aderente') || hLower.includes('c/dip'))) ||
                (labelLower === 'employer_contrib' && (hLower.includes('azienda') || hLower.includes('employer') || hLower.includes('datore') || hLower.includes('c/az'))) ||
                (labelLower === 'total_value' && (hLower.includes('totale') || hLower.includes('total') || hLower.includes('valore'))) ||
                (labelLower === 'numero_quote' && (hLower.includes('numero quote') || hLower.includes('n. quote') || hLower.includes('numero_quote') || hLower.includes('num. quote'))) ||
                (labelLower === 'valore_quota' && (hLower.includes('valore quota') || hLower.includes('prezzo quota') || hLower.includes('valore_quota') || hLower.includes('val. quota'))) ||
                (labelLower === 'spese' && (hLower.includes('spese') || hLower.includes('commissioni') || hLower.includes('costo') || hLower.includes('quota spese'))) ||
                (labelLower === 'notes' && (hLower.includes('note') || hLower.includes('descrizione') || hLower.includes('info')))
            ) {
                bestMatch = headers[i];
                break;
            }
        }
        if (bestMatch) select.value = bestMatch;
    });

    const modalEl = document.getElementById('fp-csv-mapping-modal');
    if (modalEl) {
        console.log("openFPMappingModal: Found modal element. Current display:", modalEl.style.display);
        modalEl.style.display = 'flex';
        console.log("openFPMappingModal: Set display to flex. New display:", modalEl.style.display);
    } else {
        console.error("openFPMappingModal: Modal element 'fp-csv-mapping-modal' NOT found in DOM!");
    }
}

window.confermaMappingFondiCSV = async function() {
    let mapping = {
        month: document.getElementById('fpmap_month').value,
        tfr: document.getElementById('fpmap_tfr').value,
        worker_contrib: document.getElementById('fpmap_worker_contrib').value,
        employer_contrib: document.getElementById('fpmap_employer_contrib').value,
        total_value: document.getElementById('fpmap_total_value').value,
        numero_quote: document.getElementById('fpmap_numero_quote').value,
        valore_quota: document.getElementById('fpmap_valore_quota').value,
        spese: document.getElementById('fpmap_spese').value,
        notes: document.getElementById('fpmap_notes').value
    };

    if (!mapping.month) {
        alert("Il campo Mese (*) è obbligatorio.");
        return;
    }

    document.getElementById('fp-csv-mapping-modal').style.display = 'none';

    let formData = new FormData();
    formData.append("file", currentFPCsvFile);
    formData.append("mapping", JSON.stringify(mapping));

    try {
        let risposta = await fetch('/api/pension_funds/import_custom_csv?fund_id=' + fpState.activeFundId, { method: 'POST', body: formData });
        let result = {};
        try {
            result = await risposta.json();
        } catch (jsonErr) {
            result = { errore: `Server error (${risposta.status}): ${risposta.statusText}` };
        }
        if (risposta.ok) {
            alert(result.messaggio || "Importazione completata.");
            await window.caricaDatiFP();
        } else {
            alert(result.errore || "Errore durante l'importazione.");
        }
    } catch (error) {
        console.error("Errore durante l'importazione del CSV:", error);
        alert("Errore di rete durante l'importazione.");
    } finally {
        currentFPCsvFile = null;
        document.getElementById('fp-custom-csv-file').value = '';
    }
};

// ── CUSTOM PDF IMPORT ─────────────────────────────────────────────────────────
let parsedFPCustomPdfRows = [];

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

window.handleFPCustomPdfUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!fpState.activeFundId) {
        alert("Seleziona un fondo pensione prima di caricare.");
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
        
        document.getElementById('fp-custom-pdf-text').value = data.text;
        
        // Initialize mapping selectors
        const selectors = [
            { id: 'fp-custom-pdf-map-month', def: '10' },
            { id: 'fp-custom-pdf-map-tfr', def: '2' },
            { id: 'fp-custom-pdf-map-worker', def: '4' },
            { id: 'fp-custom-pdf-map-employer', def: '5' },
            { id: 'fp-custom-pdf-map-notes', def: '1' }
        ];
        
        selectors.forEach(selObj => {
            const sel = document.getElementById(selObj.id);
            if (!sel) return;
            sel.innerHTML = '<option value="none">-- Ignora --</option>';
            for (let i = 1; i <= 10; i++) {
                sel.innerHTML += `<option value="${i}">Gruppo ${i}</option>`;
            }
            sel.value = selObj.def;
        });

        // Default regex for Cometa/Fonchim statement rows:
        // e.g. "Contributo 576,00 CRESCITA 148,92 89,34 0,00 30,656 26,463 3,00 30/04/2026"
        // Groups: 1=op, 2=TFR, 3=comparto, 4=worker(aderente), 5=employer(azienda), 6=altro, 7=nquote, 8=vquota, 9=spese, 10=data
        document.getElementById('fp-custom-pdf-regex').value = '\\b(Contributo|Distribuzione|Switch\\s+\\w+)\\b\\s+([-\\d\\.,]+)\\s+(\\w+)\\s+([-\\d\\.,]+)\\s+([-\\d\\.,]+)\\s+([-\\d\\.,]+)\\s+([-\\d\\.,]+)\\s+([-\\d\\.,]+)\\s+([-\\d\\.,]+)\\s+(\\d{2}/\\d{2}/\\d{4})';
        document.getElementById('fp-custom-pdf-preview-body').innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Clicca <strong>Test &amp; Parse</strong> per elaborare.</td></tr>`;
        
        document.getElementById('fp-custom-pdf-modal').style.display = 'flex';
    } catch (e) {
        console.error("Errore upload PDF personalizzato fondo pensione:", e);
        alert("Errore durante la lettura del PDF: " + e.message);
    } finally {
        event.target.value = '';
    }
};

window.testFPCustomPdfRegex = function() {
    const text = document.getElementById('fp-custom-pdf-text').value;
    const patternStr = document.getElementById('fp-custom-pdf-regex').value.trim();
    if (!patternStr) { alert("Inserisci un pattern regex."); return; }
    
    let regex;
    try {
        regex = new RegExp(patternStr, 'g');
    } catch(e) {
        alert("Regex non valida: " + e.message);
        return;
    }
    
    const monthGroup = document.getElementById('fp-custom-pdf-map-month').value;
    const tfrGroup = document.getElementById('fp-custom-pdf-map-tfr').value;
    const workerGroup = document.getElementById('fp-custom-pdf-map-worker').value;
    const employerGroup = document.getElementById('fp-custom-pdf-map-employer').value;
    const notesGroup = document.getElementById('fp-custom-pdf-map-notes').value;
    
    const tbody = document.getElementById('fp-custom-pdf-preview-body');
    tbody.innerHTML = '';
    
    let match;
    let index = 0;
    parsedFPCustomPdfRows = [];
    
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
        if (match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        const monthVal = monthGroup !== 'none' ? (match[parseInt(monthGroup)] || '').trim() : '';
        const tfrVal = tfrGroup !== 'none' ? (match[parseInt(tfrGroup)] || '').trim() : '';
        const workerVal = workerGroup !== 'none' ? (match[parseInt(workerGroup)] || '').trim() : '';
        const employerVal = employerGroup !== 'none' ? (match[parseInt(employerGroup)] || '').trim() : '';
        const notesVal = notesGroup !== 'none' ? (match[parseInt(notesGroup)] || '').trim() : '';
        
        const tfr = parseFloat(cleanFloatStr(tfrVal)) || 0;
        const worker = parseFloat(cleanFloatStr(workerVal)) || 0;
        const employer = parseFloat(cleanFloatStr(employerVal)) || 0;
        const total = tfr + worker + employer;
        
        parsedFPCustomPdfRows.push({
            month: monthVal,
            tfr: tfrVal,
            worker_contrib: workerVal,
            employer_contrib: employerVal,
            notes: notesVal
        });
        
        // Month input value format is YYYY-MM
        const formattedMonth = formatDateForInput(monthVal).substring(0, 7);
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="text-align: center;"><input type="checkbox" class="fp-custom-pdf-row-cb" data-index="${index}" checked></td>
                <td><input type="month" class="fp-custom-pdf-row-month" value="${formattedMonth}" style="padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
                <td><input type="number" step="0.01" class="fp-custom-pdf-row-tfr" value="${cleanFloatStr(tfrVal)}" style="width: 75px; text-align: right; padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}" oninput="window.updateFPCustomPdfRowTotal(${index})"></td>
                <td><input type="number" step="0.01" class="fp-custom-pdf-row-worker" value="${cleanFloatStr(workerVal)}" style="width: 75px; text-align: right; padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}" oninput="window.updateFPCustomPdfRowTotal(${index})"></td>
                <td><input type="number" step="0.01" class="fp-custom-pdf-row-employer" value="${cleanFloatStr(employerVal)}" style="width: 75px; text-align: right; padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}" oninput="window.updateFPCustomPdfRowTotal(${index})"></td>
                <td style="text-align: right;"><span class="fp-custom-pdf-row-total" id="fp-custom-pdf-row-total-${index}" style="font-weight: bold;">${fmtEurFP(total)}</span></td>
                <td><input type="text" class="fp-custom-pdf-row-notes" value="${notesVal || 'Importato da PDF personalizzato'}" style="width: 100%; min-width: 100px; padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
            </tr>
        `;
        index++;
    }
    
    if (parsedFPCustomPdfRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nessuna corrispondenza trovata con questo pattern.</td></tr>`;
    }
};

window.updateFPCustomPdfRowTotal = function(index) {
    const tfrVal = parseFloat(document.querySelector(`.fp-custom-pdf-row-tfr[data-index="${index}"]`).value) || 0;
    const workerVal = parseFloat(document.querySelector(`.fp-custom-pdf-row-worker[data-index="${index}"]`).value) || 0;
    const employerVal = parseFloat(document.querySelector(`.fp-custom-pdf-row-employer[data-index="${index}"]`).value) || 0;
    const totalSpan = document.getElementById(`fp-custom-pdf-row-total-${index}`);
    if (totalSpan) {
        totalSpan.textContent = fmtEurFP(tfrVal + workerVal + employerVal);
    }
};

window.toggleAllFPCustomPdfRows = function(masterCb) {
    const checkBoxes = document.querySelectorAll('.fp-custom-pdf-row-cb');
    checkBoxes.forEach(cb => cb.checked = masterCb.checked);
};

window.confirmFPCustomPdfImport = async function() {
    if (!fpState.activeFundId) return;
    
    const checkboxes = document.querySelectorAll(".fp-custom-pdf-row-cb:checked");
    if (checkboxes.length === 0) {
        alert("Seleziona almeno un contributo da importare.");
        return;
    }
    
    let importedCount = 0;
    for (let cb of checkboxes) {
        const index = parseInt(cb.getAttribute("data-index"));
        const monthInput = document.querySelector(`.fp-custom-pdf-row-month[data-index="${index}"]`);
        const tfrInput = document.querySelector(`.fp-custom-pdf-row-tfr[data-index="${index}"]`);
        const workerInput = document.querySelector(`.fp-custom-pdf-row-worker[data-index="${index}"]`);
        const employerInput = document.querySelector(`.fp-custom-pdf-row-employer[data-index="${index}"]`);
        const notesInput = document.querySelector(`.fp-custom-pdf-row-notes[data-index="${index}"]`);
        
        const month = monthInput ? monthInput.value : '';
        const tfr = tfrInput ? parseFloat(tfrInput.value) : 0.0;
        const worker_contrib = workerInput ? parseFloat(workerInput.value) : 0.0;
        const employer_contrib = employerInput ? parseFloat(employerInput.value) : 0.0;
        const notes = notesInput ? notesInput.value : 'Importato da PDF personalizzato';
        
        if (!month) {
            alert("Mese obbligatorio.");
            return;
        }
        
        const total = tfr + worker_contrib + employer_contrib;
        const body = { month, tfr, worker_contrib, employer_contrib, total_value: total, notes };
        
        try {
            const res = await fetch(`/api/pension_funds/${fpState.activeFundId}/contributions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                importedCount++;
            }
        } catch (e) {
            console.error("Errore importazione contributo:", e);
        }
    }
    
    document.getElementById('fp-custom-pdf-modal').style.display = 'none';
    alert(`${importedCount} contributi importati con successo.`);
    
    await loadContributions(fpState.activeFundId);
    renderFPDashboard();
    renderFPContribTable();
};

window.clearFPHistory = async function() {
    const fId = fpState.activeFundId;
    if (!fId) return;
    const confirmation = confirm("Sei sicuro di voler eliminare TUTTI i contributi registrati per questo fondo pensione? Questa azione non può essere annullata.");
    if (!confirmation) return;

    try {
        const res = await fetch(`/api/pension_funds/${fId}/contributions/clear`, { method: 'DELETE' });
        if (res.ok) {
            alert('Cronologia contributi svuotata con successo.');
            await loadContributions(fId);
            renderFPDashboard();
            renderFPContribTable();
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.errore || 'Errore durante l\'eliminazione della cronologia.');
        }
    } catch (e) {
        alert('Errore di connessione.');
    }
};

window.forzaAggiornamentoDatiStorici = async function() {
    const fId = fpState.activeFundId;
    if (!fId) {
        alert('Seleziona un fondo pensione attivo prima di aggiornare.');
        return;
    }
    const btn = document.getElementById('fp-btn-force-update');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '🔄 Aggiornamento...';
    }
    try {
        const res = await fetch(`/api/pension_funds/${fId}/update_historical_data`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
            alert(`Aggiornamento completato con successo! ${data.updated_compartments} comparti aggiornati.`);
            await window.caricaDatiFP();
        } else {
            alert(data.errore || 'Errore durante l\'aggiornamento dei dati storici.');
        }
    } catch (e) {
        alert('Errore di connessione durante l\'aggiornamento.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🔄 Aggiorna Dati Storici';
        }
    }
};
