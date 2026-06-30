// --- LOAN STATE ---
const loanState = {
    loans: [],
    payments: [],
    activeLoanId: null,
    activeSubTab: 'dashboard'
};

// Groups state
let activeLoanGroupId = null;
let gruppiPrestiti = [];

// Charts instances
let chartLoanDonut = null;
let chartLoanProjection = null;
let chartSimComparison = null;

async function caricaGruppiPrestiti(selezionaId = null) {
    let res = await fetch('/api/loan_groups');
    gruppiPrestiti = await res.json();
    let sel = document.getElementById('select-loan-group');
    if (!sel) return;
    sel.innerHTML = '';
    gruppiPrestiti.forEach(g => {
        let opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.name;
        sel.appendChild(opt);
    });
    if (gruppiPrestiti.length > 0) {
        let savedId = localStorage.getItem('activeLoanGroupId');

        if (selezionaId && gruppiPrestiti.find(g => g.id == selezionaId)) {
            activeLoanGroupId = selezionaId;
        } else if (!activeLoanGroupId && savedId && gruppiPrestiti.find(g => g.id == savedId)) {
            activeLoanGroupId = savedId;
        } else if (!activeLoanGroupId || !gruppiPrestiti.find(g => g.id == activeLoanGroupId)) {
            activeLoanGroupId = gruppiPrestiti[0].id;
        }
        localStorage.setItem('activeLoanGroupId', activeLoanGroupId);
        sel.value = activeLoanGroupId;
    } else {
        let resNuovo = await fetch('/api/loan_groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Gruppo Prestiti' }) });
        if (resNuovo.ok) await caricaGruppiPrestiti();
    }
}

window.cambiaGruppoPrestiti = async function() {
    let sel = document.getElementById('select-loan-group');
    if (!sel) return;
    activeLoanGroupId = sel.value;
    localStorage.setItem('activeLoanGroupId', activeLoanGroupId);
    await window.caricaDatiPrestiti();
};

window.nuovoGruppoPrestiti = async function() {
    let nome = prompt("Nome nuovo gruppo prestiti:");
    if (nome && nome.trim() !== "") {
        let res = await fetch('/api/loan_groups', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name: nome.trim() }) 
        });
        if (res.ok) {
            let created = await res.json();
            await caricaGruppiPrestiti(created.id);
            await window.caricaDatiPrestiti();
        }
    }
};

window.rinominaGruppoPrestiti = async function() {
    if (!activeLoanGroupId) return;
    const sel = document.getElementById('select-loan-group');
    if (!sel) return;
    const currentName = sel.options[sel.selectedIndex].text;
    const nuovoNome = prompt("Inserisci il nuovo nome per il gruppo prestiti:", currentName);
    if (nuovoNome && nuovoNome.trim() !== "" && nuovoNome.trim() !== currentName) {
        try {
            const res = await fetch(`/api/loan_groups/${activeLoanGroupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nuovoNome.trim() })
            });
            if (res.ok) {
                const currentId = activeLoanGroupId;
                await caricaGruppiPrestiti(currentId);
            } else {
                const err = await res.json();
                alert("Errore: " + err.errore);
            }
        } catch (e) {
            alert("Errore di connessione durante la rinomina del gruppo.");
        }
    }
};

window.eliminaGruppoPrestiti = async function() {
    if (!activeLoanGroupId) return;
    const sel = document.getElementById('select-loan-group');
    if (!sel) return;
    const currentName = sel.options[sel.selectedIndex].text;
    let conferma = confirm(`ATTENZIONE! Sei sicuro di voler eliminare il gruppo prestiti "${currentName}" e TUTTI i prestiti/pagamenti associati?\n\nQuesta azione non può essere annullata.`);
    if (conferma) {
        try {
            const res = await fetch(`/api/loan_groups/${activeLoanGroupId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                activeLoanGroupId = null;
                localStorage.removeItem('activeLoanGroupId');
                await caricaGruppiPrestiti();
                await window.caricaDatiPrestiti();
            } else {
                const err = await res.json();
                alert("Errore: " + err.errore);
            }
        } catch (e) {
            alert("Errore di connessione durante l'eliminazione del gruppo.");
        }
    }
};

// --- INITIALIZATION ---
window.caricaDatiPrestiti = async function() {
    try {
        if (!activeLoanGroupId) {
            await caricaGruppiPrestiti();
        }
        if (!activeLoanGroupId) return;

        const response = await fetch('/api/loans?loan_group_id=' + activeLoanGroupId);
        if (response.ok) {
            loanState.loans = await response.json();
            
            // Populate selector
            populateLoanSelectors();
            
            // Resolve active loan
            const savedActive = localStorage.getItem('loans_active_id');
            if (savedActive && loanState.loans.some(l => l.id === savedActive)) {
                loanState.activeLoanId = savedActive;
            } else if (loanState.loans.length > 0) {
                loanState.activeLoanId = loanState.loans[0].id;
            } else {
                loanState.activeLoanId = null;
            }
            
            document.getElementById('active-loan-select').value = loanState.activeLoanId || '';
            
            // Fetch payments and refresh active view
            if (loanState.activeLoanId) {
                await fetchPaymentsForActiveLoan();
            } else {
                loanState.payments = [];
                clearDashboard();
            }
            
            refreshLoanUI();
        }
    } catch (e) {
        console.error("Error loading loans", e);
    }
};

async function fetchPaymentsForActiveLoan() {
    if (!loanState.activeLoanId) return;
    try {
        const response = await fetch(`/api/loans/${loanState.activeLoanId}/payments`);
        if (response.ok) {
            loanState.payments = await response.json();
        }
    } catch (e) {
        console.error("Error loading payments", e);
    }
}

// --- SELECTORS ---
function populateLoanSelectors() {
    const sel = document.getElementById('active-loan-select');
    if (!sel) return;
    sel.innerHTML = '';
    
    if (loanState.loans.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = window.Translations.noLoansOption || '-- No Loans --';
        sel.appendChild(opt);
        return;
    }
    
    loanState.loans.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name;
        sel.appendChild(opt);
    });
}

window.handleLoanChange = function(e) {
    const id = e.target.value;
    loanState.activeLoanId = id;
    localStorage.setItem('loans_active_id', id);
    
    // Fetch and redraw
    if (id) {
        fetchPaymentsForActiveLoan().then(() => {
            refreshLoanUI();
        });
    } else {
        loanState.payments = [];
        clearDashboard();
        refreshLoanUI();
    }
}

// --- SUB-TAB SWITCHER ---
window.switchLoanSubTab = function(tabName, event) {
    if (event) event.preventDefault();
    loanState.activeSubTab = tabName;
    
    // Manage active links
    document.querySelectorAll('[data-loan-tab]').forEach(el => {
        if (el.getAttribute('data-loan-tab') === tabName) el.classList.add('active');
        else el.classList.remove('active');
    });
    
    // Manage sections
    document.querySelectorAll('.loan-tab-content').forEach(el => {
        if (el.id === `loan-tab-${tabName}`) el.classList.add('active');
        else el.classList.remove('active');
    });
    
    refreshLoanUI();
}

// --- DYNAMIC CALCULATOR (FRENCH AMORTIZATION SCHEDULING) ---
function addMonths(dateStr, months) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // 0-indexed
    const day = parseInt(parts[2]);
    
    const d = new Date(year, month, day);
    d.setMonth(d.getMonth() + months);
    
    // Formatta YYYY-MM-DD
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getMonthDiff(startDateStr, dateStr) {
    if (!startDateStr || !dateStr) return 0;
    const sParts = startDateStr.split('-');
    const dParts = dateStr.split('-');
    const sYear = parseInt(sParts[0]);
    const sMonth = parseInt(sParts[1]);
    const dYear = parseInt(dParts[0]);
    const dMonth = parseInt(dParts[1]);
    
    let diff = (dYear - sYear) * 12 + (dMonth - sMonth);
    return Math.max(0, diff);
}

function calculateAmortization(principal, annualRate, termMonths, startDate, customMonthlyPayment = null, extraPayments = [], rateChanges = []) {
    // Sort rate changes by date
    const sortedRateChanges = [...rateChanges].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let currentAnnualRate = annualRate;
    let currentMonthlyRate = (currentAnnualRate / 12) / 100;
    
    // Theoretical monthly payment (French amortization formula)
    let baseInstallment = 0;
    if (customMonthlyPayment && customMonthlyPayment > 0) {
        baseInstallment = customMonthlyPayment;
    } else {
        if (currentMonthlyRate === 0) {
            baseInstallment = principal / termMonths;
        } else {
            baseInstallment = principal * (currentMonthlyRate * Math.pow(1 + currentMonthlyRate, termMonths)) / (Math.pow(1 + currentMonthlyRate, termMonths) - 1);
        }
    }
    
    const schedule = [];
    let remainingPrincipal = principal;
    let t = 1;
    
    // Group extra payments by month index
    const extrasByMonth = {};
    extraPayments.forEach(p => {
        const mIndex = getMonthDiff(startDate, p.date);
        if (mIndex > 0) {
            extrasByMonth[mIndex] = (extrasByMonth[mIndex] || 0) + p.amount;
        }
    });
    
    while (remainingPrincipal > 0.01 && t <= 1200) {
        const date = addMonths(startDate, t);
        
        // Find if there is a rate change active for this month
        let rateChanged = false;
        sortedRateChanges.forEach(rc => {
            if (rc.date <= date && rc.amount !== currentAnnualRate) {
                currentAnnualRate = rc.amount;
                rateChanged = true;
            }
        });
        
        if (rateChanged) {
            currentMonthlyRate = (currentAnnualRate / 12) / 100;
            const remainingTerm = termMonths - (t - 1);
            if (remainingTerm > 0 && (!customMonthlyPayment || customMonthlyPayment <= 0)) {
                if (currentMonthlyRate === 0) {
                    baseInstallment = remainingPrincipal / remainingTerm;
                } else {
                    baseInstallment = remainingPrincipal * (currentMonthlyRate * Math.pow(1 + currentMonthlyRate, remainingTerm)) / (Math.pow(1 + currentMonthlyRate, remainingTerm) - 1);
                }
            }
        }
        
        const interestPortion = remainingPrincipal * currentMonthlyRate;
        
        let installment = baseInstallment;
        if (remainingPrincipal + interestPortion < installment) {
            installment = remainingPrincipal + interestPortion;
        }
        
        const extraAmount = extrasByMonth[t] || 0;
        let principalPortion = installment - interestPortion;
        
        // Ensure principal portion doesn't exceed outstanding
        if (principalPortion > remainingPrincipal) {
            principalPortion = remainingPrincipal;
            installment = principalPortion + interestPortion;
        }
        
        let principalPaidTotal = principalPortion + extraAmount;
        if (principalPaidTotal > remainingPrincipal) {
            principalPaidTotal = remainingPrincipal;
        }
        
        remainingPrincipal -= principalPaidTotal;
        if (remainingPrincipal < 0) remainingPrincipal = 0;
        
        schedule.push({
            month: t,
            date: date,
            installment: installment,
            interest: interestPortion,
            principal: principalPortion,
            extra: extraAmount,
            total: installment + extraAmount,
            remaining: remainingPrincipal,
            rate: currentAnnualRate
        });
        
        t++;
    }
    
    return schedule;
}

// --- RENDERERS ---
function refreshLoanUI() {
    if (!loanState.activeLoanId) {
        clearDashboard();
        renderLoansGrid();
        return;
    }
    
    const loan = loanState.loans.find(l => l.id === loanState.activeLoanId);
    if (!loan) return;
    
    const rateChanges = loanState.payments.filter(p => p.type === 'rate_change');
    let displayRate = loan.interest_rate;
    if (rateChanges.length > 0) {
        const sorted = [...rateChanges].sort((a, b) => new Date(b.date) - new Date(a.date));
        displayRate = sorted[0].amount;
    }
    const rateTypeStr = loan.rate_type === 'variable' ? (window.Translations.variableRateLabel || 'Variable') : (window.Translations.fixedRateLabel || 'Fixed');
    
    // Update active titles
    document.getElementById('active-loan-title-dashboard').textContent = loan.name;
    document.getElementById('active-loan-desc-dashboard').textContent = `Tasso: ${rateTypeStr} | TAN: ${displayRate}% | Durata: ${loan.term_months} mesi | Inizio: ${loan.start_date}`;
    
    // Calculations
    const originalSchedule = calculateAmortization(loan.principal, loan.interest_rate, loan.term_months, loan.start_date, loan.monthly_payment, [], rateChanges);
    const actualSchedule = calculateAmortization(loan.principal, loan.interest_rate, loan.term_months, loan.start_date, loan.monthly_payment, loanState.payments.filter(p => p.type === 'extra'), rateChanges);
    
    if (loanState.activeSubTab === 'dashboard') {
        renderLoanDashboard(loan, originalSchedule, actualSchedule);
    } else if (loanState.activeSubTab === 'simulator') {
        runSimulation();
    } else if (loanState.activeSubTab === 'payments') {
        renderPaymentsTable();
    } else if (loanState.activeSubTab === 'schedule') {
        renderAmortizationTable(actualSchedule);
    } else if (loanState.activeSubTab === 'manage') {
        renderLoansGrid();
    }
}

function clearDashboard() {
    document.getElementById('active-loan-title-dashboard').textContent = window.Translations.noLoansTitle || 'No Loans';
    document.getElementById('active-loan-desc-dashboard').textContent = "Aggiungi un prestito per visualizzare le statistiche.";
    document.getElementById('kpi-loan-remaining').textContent = "€ 0,00";
    document.getElementById('kpi-loan-paid').textContent = "€ 0,00";
    document.getElementById('kpi-loan-progress').style.width = "0%";
    document.getElementById('kpi-loan-interest').textContent = "€ 0,00";
    document.getElementById('kpi-loan-savings').textContent = "€ 0,00";
    
    // Summary
    document.getElementById('summary-loan-principal').textContent = "€ 0,00";
    document.getElementById('summary-loan-rate').textContent = "0,00%";
    document.getElementById('summary-loan-term').textContent = "0 mesi";
    document.getElementById('summary-loan-payment').textContent = "€ 0,00";
    document.getElementById('summary-loan-start').textContent = "N/A";
    document.getElementById('summary-loan-end').textContent = "N/A";
    
    // Destroy charts
    if (chartLoanDonut) { chartLoanDonut.destroy(); chartLoanDonut = null; }
    if (chartLoanProjection) { chartLoanProjection.destroy(); chartLoanProjection = null; }
}

function renderLoanDashboard(loan, originalSchedule, actualSchedule) {
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#90A0C0' : '#5C6F84';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    
    const regularPayments = loanState.payments.filter(p => p.type === 'regular');
    const extraPayments = loanState.payments.filter(p => p.type === 'extra');
    
    const monthsElapsed = Math.min(actualSchedule.length, regularPayments.length);
    
    let totalPaidPrincipal = 0;
    let totalPaidInterest = 0;
    let remainingPrincipal = loan.principal;
    
    if (actualSchedule.length > 0) {
        if (monthsElapsed > 0) {
            const paidRegularPrincipal = actualSchedule.slice(0, monthsElapsed).reduce((sum, s) => sum + s.principal, 0);
            const paidExtraPrincipal = extraPayments.reduce((sum, p) => sum + p.amount, 0);
            
            totalPaidPrincipal = paidRegularPrincipal + paidExtraPrincipal;
            totalPaidInterest = actualSchedule.slice(0, monthsElapsed).reduce((sum, s) => sum + s.interest, 0);
            remainingPrincipal = Math.max(0, loan.principal - totalPaidPrincipal);
        } else {
            const paidExtraPrincipal = extraPayments.reduce((sum, p) => sum + p.amount, 0);
            totalPaidPrincipal = paidExtraPrincipal;
            remainingPrincipal = Math.max(0, loan.principal - totalPaidPrincipal);
        }
        
        if (totalPaidPrincipal > loan.principal) {
            totalPaidPrincipal = loan.principal;
        }
    }
    
    // Total interest savings achieved
    const origTotalInterest = originalSchedule.reduce((sum, s) => sum + s.interest, 0);
    const actualTotalInterest = actualSchedule.reduce((sum, s) => sum + s.interest, 0);
    const savings = Math.max(0, origTotalInterest - actualTotalInterest);
    
    // Progress
    const progressPercent = loan.principal > 0 ? (totalPaidPrincipal / loan.principal) * 100 : 0;
    
    // Update KPIs
    document.getElementById('kpi-loan-remaining').textContent = formatEuro(remainingPrincipal);
    document.getElementById('kpi-loan-paid').textContent = `${formatEuro(totalPaidPrincipal)} (${progressPercent.toFixed(1)}%)`;
    document.getElementById('kpi-loan-progress').style.width = `${progressPercent}%`;
    document.getElementById('kpi-loan-interest').textContent = formatEuro(totalPaidInterest);
    document.getElementById('kpi-loan-savings').textContent = formatEuro(savings);
    
    // Summary conditions
    const rateChanges = loanState.payments.filter(p => p.type === 'rate_change');
    let displayRate = loan.interest_rate;
    if (rateChanges.length > 0) {
        const sorted = [...rateChanges].sort((a, b) => new Date(b.date) - new Date(a.date));
        displayRate = sorted[0].amount;
    }
    const rateTypeStr = loan.rate_type === 'variable' ? (window.Translations.variableRateLabel || 'Variable') : (window.Translations.fixedRateLabel || 'Fixed');

    const calculatedPayment = originalSchedule.length > 0 ? originalSchedule[0].installment : 0;
    document.getElementById('summary-loan-principal').textContent = formatEuro(loan.principal);
    document.getElementById('summary-loan-rate').textContent = `${displayRate.toFixed(2)}% (${rateTypeStr})`;
    document.getElementById('summary-loan-term').textContent = `${loan.term_months} mesi`;
    document.getElementById('summary-loan-payment').textContent = formatEuro(loan.monthly_payment || calculatedPayment);
    document.getElementById('summary-loan-start').textContent = loan.start_date;
    document.getElementById('summary-loan-end').textContent = originalSchedule.length > 0 ? originalSchedule[originalSchedule.length - 1].date : 'N/A';
    
    // ---- CHART 1: Donut Stato Rimborso ----
    if (chartLoanDonut) { chartLoanDonut.destroy(); chartLoanDonut = null; }
    const donutCtx = document.getElementById('chart-loan-donut');
    if (donutCtx) {
        chartLoanDonut = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Capitale Restituito', 'Capitale Residuo'],
                datasets: [{
                    data: [totalPaidPrincipal, remainingPrincipal],
                    backgroundColor: ['#4CAF50', '#2196F3'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: textColor } }
                }
            }
        });
    }
    
    // ---- CHART 2: Projection Chart ----
    if (chartLoanProjection) { chartLoanProjection.destroy(); chartLoanProjection = null; }
    const projCtx = document.getElementById('chart-loan-projection');
    if (projCtx) {
        // Collect projection points every 6 months to keep it clean
        const labels = [loan.start_date];
        const dataOriginal = [loan.principal];
        const dataActual = [loan.principal];
        
        const step = Math.max(1, Math.floor(originalSchedule.length / 20)); // max 20 labels
        
        for (let i = step - 1; i < originalSchedule.length; i += step) {
            labels.push(originalSchedule[i].date);
            dataOriginal.push(originalSchedule[i].remaining);
        }
        if (originalSchedule.length % step !== 0) {
            labels.push(originalSchedule[originalSchedule.length - 1].date);
            dataOriginal.push(originalSchedule[originalSchedule.length - 1].remaining);
        }
        
        // Map actual remaining to the same dates
        labels.slice(1).forEach((date, index) => {
            // Find in actual schedule
            const actStep = actualSchedule.find(s => s.date === date) || actualSchedule[actualSchedule.length - 1];
            dataActual.push(actStep ? actStep.remaining : 0);
        });
        
        chartLoanProjection = new Chart(projCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Piano Originale',
                        data: dataOriginal,
                        borderColor: '#FF9800',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0
                    },
                    {
                        label: 'Piano Reale (con extra rimborsi)',
                        data: dataActual,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.05)',
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor } }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => `€ ${v.toLocaleString('it-IT')}` } }
                }
            }
        });
    }
}

// --- SIMULATOR ENGINE ---
window.runSimulation = function() {
    if (!loanState.activeLoanId) return;
    const loan = loanState.loans.find(l => l.id === loanState.activeLoanId);
    if (!loan) return;
    
    const extraAmount = parseFloat(document.getElementById('sim-extra-amount').value) || 0;
    const extraDate = document.getElementById('sim-extra-date').value || loan.start_date;
    const paymentIncrease = parseFloat(document.getElementById('sim-payment-increase').value) || 0;
    const strategy = document.getElementById('sim-strategy').value; // 'term' or 'payment'
    
    // Set simulator date default if empty
    if (!document.getElementById('sim-extra-date').value) {
        document.getElementById('sim-extra-date').value = addMonths(loan.start_date, 12); // default 1 year after start
    }
    
    // Calculate Actual (which is our base comparator)
    const rateChanges = loanState.payments.filter(p => p.type === 'rate_change');
    const baseSchedule = calculateAmortization(loan.principal, loan.interest_rate, loan.term_months, loan.start_date, loan.monthly_payment, loanState.payments.filter(p => p.type === 'extra'), rateChanges);
    
    // Calculate simulated schedule
    // Create copy of actual extra payments and append simulated one
    const simExtras = loanState.payments.filter(p => p.type === 'extra').map(p => ({ date: p.date, amount: p.amount }));
    if (extraAmount > 0) {
        simExtras.push({ date: extraDate, amount: extraAmount });
    }
    
    // If strategy is "term", the monthly installment remains the same but term is reduced.
    // If strategy is "payment", we have to adjust calculations. For this simplified simulator, we can recalculate baseInstallment if needed,
    // but the standard French repayment term reduction is most intuitive. Let's compute simulated schedule:
    let simInstallment = loan.monthly_payment;
    if (paymentIncrease > 0) {
        if (!simInstallment) {
            // compute base
            const monthlyRate = (loan.interest_rate / 12) / 100;
            if (monthlyRate === 0) simInstallment = loan.principal / loan.term_months;
            else simInstallment = loan.principal * (monthlyRate * Math.pow(1 + monthlyRate, loan.term_months)) / (Math.pow(1 + monthlyRate, loan.term_months) - 1);
        }
        simInstallment = simInstallment + paymentIncrease;
    }
    
    const simSchedule = calculateAmortization(loan.principal, loan.interest_rate, loan.term_months, loan.start_date, simInstallment, simExtras, rateChanges);
    
    // Calculate Interest Savings
    const baseInterest = baseSchedule.reduce((sum, s) => sum + s.interest, 0);
    const simInterest = simSchedule.reduce((sum, s) => sum + s.interest, 0);
    const savings = Math.max(0, baseInterest - simInterest);
    
    // Calculate Term Savings
    const baseTerm = baseSchedule.length;
    const simTerm = simSchedule.length;
    const termSavings = Math.max(0, baseTerm - simTerm);
    
    const newEndDate = simSchedule.length > 0 ? simSchedule[simSchedule.length - 1].date : 'N/A';
    
    // Update simulation results DOM
    document.getElementById('sim-savings-interest').textContent = formatEuro(savings);
    document.getElementById('sim-savings-term').textContent = `${termSavings} mesi`;
    document.getElementById('sim-new-end-date').textContent = newEndDate;
    
    // Render Simulation Chart
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#90A0C0' : '#5C6F84';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    
    if (chartSimComparison) { chartSimComparison.destroy(); chartSimComparison = null; }
    const simCtx = document.getElementById('chart-sim-comparison');
    if (simCtx) {
        const labels = [loan.start_date];
        const dataBase = [loan.principal];
        const dataSim = [loan.principal];
        
        const maxLen = Math.max(baseSchedule.length, simSchedule.length);
        const step = Math.max(1, Math.floor(maxLen / 20));
        
        for (let i = step - 1; i < maxLen; i += step) {
            const date = (baseSchedule[i] || baseSchedule[baseSchedule.length - 1] || {}).date || (simSchedule[i] || simSchedule[simSchedule.length - 1] || {}).date;
            labels.push(date);
            
            const baseStep = baseSchedule.find(s => s.date === date) || baseSchedule[baseSchedule.length - 1];
            dataBase.push(baseStep && baseSchedule.indexOf(baseStep) <= i ? baseStep.remaining : 0);
            
            const simStep = simSchedule.find(s => s.date === date) || simSchedule[simSchedule.length - 1];
            dataSim.push(simStep && simSchedule.indexOf(simStep) <= i ? simStep.remaining : 0);
        }
        
        chartSimComparison = new Chart(simCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Debito Corrente',
                        data: dataBase,
                        borderColor: '#2196F3',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0
                    },
                    {
                        label: 'Debito Simulato',
                        data: dataSim,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.05)',
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor } }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => `€ ${v.toLocaleString('it-IT')}` } }
                }
            }
        });
    }
}

// --- HISTORY RENDERER ---
function renderPaymentsTable() {
    const tbody = document.getElementById('loan-payments-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (loanState.payments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">${window.Translations.noPayments || 'No payments registered.'}</td></tr>`;
        return;
    }
    
    loanState.payments.forEach(p => {
        const tr = document.createElement('tr');
        
        let typeText = window.Translations.regularInstallment || 'Rata Mensile';
        let typeColor = 'var(--text-primary)';
        let amountText = formatEuro(p.amount);
        
        if (p.type === 'extra') {
            typeText = window.Translations.extraordinaryRepayment || 'Rimborso Straordinario';
            typeColor = '#2e7d32';
        } else if (p.type === 'rate_change') {
            typeText = window.Translations.rateChange || 'Variazione Tasso';
            typeColor = '#ff9800';
            amountText = `${p.amount.toFixed(2)}%`;
        }
        
        tr.innerHTML = `
            <td style="padding: 10px; border-bottom: 1px solid var(--border-color);">${p.date}</td>
            <td style="padding: 10px; border-bottom: 1px solid var(--border-color); font-weight:600; color: ${typeColor};">
                ${typeText}
            </td>
            <td style="padding: 10px; border-bottom: 1px solid var(--border-color); text-align:right; font-weight:700;">${amountText}</td>
            <td style="padding: 10px; border-bottom: 1px solid var(--border-color); color:var(--text-muted); font-style:italic;">${p.notes || ''}</td>
            <td style="padding: 10px; border-bottom: 1px solid var(--border-color); text-align:center;">
                <button class="icon-btn" onclick="editPayment('${p.id}')" title="Modifica" style="margin-right:8px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="icon-btn btn-delete" onclick="deletePayment('${p.id}')" title="Elimina">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- AMORTIZATION TABLE RENDERER ---
function renderAmortizationTable(schedule) {
    const tbody = document.getElementById('loan-schedule-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (schedule.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px; color:var(--text-muted);">${window.Translations.noAmortizationPlan || 'No amortization plan available.'}</td></tr>`;
        return;
    }
    
    schedule.forEach(s => {
        const tr = document.createElement('tr');
        if (s.extra > 0) {
            tr.className = 'schedule-row-extra';
        }
        
        tr.innerHTML = `
            <td style="text-align:center; padding: 10px; border-bottom: 1px solid var(--border-color);">${s.month}</td>
            <td style="padding: 10px; border-bottom: 1px solid var(--border-color);">${s.date}</td>
            <td style="text-align:right; padding: 10px; border-bottom: 1px solid var(--border-color); font-weight:600; color:var(--primary-color);">${(s.rate || 0).toFixed(2)}%</td>
            <td style="text-align:right; padding: 10px; border-bottom: 1px solid var(--border-color);">${formatEuro(s.interest)}</td>
            <td style="text-align:right; padding: 10px; border-bottom: 1px solid var(--border-color);">${formatEuro(s.principal)}</td>
            <td style="text-align:right; padding: 10px; border-bottom: 1px solid var(--border-color); font-weight:${s.extra > 0 ? '700' : 'normal'};">${s.extra > 0 ? formatEuro(s.extra) : '---'}</td>
            <td style="text-align:right; padding: 10px; border-bottom: 1px solid var(--border-color); font-weight:700;">${formatEuro(s.total)}</td>
            <td style="text-align:right; padding: 10px; border-bottom: 1px solid var(--border-color); font-weight:600;">${formatEuro(s.remaining)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- LOANS MANAGER GRID RENDERER ---
function renderLoansGrid() {
    const list = document.getElementById('loans-list-container');
    if (!list) return;
    list.innerHTML = '';
    
    if (loanState.loans.length === 0) {
        list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); width:100%;">${window.Translations.noLoansRegistered || 'No loans registered. Click on "New Loan" to start!'}</div>`;
        return;
    }
    
    loanState.loans.forEach(l => {
        const card = document.createElement('div');
        const isActive = l.id === loanState.activeLoanId;
        card.className = `loan-card ${isActive ? 'active-card' : ''}`;
        
        const rateTypeStr = l.rate_type === 'variable' ? (window.Translations.variableRateLabel || 'Variable') : (window.Translations.fixedRateLabel || 'Fixed');
        
        card.innerHTML = `
            <div class="loan-card-header">
                <div class="vehicle-card-name-group">
                    <span class="loan-card-name">${l.name}</span>
                    <span class="loan-card-rate">Tasso: ${rateTypeStr} | TAN: ${l.interest_rate}% | Durata: ${l.term_months} mesi</span>
                </div>
            </div>
            
            <div class="vehicle-card-body" style="margin-top: 10px;">
                <div class="vehicle-card-info-item">
                    <span class="vehicle-card-info-label">Importo Originale:</span>
                    <span class="vehicle-card-info-val">${formatEuro(l.principal)}</span>
                </div>
                <div class="vehicle-card-info-item">
                    <span class="vehicle-card-info-label">Data Inizio:</span>
                    <span class="vehicle-card-info-val">${l.start_date}</span>
                </div>
            </div>
            
            <div class="loan-card-actions">
                ${!isActive ? `<button class="btn btn-secondary btn-small" onclick="selectLoan('${l.id}')" style="padding: 6px 12px; font-size:12px;">Seleziona</button>` : '<span style="font-size:12px; font-weight:700; color:var(--primary-color); display:flex; align-items:center; margin-right:auto;">Attivo</span>'}
                
                <button class="icon-btn" onclick="openLoanModal('${l.id}')" title="Modifica prestito" style="margin-left: 8px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="icon-btn btn-delete" onclick="deleteLoan('${l.id}')" title="Elimina prestito">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

window.selectLoan = function(id) {
    loanState.activeLoanId = id;
    localStorage.setItem('loans_active_id', id);
    document.getElementById('active-loan-select').value = id;
    fetchPaymentsForActiveLoan().then(() => {
        refreshLoanUI();
    });
}

// --- CRUD HANDLERS FOR LOANS ---
window.openLoanModal = function(id = null) {
    const form = document.getElementById('loan-form');
    form.reset();
    
    if (id) {
        const l = loanState.loans.find(item => item.id === id);
        if (!l) return;
        
        document.getElementById('loan-edit-id').value = l.id;
        document.getElementById('l-name').value = l.name;
        document.getElementById('l-principal').value = l.principal;
        document.getElementById('l-rate').value = l.interest_rate;
        document.getElementById('l-term').value = l.term_months;
        document.getElementById('l-start').value = l.start_date;
        document.getElementById('l-payment').value = l.monthly_payment || '';
        document.getElementById('l-rate-type').value = l.rate_type || 'fixed';
        
        document.getElementById('loan-modal-title').textContent = "Modifica Prestito";
    } else {
        document.getElementById('loan-edit-id').value = '';
        document.getElementById('l-rate-type').value = 'fixed';
        document.getElementById('loan-modal-title').textContent = "Nuovo Prestito";
    }
    
    if (window.handleModalRateTypeChange) {
        window.handleModalRateTypeChange();
    }
    
    document.getElementById('loan-modal').classList.add('open');
}

window.closeLoanModal = function() {
    document.getElementById('loan-modal').classList.remove('open');
}

window.handleLoanSubmit = async function(e) {
    e.preventDefault();
    
    const id = document.getElementById('loan-edit-id').value;
    const name = document.getElementById('l-name').value;
    const principal = parseFloat(document.getElementById('l-principal').value);
    const rate = parseFloat(document.getElementById('l-rate').value);
    const term = parseInt(document.getElementById('l-term').value);
    const start = document.getElementById('l-start').value;
    const pVal = document.getElementById('l-payment').value;
    const payment = pVal !== '' ? parseFloat(pVal) : null;
    const rateType = document.getElementById('l-rate-type').value;
    
    const payload = { id, name, principal, interest_rate: rate, term_months: term, start_date: start, monthly_payment: payment, loan_group_id: activeLoanGroupId, rate_type: rateType };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/loans/${id}` : '/api/loans?loan_group_id=' + activeLoanGroupId;
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            closeLoanModal();
            await window.caricaDatiPrestiti();
        } else {
            alert("Errore durante il salvataggio del prestito.");
        }
    } catch (err) {
        console.error(err);
        alert("Errore di rete.");
    }
}

window.deleteLoan = async function(id) {
    if (!confirm("Sei sicuro di voler eliminare questo prestito? Verrà cancellato l'intero storico dei pagamenti associati. L'azione è irreversibile.")) return;
    
    try {
        const response = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
        if (response.ok) {
            await window.caricaDatiPrestiti();
        } else {
            alert("Errore durante l'eliminazione del prestito.");
        }
    } catch (err) {
        console.error(err);
    }
}

// --- CRUD HANDLERS FOR PAYMENTS ---
window.editPayment = function(paymentId) {
    const p = loanState.payments.find(item => item.id === paymentId);
    if (!p) return;
    
    document.getElementById('loan-payment-edit-id').value = p.id;
    document.getElementById('p-date').value = p.date;
    document.getElementById('p-amount').value = p.amount;
    document.getElementById('p-type').value = p.type;
    document.getElementById('p-notes').value = p.notes || '';
    
    // Scroll to form or highlight
    document.getElementById('loan-payment-form').scrollIntoView({ behavior: 'smooth' });
}

window.resetPaymentForm = function() {
    document.getElementById('loan-payment-edit-id').value = '';
    document.getElementById('loan-payment-form').reset();
}

window.handlePaymentSubmit = async function(e) {
    e.preventDefault();
    if (!loanState.activeLoanId) {
        alert(window.Translations.noLoansActiveAlert || "No active loan selected.");
        return;
    }
    
    const id = document.getElementById('loan-payment-edit-id').value;
    const date = document.getElementById('p-date').value;
    const amount = parseFloat(document.getElementById('p-amount').value);
    const type = document.getElementById('p-type').value;
    const notes = document.getElementById('p-notes').value;
    
    // Controllo duplicati frontend (solo per nuove registrazioni)
    if (!id) {
        const isDuplicate = loanState.payments.some(p => 
            p.date === date && 
            p.type === type && 
            p.amount === amount
        );
        if (isDuplicate) {
            alert("Errore: esiste già una transazione registrata con la stessa data, tipo e importo.");
            return;
        }
    }
    
    const payload = { id, date, amount, type, notes };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/loans/payments/${id}` : `/api/loans/${loanState.activeLoanId}/payments`;
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            resetPaymentForm();
            await fetchPaymentsForActiveLoan();
            refreshLoanUI();
        } else {
            if (response.status === 409) {
                alert("Errore: questa transazione esiste già (stessa data, tipo e importo).");
            } else {
                alert("Errore durante la registrazione del pagamento.");
            }
        }
    } catch (err) {
        console.error(err);
        alert("Errore di rete.");
    }
}

window.deletePayment = async function(paymentId) {
    if (!confirm("Sei sicuro di voler eliminare questo pagamento?")) return;
    try {
        const response = await fetch(`/api/loans/payments/${paymentId}`, { method: 'DELETE' });
        if (response.ok) {
            await fetchPaymentsForActiveLoan();
            refreshLoanUI();
        } else {
            alert("Errore durante l'eliminazione.");
        }
    } catch (err) {
        console.error(err);
    }
}

// --- IMPORT & EXPORT LOANS BACKUP ---
window.exportLoansBackup = function() {
    if (loanState.loans.length === 0) {
        alert(window.Translations.noLoansExportAlert || "No loans to export.");
        return;
    }
    
    // Fetch payments for all loans to make a full backup
    // Since we want to make it synchronous/easy, we export the loans table and our active loan payments.
    // Or we can let them download a full JSON structure of the loans tab!
    // Let's gather all data and create a download link.
    const backupData = {
        version: "1.0",
        loans: loanState.loans,
        payments: loanState.payments // exports current active loan payments
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `cotrack_prestiti_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

window.openImportLoansBackup = function() {
    document.getElementById('loans-backup-import-file').click();
}

window.importLoansBackup = async function(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.loans || !Array.isArray(data.loans)) {
                alert("File di backup non valido.");
                return;
            }
            
            let loanCount = 0;
            let paymentCount = 0;
            let duplicateCount = 0;
            
            // Loop and save each loan and payment
            for (const l of data.loans) {
                // save loan
                l.loan_group_id = activeLoanGroupId;
                const lRes = await fetch('/api/loans?loan_group_id=' + activeLoanGroupId, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(l)
                });
                
                if (lRes.ok) {
                    loanCount++;
                    if (data.payments) {
                        // save payments for this loan
                        for (const p of data.payments) {
                            if (p.loan_id === l.id) {
                                const pRes = await fetch(`/api/loans/${l.id}/payments`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(p)
                                });
                                if (pRes.ok) {
                                    paymentCount++;
                                } else if (pRes.status === 409) {
                                    duplicateCount++;
                                }
                            }
                        }
                    }
                }
            }
            
            if (duplicateCount > 0) {
                alert(`Importazione completata! Creati ${loanCount} prestiti, importati ${paymentCount} pagamenti. Rilevati e ignorati ${duplicateCount} duplicati.`);
            } else {
                alert(`Importazione completata con successo! Creati ${loanCount} prestiti e importati ${paymentCount} pagamenti.`);
            }
            await window.caricaDatiPrestiti();
        } catch (err) {
            console.error(err);
            alert("Errore durante la lettura del file di backup.");
        }
    };
    reader.readAsText(file);
    input.value = ''; // Reset input
}

window.refreshLoanUI = refreshLoanUI;

// --- PDF BANK STATEMENT PARSER ---
let parsedPdfTransactions = []; // temporarily hold parsed transactions

window.handleStatementPdfUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!loanState.activeLoanId) {
        alert("Seleziona prima un prestito attivo su cui importare le transazioni.");
        event.target.value = '';
        return;
    }

    const loader = document.getElementById('pdf-import-loading');
    if (loader) loader.style.display = 'block';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/loans/parse_statement_pdf', {
            method: 'POST',
            body: formData
        });

        if (loader) loader.style.display = 'none';
        event.target.value = ''; // reset file input

        if (response.ok) {
            const data = await response.json();
            parsedPdfTransactions = data.transactions || [];
            
            if (parsedPdfTransactions.length === 0) {
                alert(window.Translations.noLoansPdfAlert || "No payment or repayment detected in the PDF file.");
                return;
            }

            renderPdfReviewTable();
            document.getElementById('pdf-review-modal').classList.add('open');
        } else {
            const err = await response.json();
            alert("Errore durante l'elaborazione del PDF: " + (err.errore || "Errore sconosciuto"));
        }
    } catch (err) {
        if (loader) loader.style.display = 'none';
        event.target.value = '';
        console.error(err);
        alert("Errore di rete durante il caricamento del file.");
    }
};

function renderPdfReviewTable() {
    const tbody = document.getElementById('pdf-transactions-review-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    parsedPdfTransactions.forEach((t, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        
        tr.innerHTML = `
            <td style="text-align: center; padding: 10px;">
                <input type="checkbox" class="pdf-row-checkbox" data-index="${index}" checked style="cursor: pointer;">
            </td>
            <td style="padding: 10px;">
                <input type="date" class="pdf-row-date" value="${t.date}" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 13px; width: 130px; background: var(--bg-card); color: var(--text-primary);">
            </td>
            <td style="padding: 10px;">
                <select class="pdf-row-type" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 13px; background: var(--bg-card); color: var(--text-primary);">
                    <option value="regular" ${t.type === 'regular' ? 'selected' : ''}>Rata Ordinaria</option>
                    <option value="extra" ${t.type === 'extra' ? 'selected' : ''}>Rimborso Anticipato</option>
                </select>
            </td>
            <td style="padding: 10px; text-align: right;">
                <input type="number" step="0.01" class="pdf-row-amount" value="${t.amount}" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 13px; text-align: right; width: 100px; background: var(--bg-card); color: var(--text-primary);">
            </td>
            <td style="padding: 10px;">
                <input type="text" class="pdf-row-notes" value="${t.notes || ''}" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 13px; width: 100%; max-width: 250px; background: var(--bg-card); color: var(--text-primary);">
            </td>
        `;
        tbody.appendChild(tr);
    });

    const selectAll = document.getElementById('pdf-select-all-checkbox');
    if (selectAll) selectAll.checked = true;
}

window.toggleSelectAllPdfTransactions = function(selectAllInput) {
    const checkBoxes = document.querySelectorAll('.pdf-row-checkbox');
    checkBoxes.forEach(cb => {
        cb.checked = selectAllInput.checked;
    });
};

window.closePdfReviewModal = function() {
    document.getElementById('pdf-review-modal').classList.remove('open');
};

window.submitPdfImportedTransactions = async function() {
    if (!loanState.activeLoanId) return;

    const checkboxes = document.querySelectorAll('.pdf-row-checkbox');
    const checkedRows = [];

    checkboxes.forEach(cb => {
        if (cb.checked) {
            const idx = parseInt(cb.getAttribute('data-index'));
            const tr = cb.closest('tr');
            const date = tr.querySelector('.pdf-row-date').value;
            const type = tr.querySelector('.pdf-row-type').value;
            const amount = parseFloat(tr.querySelector('.pdf-row-amount').value);
            const notes = tr.querySelector('.pdf-row-notes').value;

            if (date && amount > 0) {
                checkedRows.push({ date, type, amount, notes });
            }
        }
    });

    if (checkedRows.length === 0) {
        alert("Seleziona almeno una transazione valida da importare.");
        return;
    }

    let successCount = 0;
    let duplicateCount = 0;
    for (const item of checkedRows) {
        // Controllo duplicato a livello frontend prima dell'invio
        const isDuplicate = loanState.payments.some(p => 
            p.date === item.date && 
            p.type === item.type && 
            p.amount === item.amount
        );
        if (isDuplicate) {
            duplicateCount++;
            continue;
        }
        
        try {
            const res = await fetch(`/api/loans/${loanState.activeLoanId}/payments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (res.ok) {
                successCount++;
            } else if (res.status === 409) {
                duplicateCount++;
            }
        } catch (e) {
            console.error("Error importing row: ", e);
        }
    }

    closePdfReviewModal();
    if (duplicateCount > 0) {
        alert(`Importazione completata! Importati ${successCount} pagamenti. Rilevati e ignorati ${duplicateCount} duplicati.`);
    } else {
        alert(`Importazione completata! Importati ${successCount} su ${checkedRows.length} pagamenti.`);
    }
    await window.caricaDatiPrestiti();
};

// ── CUSTOM PDF IMPORT ─────────────────────────────────────────────────────────
let parsedLoanCustomPdfRows = [];

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
    return str;
}

window.handleLoanCustomPdfUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!loanState.activeLoanId) {
        alert("Seleziona un prestito prima di caricare.");
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
        
        document.getElementById('loan-custom-pdf-text').value = data.text;
        
        // Initialize mapping selectors
        const selectors = [
            { id: 'loan-custom-pdf-map-date', def: '1' },
            { id: 'loan-custom-pdf-map-amount', def: '2' },
            { id: 'loan-custom-pdf-map-type', def: '3' },
            { id: 'loan-custom-pdf-map-notes', def: '4' }
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
        document.getElementById('loan-custom-pdf-regex').value = '(\\d{2}/\\d{2}/\\d{4})\\s+([\\d.,]+)\\s+(\\w+)\\s+(.*)';
        document.getElementById('loan-custom-pdf-preview-body').innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Clicca Test & Parse per elaborare.</td></tr>`;
        
        document.getElementById('loan-custom-pdf-modal').style.display = 'flex';
    } catch (e) {
        alert("Errore di rete durante la lettura del PDF.");
    } finally {
        event.target.value = '';
    }
};

window.testLoanCustomPdfRegex = function() {
    const text = document.getElementById('loan-custom-pdf-text').value;
    const patternStr = document.getElementById('loan-custom-pdf-regex').value.trim();
    if (!patternStr) { alert("Inserisci un pattern regex."); return; }
    
    let regex;
    try {
        regex = new RegExp(patternStr, 'g');
    } catch(e) {
        alert("Regex non valida: " + e.message);
        return;
    }
    
    const dateGroup = document.getElementById('loan-custom-pdf-map-date').value;
    const amountGroup = document.getElementById('loan-custom-pdf-map-amount').value;
    const typeGroup = document.getElementById('loan-custom-pdf-map-type').value;
    const notesGroup = document.getElementById('loan-custom-pdf-map-notes').value;
    
    const tbody = document.getElementById('loan-custom-pdf-preview-body');
    tbody.innerHTML = '';
    
    let match;
    let index = 0;
    parsedLoanCustomPdfRows = [];
    
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
        if (match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        const dateVal = dateGroup !== 'none' ? (match[parseInt(dateGroup)] || '').trim() : '';
        const amountVal = amountGroup !== 'none' ? (match[parseInt(amountGroup)] || '').trim() : '';
        const typeVal = typeGroup !== 'none' ? (match[parseInt(typeGroup)] || '').trim() : '';
        const notesVal = notesGroup !== 'none' ? (match[parseInt(notesGroup)] || '').trim() : '';
        
        parsedLoanCustomPdfRows.push({
            date: dateVal,
            amount: amountVal,
            type: typeVal,
            notes: notesVal
        });
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="text-align: center;"><input type="checkbox" class="loan-custom-pdf-row-cb" data-index="${index}" checked></td>
                <td><input type="date" class="loan-custom-pdf-row-date" value="${formatDateForInput(dateVal)}" style="padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
                <td>
                    <select class="loan-custom-pdf-row-type" style="padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}">
                        <option value="Rata" ${typeVal.toLowerCase().includes('rat') ? 'selected' : ''}>Rata</option>
                        <option value="Rimborso" ${typeVal.toLowerCase().includes('rimb') ? 'selected' : ''}>Rimborso</option>
                        <option value="Spese" ${typeVal.toLowerCase().includes('spes') ? 'selected' : ''}>Spese</option>
                        <option value="Interessi" ${typeVal.toLowerCase().includes('int') ? 'selected' : ''}>Interessi</option>
                    </select>
                </td>
                <td><input type="number" step="0.01" class="loan-custom-pdf-row-amount" value="${cleanFloatStr(amountVal)}" style="width: 80px; text-align: right; padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
                <td><input type="text" class="loan-custom-pdf-row-notes" value="${notesVal || 'Importazione PDF Personalizzata'}" style="width: 100%; min-width: 100px; padding: 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px;" data-index="${index}"></td>
            </tr>
        `;
        index++;
    }
    
    if (parsedLoanCustomPdfRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nessuna corrispondenza trovata con questo pattern.</td></tr>`;
    }
};

window.toggleAllLoanCustomPdfRows = function(masterCb) {
    const checkBoxes = document.querySelectorAll('.loan-custom-pdf-row-cb');
    checkBoxes.forEach(cb => cb.checked = masterCb.checked);
};

window.confirmLoanCustomPdfImport = async function() {
    if (!loanState.activeLoanId) return;
    
    const checkboxes = document.querySelectorAll(".loan-custom-pdf-row-cb:checked");
    if (checkboxes.length === 0) {
        alert("Seleziona almeno un pagamento da importare.");
        return;
    }
    
    let importedCount = 0;
    let duplicateCount = 0;
    for (let cb of checkboxes) {
        const index = parseInt(cb.getAttribute("data-index"));
        const dateInput = document.querySelector(`.loan-custom-pdf-row-date[data-index="${index}"]`);
        const typeSelect = document.querySelector(`.loan-custom-pdf-row-type[data-index="${index}"]`);
        const amountInput = document.querySelector(`.loan-custom-pdf-row-amount[data-index="${index}"]`);
        const notesInput = document.querySelector(`.loan-custom-pdf-row-notes[data-index="${index}"]`);
        
        const date = dateInput ? dateInput.value : '';
        const type = typeSelect ? typeSelect.value : 'Rata';
        const amount = amountInput ? parseFloat(amountInput.value) : 0.0;
        const notes = notesInput ? notesInput.value : 'Importato da PDF personalizzato';
        
        if (!date || amount <= 0) {
            continue;
        }

        const isDuplicate = loanState.payments.some(p => 
            p.date === date && 
            p.type === type && 
            p.amount === amount
        );
        if (isDuplicate) {
            duplicateCount++;
            continue;
        }
        
        const body = { date, type, amount, notes };
        
        try {
            const res = await fetch(`/api/loans/${loanState.activeLoanId}/payments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                importedCount++;
            }
        } catch (e) {
            console.error("Errore importazione pagamento:", e);
        }
    }
    
    document.getElementById('loan-custom-pdf-modal').style.display = 'none';
    if (duplicateCount > 0) {
        alert(`Importazione completata! Importati ${importedCount} pagamenti. Rilevati e ignorati ${duplicateCount} duplicati.`);
    } else {
        alert(`Importazione completata! Importati ${importedCount} pagamenti.`);
    }
    await window.caricaDatiPrestiti();
};

window.updatePaymentAmountLabel = function() {
    const pType = document.getElementById('p-type').value;
    const labelEl = document.getElementById('p-amount-label');
    const inputEl = document.getElementById('p-amount');
    if (!labelEl || !inputEl) return;
    if (pType === 'rate_change') {
        labelEl.textContent = labelEl.getAttribute('data-rate-label') || 'New Rate (TAN %) *';
        inputEl.placeholder = 'e.g., 4.25';
    } else {
        labelEl.textContent = labelEl.getAttribute('data-amount-label') || 'Amount (€) *';
        inputEl.placeholder = 'e.g., 620.50';
    }
};

window.handleModalRateTypeChange = function() {
    const typeSel = document.getElementById('l-rate-type');
    const helpEl = document.getElementById('l-rate-type-help');
    if (typeSel && helpEl) {
        helpEl.style.display = typeSel.value === 'variable' ? 'block' : 'none';
    }
};

