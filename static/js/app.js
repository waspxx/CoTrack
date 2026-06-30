let mioGrafico = null;
let graficoAndamentoLinee = null;
let graficoAssetTypeObj = null;
let graficoAnniObj = null;
let graficoDDObj = null;
let graficoBenchmarkObj = null;
let gaugeSaldoObj = null;
let gaugeFlussoObj = null;
let gaugeSpeseObj = null;
let trendSaldoObj = null;
// let graficoSaldiObj = null;

// VARIABILI GLOBALI PER I FILTRI DEL GRAFICO
let datiStoriciGlobal = null;
let currentMetricaAndamento = 'Valore';
let currentPeriodoAndamento = 'All';
let activeTickers = []; // Ticker attualmente selezionati per l'andamento
let activePortfolioId = null; // ID del portafoglio correntemente visualizzato (Investimenti)
let activeWalletId = null;    // ID del wallet correntemente visualizzato (Wallet)
let activeBillsId = null;     // ID del gruppo bollette correntemente visualizzato (Bollette)
let activeGarageId = null;    // ID del garage correntemente visualizzato (Veicoli)
let mostraDividendi = false;

async function handleReload() {
    const reloadBtn = document.getElementById('reload-button');
    if (reloadBtn.classList.contains('loading')) return; // Evita click multipli

    reloadBtn.classList.add('loading');

    // 1. Resetta lo stato dei dati globali e dei filtri
    datiStoriciGlobal = null;
    activeTickers = [];

    // 2. Distruggi le istanze dei grafici esistenti per evitare di mostrare dati vecchi
    if (mioGrafico) { mioGrafico.destroy(); mioGrafico = null; }
    if (graficoAssetTypeObj) { graficoAssetTypeObj.destroy(); graficoAssetTypeObj = null; }
    if (graficoAndamentoLinee) { graficoAndamentoLinee.destroy(); graficoAndamentoLinee = null; }
    if (graficoAnniObj) { graficoAnniObj.destroy(); graficoAnniObj = null; }
    if (graficoDDObj) { graficoDDObj.destroy(); graficoDDObj = null; }
    if (graficoBenchmarkObj) { graficoBenchmarkObj.destroy(); graficoBenchmarkObj = null; }
    if (gaugeSaldoObj) { gaugeSaldoObj.destroy(); gaugeSaldoObj = null; }
    if (gaugeFlussoObj) { gaugeFlussoObj.destroy(); gaugeFlussoObj = null; }
    if (gaugeSpeseObj) { gaugeSpeseObj.destroy(); gaugeSpeseObj = null; }
    if (trendSaldoObj) { trendSaldoObj.destroy(); trendSaldoObj = null; }

    // Mostra i messaggi di caricamento in modo più visibile
    document.getElementById('graficoAndamento').style.display = 'none';
    document.getElementById('loading-grafico').style.display = 'block';
    document.getElementById('loading-grafico').innerText = document.documentElement.lang === 'it' ? "Ricaricando tutti i dati..." : "Reloading all data...";

    // Svuota le tabelle e i KPI per un feedback visivo immediato
    document.getElementById("corpo-tabella-pmc").innerHTML = `<tr><td colspan="8" style="text-align:center;">${window.Translations.loading || 'Loading...'}</td></tr>`;
    document.getElementById("piede-tabella-pmc").innerHTML = '';
    document.getElementById("corpo-tabella").innerHTML = `<tr><td colspan="9" style="text-align:center;">${window.Translations.loading || 'Loading...'}</td></tr>`;
    document.getElementById("kpi-valore").innerText = "...";
    document.getElementById("kpi-investito").innerText = "...";
    document.getElementById("kpi-guadagno").innerText = "...";
    document.getElementById("kpi-rendimento").innerText = "...";
    document.getElementById("kpi-annualizzato").innerText = "...";
    document.getElementById("kpi-dividendi").innerText = "...";
    document.getElementById("kpi-volatilita").innerText = "...";
    document.getElementById("kpi-sharpe").innerText = "...";
    document.getElementById("kpi-tassa-gain").innerText = "...";

    try {
        await caricaDati();
        await caricaDatiWallet();
        await caricaDatiBollette();
        // await caricaSaldiWallet();
        if (typeof window.caricaDatiVeicoli === 'function') {
            await window.caricaDatiVeicoli();
        }
        if (typeof window.caricaDatiPrestiti === 'function') {
            await window.caricaDatiPrestiti();
        }
    } catch (error) {
        console.error("Errore durante il ricaricamento:", error);
        alert("An error occurred while reloading data.");
        document.getElementById('loading-grafico').innerText = "Error loading data.";
    } finally {
        reloadBtn.classList.remove('loading');
    }
}

function ottieniTabIdDaHash(hash) {
    if (!hash) return null;
    let h = hash.replace('#', '').toLowerCase();
    if (h === 'investimenti' || h === 'investments' || h === 'tab-investimenti') return 'tab-investimenti';
    if (h === 'wallet' || h === 'tab-wallet') return 'tab-wallet';
    if (h === 'bollette' || h === 'bills' || h === 'tab-bollette') return 'tab-bollette';
    if (h === 'veicoli' || h === 'vehicles' || h === 'tab-veicoli') return 'tab-veicoli';
    if (h === 'prestiti' || h === 'loans' || h === 'tab-prestiti') return 'tab-prestiti';
    if (h === 'stipendi' || h === 'salaries' || h === 'tab-stipendi') return 'tab-stipendi';
    if (h === 'fondopensione' || h === 'pension' || h === 'tab-fondopensione') return 'tab-fondopensione';
    if (h === 'settings' || h === 'tab-settings') return 'tab-settings';
    return null;
}

function gestisciCambioHash() {
    let tabId = ottieniTabIdDaHash(window.location.hash);
    if (tabId) {
        let btnId = 'btn-' + tabId;
        let btn = document.getElementById(btnId);
        if (btn) {
            switchTab(tabId, btn);
        }
    }
}

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('reset_token');
    if (resetToken) {
        let newPassword = prompt("Enter your new password:");
        if (newPassword) {
            fetch('/api/auth/reset_password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, password: newPassword })
            }).then(res => res.json()).then(data => {
                if (data.errore) alert(data.errore);
                else alert("Password updated successfully! You can now log in.");
                window.location.href = '/';
            }).catch(err => {
                alert("Network error.");
                window.location.href = '/';
            });
        } else {
            window.location.href = '/';
        }
        return; // Interrompe il normale avvio se si è in fase di reset
    }

    checkAuth();
    setupFiltriAndamento();
    // caricaTokenWallet();
    // caricaSaldiWallet();
    scheduleDailyUpdate();

    // Ripristina il tab attivo tramite Hash o localStorage
    window.addEventListener('hashchange', gestisciCambioHash);

    // Hide/show tabs based on settings
    if (typeof window.applyTabVisibility === 'function') {
        window.applyTabVisibility();
    }

    let tabIdFromHash = ottieniTabIdDaHash(window.location.hash);
    let defaultTab = localStorage.getItem('default_tab') || 'tab-investimenti';
    let activeTab = tabIdFromHash || localStorage.getItem('activeTab') || defaultTab;
    
    // Check if the loaded tab is actually visible/enabled
    const isTabActive = localStorage.getItem(activeTab.replace('tab-', 'tab_') + '_active') !== 'false';
    if (!isTabActive && activeTab !== 'tab-settings') {
        // Fall back to default tab if enabled, or first active tab
        const tabs = [
            'tab-investimenti', 'tab-wallet', 'tab-bollette', 'tab-veicoli', 'tab-prestiti', 'tab-stipendi', 'tab-fondopensione'
        ];
        const firstActive = tabs.find(t => localStorage.getItem(t.replace('tab-', 'tab_') + '_active') !== 'false') || 'tab-settings';
        activeTab = firstActive;
    }

    let btnId = 'btn-' + activeTab;
    let btn = document.getElementById(btnId);
    if (btn) {
        switchTab(activeTab, btn);
    }

    // Inietta il link "Password dimenticata" sotto al pulsante di Login
    let loginBox = document.getElementById('login-box');
    if (loginBox && !document.getElementById('forgot-password-link')) {
        let forgotLink = document.createElement('div');
        forgotLink.id = 'forgot-password-link';
        forgotLink.className = 'toggle-auth';
        forgotLink.style.marginTop = '15px';
        forgotLink.innerText = 'Forgot Password?';
        forgotLink.onclick = eseguiForgotPassword;
        loginBox.appendChild(forgotLink);
    }
};

const formatEuro = (num) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(num);

// --- LOGICA AUTH E PORTAFOGLI ---
function toggleAuthMode() {
    let loginBox = document.getElementById('login-box');
    let registerBox = document.getElementById('register-box');
    if (loginBox.style.display === 'none') {
        loginBox.style.display = 'block';
        registerBox.style.display = 'none';
    } else {
        loginBox.style.display = 'none';
        registerBox.style.display = 'block';
    }
}

function togglePasswordVisibility(inputId, iconElement) {
    let input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        iconElement.innerText = "🙈";
    } else {
        input.type = "password";
        iconElement.innerText = "👁️";
    }
}

async function checkAuth() {
    try {
        let res = await fetch('/api/auth/me');
        if (res.ok) {
            let user = await res.json();
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('user-display').innerText = user.username;
            
            await Promise.all([
                caricaImpostazioniExchange(),
                caricaPortafogli(),
                caricaWallets(),
                caricaBills(),
                caricaGarages()
            ]);
        } else {
            document.getElementById('auth-screen').style.display = 'flex';
        }
    } catch (e) { console.error("Auth check err:", e); }
}

// --- IMPOSTAZIONI EXCHANGE DI DEFAULT ---
async function caricaImpostazioniExchange() {
    try {
        let res = await fetch('/api/settings/exchange');
        if (res.ok) {
            let data = await res.json();
            let sel = document.getElementById('select-default-exchange');
            if (sel && data.exchange) sel.value = data.exchange;
        }
    } catch (e) { console.warn('Impossibile caricare impostazioni exchange:', e); }
}

async function cambiaExchangeDefault(exchange) {
    try {
        let res = await fetch('/api/settings/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exchange: exchange })
        });
        if (res.ok) {
            // Svuota il ticker già risolto nel form (ora obsoleto col nuovo exchange)
            let overrideInput = document.getElementById('ticker_override');
            if (overrideInput) { overrideInput.value = ''; }
            // Ri-risolvi l'ISIN corrente col nuovo exchange, se presente
            let isinInput = document.getElementById('asset_name');
            if (isinInput && isinInput.value.trim()) onIsinInput(isinInput.value.trim());
        }
    } catch (e) { console.error('Errore salvataggio exchange:', e); }
}

// --- RISOLUZIONE ISIN IN TEMPO REALE ---
let _isinDebounceTimer = null;
function onIsinInput(val) {
    clearTimeout(_isinDebounceTimer);
    let isin = val.trim().toUpperCase();
    let group = document.getElementById('ticker-override-group');
    let status = document.getElementById('ticker-resolve-status');
    let overrideInput = document.getElementById('ticker_override');
    if (!group || !status || !overrideInput) return;

    // Mostra il campo solo per ISIN validi non italiani
    let isValidIsin = /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) && !isin.startsWith('IT');
    if (!isValidIsin) {
        group.style.display = 'none';
        overrideInput.value = '';
        return;
    }
    group.style.display = 'block';
    overrideInput.value = '';
    status.textContent = '⏳ Risoluzione...';
    status.style.color = '#6c757d';

    _isinDebounceTimer = setTimeout(async () => {
        try {
            let res = await fetch('/api/resolve_ticker?isin=' + encodeURIComponent(isin));
            if (res.ok) {
                let data = await res.json();
                overrideInput.value = data.ticker;
                if (data.ticker !== isin) {
                    status.textContent = '✅ Trovato';
                    status.style.color = '#28a745';
                } else {
                    status.textContent = '⚠️ Non trovato';
                    status.style.color = '#ffc107';
                }
            }
        } catch (e) {
            status.textContent = '❌ Errore';
            status.style.color = '#dc3545';
        }
    }, 600); // debounce 600ms
}

function handleLoginKeyPress(event) {
    if (event.key === 'Enter') {
        eseguiLogin();
    }
}

function handleRegisterKeyPress(event) {
    if (event.key === 'Enter') {
        eseguiRegistrazione();
    }
}

async function eseguiLogin() {
    let u = document.getElementById('login-email').value;
    let p = document.getElementById('login-password').value;
    let res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    if (res.ok) { checkAuth(); } else { let err = await res.json(); alert(err.errore); }
}

async function eseguiRegistrazione() {
    let u = document.getElementById('register-email').value;
    let p = document.getElementById('register-password').value;
    let pConfirm = document.getElementById('register-password-confirm').value;
    if (!u || !p) { alert("Complete all fields"); return; }
    if (p !== pConfirm) { alert("Passwords do not match!"); return; }
    if (!u.includes('@')) { alert("Please enter a valid email address as username."); return; }
    let res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    if (res.ok) { alert("Registration completed! Now log in."); toggleAuthMode(); }
    else { let err = await res.json(); alert(err.errore); }
}

async function eseguiForgotPassword() {
    let email = prompt("Enter the email address associated with your account to receive a reset link:");
    if (email && email.includes('@')) {
        let res = await fetch('/api/auth/forgot_password', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: email })
        });
        let data = await res.json();
        alert(data.messaggio || data.errore);
    } else if (email) {
        alert("Please enter a valid email.");
    }
}

async function eseguiLogout() {
    localStorage.removeItem('activePortfolioId');
    localStorage.removeItem('activeWalletId');
    localStorage.removeItem('activeBillsId');
    localStorage.removeItem('activeGarageId');
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
}

async function ricaricaDatiInvestimenti() {
    // 1. Resetta lo stato dei dati globali e dei filtri di investimenti
    datiStoriciGlobal = null;
    activeTickers = [];

    // 2. Distruggi le istanze dei grafici di investimenti
    if (mioGrafico) { mioGrafico.destroy(); mioGrafico = null; }
    if (graficoAssetTypeObj) { graficoAssetTypeObj.destroy(); graficoAssetTypeObj = null; }
    if (graficoAndamentoLinee) { graficoAndamentoLinee.destroy(); graficoAndamentoLinee = null; }
    if (graficoAnniObj) { graficoAnniObj.destroy(); graficoAnniObj = null; }
    if (graficoDDObj) { graficoDDObj.destroy(); graficoDDObj = null; }
    if (graficoBenchmarkObj) { graficoBenchmarkObj.destroy(); graficoBenchmarkObj = null; }

    // Mostra caricamento
    document.getElementById('graficoAndamento').style.display = 'none';
    document.getElementById('loading-grafico').style.display = 'block';
    const isIt = document.documentElement.lang === 'it';
    document.getElementById('loading-grafico').innerText = isIt ? "Ricaricando dati investimenti..." : "Reloading investments data...";

    // Svuota tabelle e KPI
    document.getElementById("corpo-tabella-pmc").innerHTML = `<tr><td colspan="8" style="text-align:center;">${window.Translations.loading || 'Loading...'}</td></tr>`;
    document.getElementById("piede-tabella-pmc").innerHTML = '';
    document.getElementById("corpo-tabella").innerHTML = `<tr><td colspan="9" style="text-align:center;">${window.Translations.loading || 'Loading...'}</td></tr>`;
    document.getElementById("kpi-valore").innerText = "...";
    document.getElementById("kpi-investito").innerText = "...";
    document.getElementById("kpi-guadagno").innerText = "...";
    document.getElementById("kpi-rendimento").innerText = "...";
    document.getElementById("kpi-annualizzato").innerText = "...";
    document.getElementById("kpi-dividendi").innerText = "...";
    document.getElementById("kpi-volatilita").innerText = "...";
    document.getElementById("kpi-sharpe").innerText = "...";
    document.getElementById("kpi-tassa-gain").innerText = "...";

    try {
        await caricaDati();
    } catch (error) {
        console.error("Errore ricaricamento investimenti:", error);
        alert("An error occurred while reloading investments data.");
        document.getElementById('loading-grafico').innerText = "Error loading data.";
    }
}

async function caricaPortafogli(selezionaId = null) {
    let res = await fetch('/api/portfolios');
    let portafogli = await res.json();
    let sel = document.getElementById('select-portafoglio');
    if (!sel) return;
    sel.innerHTML = '';
    portafogli.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = p.name;
        sel.appendChild(opt);
    });
    if (portafogli.length > 0) {
        let savedId = localStorage.getItem('activePortfolioId');

        if (selezionaId && portafogli.find(p => p.id == selezionaId)) {
            activePortfolioId = selezionaId;
        } else if (!activePortfolioId && savedId && portafogli.find(p => p.id == savedId)) {
            activePortfolioId = savedId;
        } else if (!activePortfolioId || !portafogli.find(p => p.id == activePortfolioId)) {
            activePortfolioId = portafogli[0].id;
        }
        localStorage.setItem('activePortfolioId', activePortfolioId);
        sel.value = activePortfolioId;
        await ricaricaDatiInvestimenti();
    } else {
        let resNuovo = await fetch('/api/portfolios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Main Portfolio' }) });
        if (resNuovo.ok) caricaPortafogli();
    }
}

function cambiaPortafoglio() {
    activePortfolioId = document.getElementById('select-portafoglio').value;
    localStorage.setItem('activePortfolioId', activePortfolioId);
    ricaricaDatiInvestimenti();
}

async function nuovoPortafoglio() {
    let nome = prompt("New portfolio name:");
    if (nome && nome.trim() !== "") {
        let res = await fetch('/api/portfolios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome.trim() }) });
        if (res.ok) {
            let created = await res.json();
            await caricaPortafogli(created.id);
        }
    }
}

async function rinominaPortafoglio() {
    if (!activePortfolioId) return;

    const sel = document.getElementById('select-portafoglio');
    const currentName = sel.options[sel.selectedIndex].text;

    const nuovoNome = prompt("Enter the new portfolio name:", currentName);

    if (nuovoNome && nuovoNome.trim() !== "" && nuovoNome.trim() !== currentName) {
        try {
            const res = await fetch(`/api/portfolios/${activePortfolioId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nuovoNome.trim() })
            });

            if (res.ok) {
                const currentId = activePortfolioId;
                await caricaPortafogli(currentId);
            } else {
                const err = await res.json();
                alert("Error: " + err.errore);
            }
        } catch (e) {
            alert("Connection error while trying to rename the portfolio.");
        }
    }
}

async function eliminaPortafoglio() {
    if (!activePortfolioId) return;

    const sel = document.getElementById('select-portafoglio');
    const currentName = sel.options[sel.selectedIndex].text;

    let conferma = confirm(`WARNING! Are you sure you want to delete the portfolio "${currentName}" and ALL its transactions?\n\nThis action cannot be undone.`);
    if (conferma) {
        try {
            const res = await fetch(`/api/portfolios/${activePortfolioId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                alert("Portfolio successfully deleted.");
                activePortfolioId = null; // Resettiamo per forzare la selezione automatica del primo portafoglio in lista
                localStorage.removeItem('activePortfolioId');
                // Se eliminiamo tutti i portafogli, la funzione caricaPortafogli ne creerà automaticamente uno nuovo "Principale"
                await caricaPortafogli();
            } else {
                let err = await res.json();
                alert("Error: " + err.errore);
            }
        } catch (e) {
            alert("Connection error while trying to delete the portfolio.");
        }
    }
}

// --- GESTIONE WALLETS ---
async function caricaWallets(selezionaId = null) {
    let res = await fetch('/api/wallets');
    let wallets = await res.json();
    let sel = document.getElementById('select-wallet');
    if (!sel) return;
    sel.innerHTML = '';
    wallets.forEach(w => {
        let opt = document.createElement('option');
        opt.value = w.id;
        opt.innerText = w.name;
        sel.appendChild(opt);
    });
    if (wallets.length > 0) {
        let savedId = localStorage.getItem('activeWalletId');

        if (selezionaId && wallets.find(w => w.id == selezionaId)) {
            activeWalletId = selezionaId;
        } else if (!activeWalletId && savedId && wallets.find(w => w.id == savedId)) {
            activeWalletId = savedId;
        } else if (!activeWalletId || !wallets.find(w => w.id == activeWalletId)) {
            activeWalletId = wallets[0].id;
        }
        localStorage.setItem('activeWalletId', activeWalletId);
        sel.value = activeWalletId;
        await caricaDatiWallet();
    } else {
        let resNuovo = await fetch('/api/wallets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Main Wallet' }) });
        if (resNuovo.ok) caricaWallets();
    }
}

function cambiaWallet() {
    let sel = document.getElementById('select-wallet');
    if (!sel) return;
    activeWalletId = sel.value;
    localStorage.setItem('activeWalletId', activeWalletId);
    caricaDatiWallet();
}

async function nuovoWallet() {
    let nome = prompt("New wallet name:");
    if (nome && nome.trim() !== "") {
        let res = await fetch('/api/wallets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome.trim() }) });
        if (res.ok) {
            let created = await res.json();
            await caricaWallets(created.id);
        }
    }
}

async function rinominaWallet() {
    if (!activeWalletId) return;
    const sel = document.getElementById('select-wallet');
    if (!sel) return;
    const currentName = sel.options[sel.selectedIndex].text;
    const nuovoNome = prompt("Enter the new wallet name:", currentName);
    if (nuovoNome && nuovoNome.trim() !== "" && nuovoNome.trim() !== currentName) {
        try {
            const res = await fetch(`/api/wallets/${activeWalletId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nuovoNome.trim() })
            });
            if (res.ok) {
                const currentId = activeWalletId;
                await caricaWallets(currentId);
            } else {
                const err = await res.json();
                alert("Error: " + err.errore);
            }
        } catch (e) {
            alert("Connection error while trying to rename the wallet.");
        }
    }
}

async function eliminaWallet() {
    if (!activeWalletId) return;
    const sel = document.getElementById('select-wallet');
    if (!sel) return;
    const currentName = sel.options[sel.selectedIndex].text;
    let conferma = confirm(`WARNING! Are you sure you want to delete the wallet "${currentName}" and ALL its transactions?\n\nThis action cannot be undone.`);
    if (conferma) {
        try {
            const res = await fetch(`/api/wallets/${activeWalletId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                alert("Wallet successfully deleted.");
                activeWalletId = null;
                localStorage.removeItem('activeWalletId');
                await caricaWallets();
            } else {
                let err = await res.json();
                alert("Error: " + err.errore);
            }
        } catch (e) {
            alert("Connection error while trying to delete the wallet.");
        }
    }
}

// --- GESTIONE BILLS PROFILES ---
async function caricaBills(selezionaId = null) {
    let res = await fetch('/api/bills_profiles');
    let profiles = await res.json();
    let sel = document.getElementById('select-bills');
    if (!sel) return;
    sel.innerHTML = '';
    profiles.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = p.name;
        sel.appendChild(opt);
    });
    if (profiles.length > 0) {
        let savedId = localStorage.getItem('activeBillsId');

        if (selezionaId && profiles.find(p => p.id == selezionaId)) {
            activeBillsId = selezionaId;
        } else if (!activeBillsId && savedId && profiles.find(p => p.id == savedId)) {
            activeBillsId = savedId;
        } else if (!activeBillsId || !profiles.find(p => p.id == activeBillsId)) {
            activeBillsId = profiles[0].id;
        }
        localStorage.setItem('activeBillsId', activeBillsId);
        sel.value = activeBillsId;
        await caricaDatiBollette();
    } else {
        let resNuovo = await fetch('/api/bills_profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Main Bills Profile' }) });
        if (resNuovo.ok) caricaBills();
    }
}

function cambiaBills() {
    let sel = document.getElementById('select-bills');
    if (!sel) return;
    activeBillsId = sel.value;
    localStorage.setItem('activeBillsId', activeBillsId);
    caricaDatiBollette();
}

async function nuovoBills() {
    let nome = prompt("New bills group name:");
    if (nome && nome.trim() !== "") {
        let res = await fetch('/api/bills_profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome.trim() }) });
        if (res.ok) {
            let created = await res.json();
            await caricaBills(created.id);
        }
    }
}

async function rinominaBills() {
    if (!activeBillsId) return;
    const sel = document.getElementById('select-bills');
    if (!sel) return;
    const currentName = sel.options[sel.selectedIndex].text;
    const nuovoNome = prompt("Enter the new bills group name:", currentName);
    if (nuovoNome && nuovoNome.trim() !== "" && nuovoNome.trim() !== currentName) {
        try {
            const res = await fetch(`/api/bills_profiles/${activeBillsId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nuovoNome.trim() })
            });
            if (res.ok) {
                const currentId = activeBillsId;
                await caricaBills(currentId);
            } else {
                const err = await res.json();
                alert("Error: " + err.errore);
            }
        } catch (e) {
            alert("Connection error while trying to rename the bills group.");
        }
    }
}

async function eliminaBills() {
    if (!activeBillsId) return;
    const sel = document.getElementById('select-bills');
    if (!sel) return;
    const currentName = sel.options[sel.selectedIndex].text;
    let conferma = confirm(`WARNING! Are you sure you want to delete the bills group "${currentName}" and ALL its data?\n\nThis action cannot be undone.`);
    if (conferma) {
        try {
            const res = await fetch(`/api/bills_profiles/${activeBillsId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                alert("Bills group successfully deleted.");
                activeBillsId = null;
                localStorage.removeItem('activeBillsId');
                await caricaBills();
            } else {
                let err = await res.json();
                alert("Error: " + err.errore);
            }
        } catch (e) {
            alert("Connection error while trying to delete the bills group.");
        }
    }
}

// --- GESTIONE GARAGES (VEICOLI) ---
async function caricaGarages(selezionaId = null) {
    let res = await fetch('/api/garages');
    let garages = await res.json();
    let sel = document.getElementById('select-garage');
    if (!sel) return;
    sel.innerHTML = '';
    garages.forEach(g => {
        let opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.name;
        sel.appendChild(opt);
    });
    if (garages.length > 0) {
        let savedId = localStorage.getItem('activeGarageId');

        if (selezionaId && garages.find(g => g.id == selezionaId)) {
            activeGarageId = selezionaId;
        } else if (!activeGarageId && savedId && garages.find(g => g.id == savedId)) {
            activeGarageId = savedId;
        } else if (!activeGarageId || !garages.find(g => g.id == activeGarageId)) {
            activeGarageId = garages[0].id;
        }
        localStorage.setItem('activeGarageId', activeGarageId);
        sel.value = activeGarageId;
        if (typeof window.caricaDatiVeicoli === 'function') {
            await window.caricaDatiVeicoli();
        }
    } else {
        let resNuovo = await fetch('/api/garages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Main Garage' }) });
        if (resNuovo.ok) caricaGarages();
    }
}

function cambiaGarage() {
    let sel = document.getElementById('select-garage');
    if (!sel) return;
    activeGarageId = sel.value;
    localStorage.setItem('activeGarageId', activeGarageId);
    if (typeof window.caricaDatiVeicoli === 'function') {
        window.caricaDatiVeicoli();
    }
}

async function nuovoGarage() {
    let nome = prompt("New garage name:");
    if (nome && nome.trim() !== "") {
        let res = await fetch('/api/garages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome.trim() }) });
        if (res.ok) {
            let created = await res.json();
            await caricaGarages(created.id);
        }
    }
}

async function rinominaGarage() {
    if (!activeGarageId) return;
    const sel = document.getElementById('select-garage');
    if (!sel) return;
    const currentName = sel.options[sel.selectedIndex].text;
    const nuovoNome = prompt("Enter the new garage name:", currentName);
    if (nuovoNome && nuovoNome.trim() !== "" && nuovoNome.trim() !== currentName) {
        try {
            const res = await fetch(`/api/garages/${activeGarageId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nuovoNome.trim() })
            });
            if (res.ok) {
                const currentId = activeGarageId;
                await caricaGarages(currentId);
            } else {
                const err = await res.json();
                alert("Error: " + err.errore);
            }
        } catch (e) {
            alert("Connection error while trying to rename the garage.");
        }
    }
}

async function eliminaGarage() {
    if (!activeGarageId) return;
    const sel = document.getElementById('select-garage');
    if (!sel) return;
    const currentName = sel.options[sel.selectedIndex].text;
    let conferma = confirm(`WARNING! Are you sure you want to delete the garage "${currentName}" and ALL its data?\n\nThis action cannot be undone.`);
    if (conferma) {
        try {
            const res = await fetch(`/api/garages/${activeGarageId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                alert("Garage successfully deleted.");
                activeGarageId = null;
                localStorage.removeItem('activeGarageId');
                await caricaGarages();
            } else {
                let err = await res.json();
                alert("Error: " + err.errore);
            }
        } catch (e) {
            alert("Connection error while trying to delete the garage.");
        }
    }
}

async function cambiaLingua(lang) {
    try {
        let res = await fetch('/api/set_language', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang })
        });
        if (res.ok) {
            window.location.reload(); // Ricarica la pagina per applicare la nuova lingua
        }
    } catch (e) { console.error("Errore cambio lingua:", e); }
}

// Imposta i listener per i pulsanti dei filtri (Periodo e Metrica)
function setupFiltriAndamento() {
    document.querySelectorAll('#filter-periodo .btn-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#filter-periodo .btn-filter').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentPeriodoAndamento = e.target.innerText.trim();
            aggiornaGraficoAndamento();
        });
    });

    document.querySelectorAll('#filter-metrica .btn-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#filter-metrica .btn-filter').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentMetricaAndamento = e.target.innerText.trim();
            aggiornaGraficoAndamento();
        });
    });

    document.getElementById('btn-toggle-dividendi').addEventListener('click', (e) => {
        mostraDividendi = !mostraDividendi;
        if (mostraDividendi) {
            e.target.classList.add('active');
        } else {
            e.target.classList.remove('active');
        }
        aggiornaGraficoAndamento();
    });
}

// Funzione per il calcolo di Volatilità e Sharpe Ratio
function calcolaVolatilitaESharpe(valori, investito) {
    if (!valori || !investito || valori.length < 2) {
        return { volatilita: 0, sharpe: 0 };
    }

    let dailyReturns = [];
    for (let i = 1; i < valori.length; i++) {
        let v_prev = valori[i - 1];
        let inv_prev = investito[i - 1];
        let cash_flow_oggi = investito[i] - inv_prev;
        let base_calcolo = v_prev + cash_flow_oggi;

        let r = 0;
        if (base_calcolo > 0) {
            r = (valori[i] - base_calcolo) / base_calcolo;
        }
        dailyReturns.push(r);
    }

    if (dailyReturns.length === 0) return { volatilita: 0, sharpe: 0 };

    let sum = 0;
    for (let i = 0; i < dailyReturns.length; i++) sum += dailyReturns[i];
    let mean = sum / dailyReturns.length;

    let sumSq = 0;
    for (let i = 0; i < dailyReturns.length; i++) {
        sumSq += Math.pow(dailyReturns[i] - mean, 2);
    }

    let variance = sumSq / (dailyReturns.length - 1 || 1);
    let stdDev = Math.sqrt(variance);
    // I dati arrivano con una cadenza di 365 giorni solari all'anno a causa del fill dei weekend
    let volatilita = stdDev * Math.sqrt(365);
    let sharpe = volatilita > 0 ? (mean * 365) / volatilita : 0;
    return { volatilita: volatilita, sharpe: sharpe };
}

// Chiamata al server Python per il prezzo in tempo reale
async function ottieniPrezzoMercato(ticker) {
    try {
        let risposta = await fetch(`/api/prezzo/${encodeURIComponent(ticker)}`);
        if (risposta.ok) {
            let data = await risposta.json();
            return { prezzo: data.prezzo, data: data.data };
        }
    } catch (error) {
        console.error(`Errore di connessione al server per il ticker ${ticker}:`, error);
    }
    return { prezzo: null, data: null };
}

// Funzione per aggiornare le statistiche basate sul periodo selezionato col mouse
function aggiornaStatsSelezione(chart) {
    let xScale = chart.scales.x;
    let minIndex = Math.max(0, Math.floor(xScale.min));
    let maxIndex = Math.min(chart.data.labels.length - 1, Math.ceil(xScale.max));

    // Se non c'è zoom o c'è un solo punto visibile, nascondi le stats
    if (maxIndex <= minIndex || (minIndex === 0 && maxIndex === chart.data.labels.length - 1)) {
        document.getElementById('selection-stats').style.display = 'none';
        return;
    }

    let vSlice = window.currentValoriSlice;
    let invSlice = window.currentInvestitoSlice;
    let divSlice = window.currentDividendiSlice;
    let dSlice = window.currentDateSlice;

    if (!vSlice || !invSlice) return;

    // Tagliamo i dati in base all'area visualizzata
    let subValori = vSlice.slice(minIndex, maxIndex + 1);
    let subInvestito = invSlice.slice(minIndex, maxIndex + 1);
    let subDividendi = divSlice.slice(minIndex, maxIndex + 1);
    let subDate = dSlice.slice(minIndex, maxIndex + 1);

    // Calcolo TWR specifico per il sottoperiodo
    let fattoreCumulativo = 1.0;

    for (let i = 1; i < subValori.length; i++) {
        let v_prev = subValori[i - 1];
        let inv_prev = subInvestito[i - 1];
        let cash_flow_oggi = subInvestito[i] - inv_prev;

        let base_calcolo = v_prev + cash_flow_oggi;

        if (mostraDividendi) {
            let div_prev = subDividendi[i - 1] || 0;
            let div_oggi = subDividendi[i] || 0;
            base_calcolo = (v_prev + div_prev) + cash_flow_oggi;
            if (base_calcolo > 0) {
                fattoreCumulativo *= (1 + ((subValori[i] + div_oggi) - base_calcolo) / base_calcolo);
            }
        } else {
            if (base_calcolo > 0) {
                fattoreCumulativo *= (1 + (subValori[i] - base_calcolo) / base_calcolo);
            }
        }
    }

    let rendimentoPeriodo = (fattoreCumulativo - 1) * 100;
    let dataInizio = new Date(subDate[0]);
    let dataFine = new Date(subDate[subDate.length - 1]);
    let anniTrascorsi = (dataFine - dataInizio) / (1000 * 60 * 60 * 24 * 365.25);

    let cagr = 0;
    if (anniTrascorsi > 0 && fattoreCumulativo > 0) {
        cagr = (Math.pow(fattoreCumulativo, 1 / anniTrascorsi) - 1) * 100;
    }

    // Visualizzazione sul box informativo
    let formattaData = (dStr) => { let p = dStr.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dStr; };
    document.getElementById('sel-period').innerText = `${formattaData(subDate[0])} ➔ ${formattaData(subDate[subDate.length - 1])}`;

    let spanRendimento = document.getElementById('sel-rendimento');
    spanRendimento.innerText = (rendimentoPeriodo > 0 ? '+' : '') + rendimentoPeriodo.toFixed(2) + '%';
    spanRendimento.style.color = rendimentoPeriodo >= 0 ? '#28a745' : '#dc3545';

    let spanCagr = document.getElementById('sel-cagr');
    if (anniTrascorsi >= 1) {
        spanCagr.innerText = (cagr > 0 ? '+' : '') + cagr.toFixed(2) + '%';
        spanCagr.style.color = cagr >= 0 ? '#28a745' : '#dc3545';
    } else {
        spanCagr.innerText = "N/A (< 1 anno)";
        spanCagr.style.color = '#6c757d';
    }

    document.getElementById('selection-stats').style.display = 'block';
}

function resetZoomAndamento() {
    if (graficoAndamentoLinee) {
        graficoAndamentoLinee.resetZoom();
        document.getElementById('selection-stats').style.display = 'none';
    }
}

// 1. CARICAMENTO DATI
async function caricaDati() {
    try {
        let activeTab = localStorage.getItem('activeTab') || 'tab-investimenti';
        if (activeTab !== 'tab-investimenti') return;

        if (!activePortfolioId) return;

        let risposta = await fetch('/api/transactions?portfolio_id=' + activePortfolioId);
        let listaTransazioni = await risposta.json();

        // Salviamo le transazioni per poterle impaginare
        transazioniValideInvestimenti = listaTransazioni;
        renderTabellaInvestimenti();

        // Chiamata asincrona per aggiornare cruscotto e grafici
        aggiornaDashboard(listaTransazioni);

    } catch (error) {
        console.error("Errore nel caricamento:", error);
    }
}

// 2. AGGIORNAMENTO DASHBOARD E PREZZI REALI
async function aggiornaDashboard(transazioni) {
    let isIt = document.documentElement.lang === 'it';

    document.getElementById("kpi-valore").innerText = isIt ? "Aggiornamento live..." : "Live update...";

    let portafoglio = {};
    let totaleDividendi = 0;

    // Variabili per calcolo ritorno annualizzato
    let dataPrimaTransazione = transazioni.length > 0 ? new Date(transazioni.sort((a, b) => new Date(a.date) - new Date(b.date))[0].date) : new Date();

    // Calcolo Costo e Quote, e mappa da ISIN a Ticker
    let isinToTickerMap = {};
    transazioni.forEach(t => {
        let isin = t.asset_name.trim().toUpperCase();

        if (!portafoglio[isin]) {
            portafoglio[isin] = { quote: 0, costoTotale: 0 };
            isinToTickerMap[isin] = t.ticker.trim().toUpperCase();
        }

        if (t.operation_type === "Buy" || t.operation_type === "Acquisto") {
            portafoglio[isin].costoTotale += t.total_value;
            portafoglio[isin].quote += t.quantity;
        } else if (t.operation_type === "Sell" || t.operation_type === "Vendita") {
            if (portafoglio[isin].quote > 0) {
                let pmc = portafoglio[isin].costoTotale / portafoglio[isin].quote;
                portafoglio[isin].quote -= t.quantity;
                portafoglio[isin].costoTotale = portafoglio[isin].quote * pmc;
            }
        } else if (t.operation_type === "Dividend" || t.operation_type === "Dividendo") {
            totaleDividendi += t.total_value;
        }
    });

    let valoreAttualePortafoglio = 0;
    let capitaleInvestitoNetto = 0;
    let portafoglioValoriETF = {};
    let totalCapitalGainTax = 0;

    // Creiamo una mappa da Ticker a Tipo Asset, usando l'ultima transazione per definire il tipo
    let tickerToAssetType = {};
    transazioni.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
        // L'ultima transazione per un ISIN (nomeEtf) ne definisce il tipo
        tickerToAssetType[t.asset_name.trim().toUpperCase()] = t.asset_type || 'Undefined';
    });

    // Variabili per la nuova Tabella PMC
    let tbodyPmc = document.getElementById("corpo-tabella-pmc");
    let htmlRighePmc = "";
    let totaleQuoteComplessive = 0;
    let erroriPrezzoLive = [];

    // Recupero prezzi LIVE, Calcolo Valori e Costruzione Tabella PMC
    for (let isin in portafoglio) {
        let pos = portafoglio[isin];
        if (pos.quote <= 0) continue;

        capitaleInvestitoNetto += pos.costoTotale;
        totaleQuoteComplessive += pos.quote;

        let fetchTicker = isinToTickerMap[isin];
        let infoPrezzo = await ottieniPrezzoMercato(fetchTicker);
        let prezzoReale = infoPrezzo.prezzo;
        let dataPrezzo = infoPrezzo.data;

        let valorePosizione = 0;
        let pmcPosizione = pos.costoTotale / pos.quote;
        let prezzoAttualeVisivo = pmcPosizione;

        if (prezzoReale !== null) {
            prezzoAttualeVisivo = prezzoReale;
            valorePosizione = prezzoReale * pos.quote;
        } else {
            valorePosizione = pos.costoTotale;
            erroriPrezzoLive.push(fetchTicker);
        }

        valoreAttualePortafoglio += valorePosizione;
        portafoglioValoriETF[isin] = valorePosizione;

        // --- CALCOLO TASSA CAPITAL GAIN ---
        let capitalGainPosizione = valorePosizione - pos.costoTotale;
        if (capitalGainPosizione > 0) {
            const isBTP = isin.startsWith('IT') && /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin);
            const isObbligazione = tickerToAssetType[isin] === 'Obbligazioni Singole';
            const taxRate = (isBTP || isObbligazione) ? 0.125 : 0.26;
            totalCapitalGainTax += capitalGainPosizione * taxRate;
        }

        // Generazione riga per Tabella PMC
        let rendimentoETF = pos.costoTotale > 0 ? ((valorePosizione - pos.costoTotale) / pos.costoTotale) * 100 : 0;

        let today = new Date();
        let todayYMD = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

        let dataVisualizzata = "-";
        let avvisoIcona = "";

        if (dataPrezzo) {
            let parts = dataPrezzo.split('-');
            if (parts.length === 3) {
                dataVisualizzata = `${parts[2]}/${parts[1]}/${parts[0]}`;
            } else {
                dataVisualizzata = dataPrezzo;
            }

            if (dataPrezzo !== todayYMD) {
                avvisoIcona = `<span title="Attenzione: l'ultimo prezzo disponibile non è di oggi" style="color: #ffc107; margin-left: 5px;">⚠️</span>`;
            }
        }

        htmlRighePmc += `
                    <tr>
                        <td><strong>${fetchTicker}</strong></td>
                        <td>${formatEuro(pmcPosizione)}</td>
                        <td>${pos.quote.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                        <td>${formatEuro(pos.costoTotale)}</td>
                        <td>${formatEuro(prezzoAttualeVisivo)}</td>
                        <td>${dataVisualizzata}${avvisoIcona}</td>
                        <td>${formatEuro(valorePosizione)}</td>
                        <td style="color: ${rendimentoETF >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">
                            ${rendimentoETF > 0 ? '+' : ''}${rendimentoETF.toFixed(2)}%
                        </td>
                    </tr>
                `;
    }

    // Calcoli finali globali
    let capitalGain = valoreAttualePortafoglio - capitaleInvestitoNetto;
    let guadagnoTotale = capitalGain + totaleDividendi;
    let rendimentoReale = capitaleInvestitoNetto > 0 ? (capitalGain / capitaleInvestitoNetto) * 100 : 0;

    // Calcolo CAGR reale (Ritorno Annualizzato)
    let anniTrascorsi = (new Date() - dataPrimaTransazione) / (1000 * 60 * 60 * 24 * 365.25);
    let ritornoAnnualizzatoReale = rendimentoReale; // Fallback
    if (anniTrascorsi > 0 && capitaleInvestitoNetto > 0) {
        // Formula CAGR
        ritornoAnnualizzatoReale = (Math.pow((valoreAttualePortafoglio + totaleDividendi) / capitaleInvestitoNetto, 1 / anniTrascorsi) - 1) * 100;
    }

    // Aggiornamento Tabella PMC - Totali
    if (htmlRighePmc === "") {
        htmlRighePmc = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">${window.Translations.noAssetsInPortfolio || 'No assets in portfolio.'}</td></tr>`;
    }
    tbodyPmc.innerHTML = htmlRighePmc;
    let pmcTotaleGlobale = totaleQuoteComplessive > 0 ? capitaleInvestitoNetto / totaleQuoteComplessive : 0;

    document.getElementById("piede-tabella-pmc").innerHTML = `
                <tr>
                    <td><strong>${isIt ? 'TOTALE' : 'TOTAL'}</strong></td>
                    <td><strong>${formatEuro(pmcTotaleGlobale)}</strong></td>
                    <td><strong>${totaleQuoteComplessive.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong></td>
                    <td><strong>${formatEuro(capitaleInvestitoNetto)}</strong></td>
                    <td></td>
                    <td></td>
                    <td><strong>${formatEuro(valoreAttualePortafoglio)}</strong></td>
                    <td style="color: ${rendimentoReale >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">
                        ${rendimentoReale > 0 ? '+' : ''}${rendimentoReale.toFixed(2)}%
                    </td>
                </tr>
            `;

    // Aggiornamento interfaccia KPI Dashboard
    let segnoRend = rendimentoReale >= 0 ? "+" : "";
    let coloreClasse = rendimentoReale >= 0 ? "kpi-verde" : "kpi-rosso";
    if (rendimentoReale === 0) coloreClasse = "kpi-neutro";

    let lblRendimento = document.getElementById("kpi-rendimento");
    lblRendimento.innerText = segnoRend + rendimentoReale.toFixed(2) + "%";
    lblRendimento.className = "kpi-valore " + coloreClasse;

    let lblAnnualizzato = document.getElementById("kpi-annualizzato");
    lblAnnualizzato.innerText = (ritornoAnnualizzatoReale >= 0 ? "+" : "") + ritornoAnnualizzatoReale.toFixed(2) + "%";
    lblAnnualizzato.className = "kpi-valore " + (ritornoAnnualizzatoReale >= 0 ? "kpi-verde" : "kpi-rosso");

    document.getElementById("kpi-investito").innerText = formatEuro(capitaleInvestitoNetto);
    document.getElementById("kpi-valore").innerText = formatEuro(valoreAttualePortafoglio);

    let lblGuadagno = document.getElementById("kpi-guadagno");
    let segnoGuadagno = guadagnoTotale >= 0 ? "+" : "-";
    lblGuadagno.innerText = segnoGuadagno + formatEuro(Math.abs(guadagnoTotale));
    lblGuadagno.className = "kpi-valore " + (guadagnoTotale >= 0 ? "kpi-verde" : "kpi-rosso");

    document.getElementById("kpi-dividendi").innerText = formatEuro(totaleDividendi);
    document.getElementById("kpi-tassa-gain").innerText = formatEuro(totalCapitalGainTax);

    // Raggruppiamo i valori per tipo di asset per il nuovo grafico
    let assetTypeValues = {};
    for (const isin in portafoglioValoriETF) {
        const value = portafoglioValoriETF[isin];
        let assetType = tickerToAssetType[isin] || 'Non Definito';

        if (!isIt) {
            if (assetType === 'Azioni singole' || assetType === 'Single Stocks') assetType = 'Single Stocks';
            else if (assetType === 'Obbligazioni Singole' || assetType === 'Single Bonds') assetType = 'Single Bonds';
            else if (assetType === 'Oro' || assetType === 'Gold') assetType = 'Gold';
            else if (assetType === 'Liquidità' || assetType === 'Cash') assetType = 'Cash';
            else if (assetType === 'Non Definito' || assetType === 'Undefined') assetType = 'Undefined';
        }

        if (!assetTypeValues[assetType]) {
            assetTypeValues[assetType] = 0;
        }
        assetTypeValues[assetType] += value;
    }

    // Raggruppiamo i valori per Ticker per il grafico a ciambella per maggiore leggibilità
    let portafoglioValoriTicker = {};
    for (const isin in portafoglioValoriETF) {
        const ticker = isinToTickerMap[isin] || isin;
        portafoglioValoriTicker[ticker] = portafoglioValoriETF[isin];
    }

    // Salvataggio snapshot per l'analisi AI
    window.portfolioSnapshot = {
        investito: formatEuro(capitaleInvestitoNetto),
        valore: formatEuro(valoreAttualePortafoglio),
        rendimento: rendimentoReale.toFixed(2),
        guadagno: formatEuro(guadagnoTotale),
        allocazione: Object.keys(portafoglioValoriTicker).map(t => `${t}: ${formatEuro(portafoglioValoriTicker[t])}`).join('\n')
    };

    disegnaGraficoCiambella(portafoglioValoriTicker);
    disegnaGraficoAssetType(assetTypeValues);

    // Disegno grafico storico scaricando i dati dal server Python
    await caricaDisegnaAndamentoReale(erroriPrezzoLive);
}

// 3. GRAFICO A CIAMBELLA
function disegnaGraficoCiambella(datiRaggruppati) {
    const etichetteBase = Object.keys(datiRaggruppati);
    const valori = Object.values(datiRaggruppati);
    const totale = valori.reduce((acc, val) => acc + val, 0);

    // Aggiungiamo la percentuale alle etichette per mostrarla nella legenda
    const etichette = etichetteBase.map((etichetta, indice) => {
        let percentuale = totale > 0 ? ((valori[indice] / totale) * 100).toFixed(1) : 0;
        return `${etichetta} (${percentuale}%)`;
    });

    const ctx = document.getElementById('graficoAllocazione').getContext('2d');

    if (mioGrafico !== null) mioGrafico.destroy();

    mioGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: etichette,
            datasets: [{
                data: valori,
                backgroundColor: ['#f8b4cb', '#8fd9c2', '#a3c2e0', '#f9c595', '#d4a5d9', '#f2db94'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            // Formattiamo anche il valore interno al tooltip in Euro
                            label += formatEuro(context.raw);
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// 3.1 GRAFICO A CIAMBELLA PER TIPO ASSET
function disegnaGraficoAssetType(datiRaggruppati) {
    let isIt = document.documentElement.lang === 'it';
    const etichetteBase = Object.keys(datiRaggruppati);
    const valori = Object.values(datiRaggruppati);
    const totale = valori.reduce((acc, val) => acc + val, 0);

    const etichette = etichetteBase.map((etichetta, indice) => {
        let percentuale = totale > 0 ? ((valori[indice] / totale) * 100).toFixed(1) : 0;
        return `${etichetta} (${percentuale}%)`;
    });

    const ctx = document.getElementById('graficoAssetType').getContext('2d');

    if (graficoAssetTypeObj !== null) graficoAssetTypeObj.destroy();

    graficoAssetTypeObj = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: etichette,
            datasets: [{
                label: isIt ? 'Allocazione per Tipo Asset' : 'Asset Type Allocation',
                data: valori,
                backgroundColor: ['#6f42c1', '#e83e8c', '#fd7e14', '#20c997', '#17a2b8', '#6610f2', '#ffc107'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.label.split(' (')[0] + ': ' + formatEuro(context.raw);
                        }
                    }
                }
            }
        }
    });
}

// 4. SCARICA DATI STORICI DA PYTHON
async function caricaDisegnaAndamentoReale() {
    try {
        let risposta = await fetch('/api/historical_performance?portfolio_id=' + activePortfolioId);

        if (risposta.ok) {
            datiStoriciGlobal = await risposta.json();

            document.getElementById('loading-grafico').style.display = 'none';
            document.getElementById('graficoAndamento').style.display = 'block';

            if (datiStoriciGlobal.date.length === 0) {
                datiStoriciGlobal.date = ["Oggi"];
                datiStoriciGlobal.investito = [0];
                datiStoriciGlobal.values = [0];
                datiStoriciGlobal.dividends = [0];
                datiStoriciGlobal.tickers = {};
            }

            // Calcolo Volatilità e Sharpe Ratio globali
            let metricheRischio = calcolaVolatilitaESharpe(datiStoriciGlobal.values, datiStoriciGlobal.invested);
            document.getElementById("kpi-volatilita").innerText = (metricheRischio.volatilita * 100).toFixed(2) + "%";
            let kpiSharpe = document.getElementById("kpi-sharpe");
            kpiSharpe.innerText = metricheRischio.sharpe.toFixed(2);
            if (metricheRischio.sharpe >= 1) kpiSharpe.className = "kpi-valore kpi-verde";
            else if (metricheRischio.sharpe >= 0) kpiSharpe.className = "kpi-valore kpi-neutro";
            else kpiSharpe.className = "kpi-valore kpi-rosso";

            // --- Generazione bottoni Ticker per il filtro dinamico ---
            let isinMap = datiStoriciGlobal.isin_map || {};
            let tickerContainer = document.getElementById('ticker-buttons-container');
            tickerContainer.innerHTML = '';
            if (datiStoriciGlobal.tickers) {
                activeTickers = Object.keys(datiStoriciGlobal.tickers); // Di base li selezioniamo tutti
                if (activeTickers.length > 0) {
                    document.getElementById('filter-ticker').style.display = 'flex';
                    activeTickers.forEach(isin => {
                        let btn = document.createElement('button');
                        btn.className = 'btn-filter active';
                        let ticker = isinMap[isin] || isin;
                        btn.innerText = ticker.toUpperCase();
                        btn.onclick = (e) => {
                            btn.classList.toggle('active');
                            if (btn.classList.contains('active')) activeTickers.push(isin);
                            else activeTickers = activeTickers.filter(t => t !== isin);
                            aggiornaGraficoAndamento();
                        };
                        tickerContainer.appendChild(btn);
                    });
                } else {
                    document.getElementById('filter-ticker').style.display = 'none';
                }
            }

            // Calcola e aggiorna il grafico in base ai filtri correnti
            aggiornaGraficoAndamento();
        }
    } catch (error) {
        console.error("Errore nel recupero storico:", error);
        document.getElementById('loading-grafico').innerText = "Errore nel caricamento dei dati storici.";
    }
}

// 5. CALCOLO METRICHE E AGGIORNAMENTO GRAFICO A LINEE
function aggiornaGraficoAndamento() {
    if (!datiStoriciGlobal || !datiStoriciGlobal.date || datiStoriciGlobal.date.length === 0) return;

    let dateAll = datiStoriciGlobal.date;

    // --- AGGREGAZIONE VALORI BASATA SUI TICKER SELEZIONATI ---
    let valoriAll = new Array(dateAll.length).fill(0);
    let investitoAll = new Array(dateAll.length).fill(0);
    let dividendiAll = new Array(dateAll.length).fill(0);

    if (datiStoriciGlobal.tickers && activeTickers.length > 0) {
        activeTickers.forEach(ticker => {
            if (datiStoriciGlobal.tickers[ticker]) {
                let dataTicker = datiStoriciGlobal.tickers[ticker];
                for (let i = 0; i < dateAll.length; i++) {
                    valoriAll[i] += dataTicker.values[i];
                    investitoAll[i] += dataTicker.invested[i];
                    if (dataTicker.dividends) {
                        dividendiAll[i] += dataTicker.dividends[i];
                    }
                }
            }
        });
    } else if (!datiStoriciGlobal.tickers) {
        // Fallback in caso di mancanza del campo JSON
        valoriAll = datiStoriciGlobal.values;
        investitoAll = datiStoriciGlobal.invested;
        if (datiStoriciGlobal.dividends) {
            dividendiAll = datiStoriciGlobal.dividends;
        }
    }

    // --- FILTRO: PERIODO ---
    let startIndex = 0;
    if (currentPeriodoAndamento !== 'All') {
        let dateOggi = new Date(dateAll[dateAll.length - 1]);
        let anniSottrazione = 0;
        let mesiSottrazione = 0;

        if (currentPeriodoAndamento === '5y') anniSottrazione = 5;
        else if (currentPeriodoAndamento === '2y') anniSottrazione = 2;
        else if (currentPeriodoAndamento === '1y') anniSottrazione = 1;
        else if (currentPeriodoAndamento === '6m') mesiSottrazione = 6;
        else if (currentPeriodoAndamento === '3m') mesiSottrazione = 3;
        else if (currentPeriodoAndamento === '2m') mesiSottrazione = 2;
        else if (currentPeriodoAndamento === '1m') mesiSottrazione = 1;

        if (anniSottrazione > 0 || mesiSottrazione > 0) {
            let dateCutoff = new Date(dateOggi);
            if (anniSottrazione > 0) dateCutoff.setFullYear(dateOggi.getFullYear() - anniSottrazione);
            if (mesiSottrazione > 0) dateCutoff.setMonth(dateOggi.getMonth() - mesiSottrazione);

            let cutoffStr = dateCutoff.toISOString().split('T')[0];
            startIndex = dateAll.findIndex(d => d >= cutoffStr);
            if (startIndex === -1) startIndex = 0; // Se lo storico è più corto, prendi tutto
        }
    }

    let dateSlice = dateAll.slice(startIndex);
    let valoriSlice = valoriAll.slice(startIndex);
    let investitoSlice = investitoAll.slice(startIndex);
    let dividendiSlice = dividendiAll.slice(startIndex);

    // --- FILTRO: METRICA ---
    let datasetsConfig = [];
    let formatoValuta = true;
    let kpiValue = 0;

    if (currentMetricaAndamento === 'Valore') {
        datasetsConfig = [
            { label: 'Valore Portafoglio', data: valoriSlice, borderColor: '#28a745', backgroundColor: 'transparent', borderWidth: 2, tension: 0.1, pointRadius: 0 },
            { label: 'Totale Investito', data: investitoSlice, borderColor: '#adb5bd', borderDash: [5, 5], backgroundColor: 'transparent', borderWidth: 2, tension: 0.1, pointRadius: 0 }
        ];

        if (mostraDividendi) {
            let valoreConDividendiSlice = valoriSlice.map((v, i) => v + (dividendiSlice[i] || 0));
            datasetsConfig.push({ label: 'Valore + Dividendi', data: valoreConDividendiSlice, borderColor: '#ffc107', backgroundColor: 'transparent', borderWidth: 2, tension: 0.1, pointRadius: 0, borderDash: [4, 4] });
            kpiValue = valoreConDividendiSlice[valoreConDividendiSlice.length - 1];
        } else {
            kpiValue = valoriSlice[valoriSlice.length - 1];
        }
    }
    else if (currentMetricaAndamento === 'Guadagno') {
        // Guadagno = Valore - Investito
        let guadagnoSlice = valoriSlice.map((v, i) => v - investitoSlice[i]);
        datasetsConfig = [
            { label: 'Guadagno', data: guadagnoSlice, borderColor: '#0d6efd', backgroundColor: 'transparent', borderWidth: 2, tension: 0.1, pointRadius: 0 }
        ];

        if (mostraDividendi) {
            let guadagnoConDividendiSlice = guadagnoSlice.map((v, i) => v + (dividendiSlice[i] || 0));
            datasetsConfig.push({ label: 'Guadagno Totale (con Dividendi)', data: guadagnoConDividendiSlice, borderColor: '#17a2b8', backgroundColor: 'transparent', borderWidth: 2, tension: 0.1, pointRadius: 0, borderDash: [4, 4] });
            kpiValue = guadagnoConDividendiSlice[guadagnoConDividendiSlice.length - 1];
        } else {
            kpiValue = guadagnoSlice[guadagnoSlice.length - 1];
        }
    }
    else if (currentMetricaAndamento === 'TWR') {
        formatoValuta = false;
        // Calcolo esatto del Time-Weighted Return (TWR)
        let twrSlice = [0]; // Il primo giorno del periodo di analisi parte sempre da 0%
        let twrDivSlice = [0];
        let fattoreCumulativo = 1.0;
        let fattoreCumulativoDiv = 1.0;

        for (let i = 1; i < valoriSlice.length; i++) {
            let v_prev = valoriSlice[i - 1];
            let inv_prev = investitoSlice[i - 1];
            let cash_flow_oggi = investitoSlice[i] - inv_prev;

            let base_calcolo = v_prev + cash_flow_oggi;
            let rendimento_giornaliero = 0;

            if (base_calcolo > 0) {
                rendimento_giornaliero = (valoriSlice[i] - base_calcolo) / base_calcolo;
            }

            fattoreCumulativo *= (1 + rendimento_giornaliero);
            twrSlice.push((fattoreCumulativo - 1) * 100);

            if (mostraDividendi) {
                let div_prev = dividendiSlice[i - 1] || 0;
                let div_oggi = dividendiSlice[i] || 0;
                let cash_flow_div = div_oggi - div_prev;
                let base_calcolo_div = (v_prev + div_prev) + cash_flow_oggi;
                let rendimento_giornaliero_div = 0;

                if (base_calcolo_div > 0) {
                    rendimento_giornaliero_div = ((valoriSlice[i] + div_oggi) - base_calcolo_div) / base_calcolo_div;
                }
                fattoreCumulativoDiv *= (1 + rendimento_giornaliero_div);
                twrDivSlice.push((fattoreCumulativoDiv - 1) * 100);
            }
        }

        datasetsConfig = [
            { label: 'TWR (%)', data: twrSlice, borderColor: '#6f42c1', backgroundColor: 'transparent', borderWidth: 2, tension: 0.1, pointRadius: 0 }
        ];

        if (mostraDividendi) {
            datasetsConfig.push({ label: 'TWR + Dividendi (%)', data: twrDivSlice, borderColor: '#e83e8c', backgroundColor: 'transparent', borderWidth: 2, tension: 0.1, pointRadius: 0, borderDash: [4, 4] });
            kpiValue = twrDivSlice[twrDivSlice.length - 1];
        } else {
            kpiValue = twrSlice[twrSlice.length - 1];
        }
    }

    // --- AGGIORNAMENTO KPI IN ALTO AL GRAFICO ---
    document.getElementById('andamento-kpi-label').innerText = currentMetricaAndamento + " (" + currentPeriodoAndamento + ")";
    let kpiDom = document.getElementById('andamento-valore-top');

    if (formatoValuta) {
        kpiDom.innerText = formatEuro(kpiValue);
        kpiDom.style.color = (currentMetricaAndamento === 'Guadagno' && kpiValue < 0) ? '#dc3545' : '#212529';
    } else {
        let segno = kpiValue > 0 ? '+' : '';
        kpiDom.innerText = segno + kpiValue.toFixed(2) + "%";
        kpiDom.style.color = kpiValue >= 0 ? '#28a745' : '#dc3545';
    }

    // --- DISEGNO EFFETTIVO DEL GRAFICO CON ZOOM PLUG-IN ---
    const ctx = document.getElementById('graficoAndamento').getContext('2d');
    if (graficoAndamentoLinee !== null) {
        graficoAndamentoLinee.destroy();
    }

    document.getElementById('selection-stats').style.display = 'none';

    window.currentValoriSlice = valoriSlice;
    window.currentInvestitoSlice = investitoSlice;
    window.currentDividendiSlice = dividendiSlice;
    window.currentDateSlice = dateSlice;

    graficoAndamentoLinee = new Chart(ctx, {
        type: 'line',
        data: { labels: dateSlice, datasets: datasetsConfig },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', align: 'start', labels: { usePointStyle: true, boxWidth: 10 } },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            if (formatoValuta) return context.dataset.label + ': ' + formatEuro(context.raw);
                            else return context.dataset.label + ': ' + context.raw.toFixed(2) + '%';
                        }
                    }
                },
                zoom: {
                    zoom: {
                        wheel: { enabled: true, speed: 0.05 },
                        pinch: { enabled: true }, // Zoom con dita da mobile
                        drag: { enabled: true, backgroundColor: 'rgba(13, 110, 253, 0.2)' }, // Selezione con trascinamento
                        mode: 'x', // Abilita lo zoom sull'asse orizzontale
                        onZoomComplete: function ({ chart }) { aggiornaStatsSelezione(chart); }
                    },
                    pan: {
                        enabled: true,
                        mode: 'x', // Permette di trascinare orizzontalmente
                        modifierKey: 'ctrl', // Premi Ctrl per il pan orizzontale anzichè selezionare
                        onPanComplete: function ({ chart }) { aggiornaStatsSelezione(chart); }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
                y: {
                    grid: { color: '#f1f3f5', drawBorder: false },
                    ticks: {
                        callback: function (value) {
                            if (formatoValuta) return '€' + value.toLocaleString('it-IT');
                            else return value.toFixed(1) + '%';
                        }
                    }
                }
            }
        }
    });

    // --- AGGIORNAMENTO GRAFICI AVANZATI ---
    aggiornaGraficiAvanzati();
}

// 5.1 CALCOLO E DISEGNO GRAFICI AVANZATI (Rendimenti Annuali e Drawdown)
function aggiornaGraficiAvanzati() {
    if (!datiStoriciGlobal || !datiStoriciGlobal.date || datiStoriciGlobal.date.length === 0) return;

    let dateAll = datiStoriciGlobal.date;

    // Aggregazione valori basata sui ticker selezionati
    let valoriAll = new Array(dateAll.length).fill(0);
    let investitoAll = new Array(dateAll.length).fill(0);

    if (datiStoriciGlobal.tickers && activeTickers.length > 0) {
        activeTickers.forEach(ticker => {
            if (datiStoriciGlobal.tickers[ticker]) {
                let dataTicker = datiStoriciGlobal.tickers[ticker];
                for (let i = 0; i < dateAll.length; i++) {
                    valoriAll[i] += dataTicker.values[i];
                    investitoAll[i] += dataTicker.invested[i];
                }
            }
        });
    } else if (!datiStoriciGlobal.tickers) {
        valoriAll = datiStoriciGlobal.values;
        investitoAll = datiStoriciGlobal.invested;
    }

    // --- FILTRO: PERIODO ---
    let startIndex = 0;
    if (currentPeriodoAndamento !== 'All') {
        let dateOggi = new Date(dateAll[dateAll.length - 1]);
        let anniSottrazione = 0;
        let mesiSottrazione = 0;

        if (currentPeriodoAndamento === '5y') anniSottrazione = 5;
        else if (currentPeriodoAndamento === '2y') anniSottrazione = 2;
        else if (currentPeriodoAndamento === '1y') anniSottrazione = 1;
        else if (currentPeriodoAndamento === '6m') mesiSottrazione = 6;
        else if (currentPeriodoAndamento === '3m') mesiSottrazione = 3;
        else if (currentPeriodoAndamento === '2m') mesiSottrazione = 2;
        else if (currentPeriodoAndamento === '1m') mesiSottrazione = 1;

        if (anniSottrazione > 0 || mesiSottrazione > 0) {
            let dateCutoff = new Date(dateOggi);
            if (anniSottrazione > 0) dateCutoff.setFullYear(dateOggi.getFullYear() - anniSottrazione);
            if (mesiSottrazione > 0) dateCutoff.setMonth(dateOggi.getMonth() - mesiSottrazione);

            let cutoffStr = dateCutoff.toISOString().split('T')[0];
            startIndex = dateAll.findIndex(d => d >= cutoffStr);
            if (startIndex === -1) startIndex = 0;
        }
    }

    let dateSlice = dateAll.slice(startIndex);
    let valoriSlice = valoriAll.slice(startIndex);
    let investitoSlice = investitoAll.slice(startIndex);

    // --- CALCOLO RENDIMENTI ANNUALI E TWR CUMULATIVO ---
    let rendimentiAnnuali = {};
    let twrCumulativo = [0];
    let fattoreCumulativoAll = 1.0;

    let currentYear = "";
    let fattoreCumulativoAnno = 1.0;

    for (let i = 1; i < valoriSlice.length; i++) {
        let dateObj = new Date(dateSlice[i]);
        let year = dateObj.getFullYear().toString();

        if (year !== currentYear) {
            if (currentYear !== "") {
                rendimentiAnnuali[currentYear] = (fattoreCumulativoAnno - 1) * 100;
            }
            currentYear = year;
            fattoreCumulativoAnno = 1.0;
        }

        let v_prev = valoriSlice[i - 1];
        let inv_prev = investitoSlice[i - 1];
        let cash_flow_oggi = investitoSlice[i] - inv_prev;

        let base_calcolo = v_prev + cash_flow_oggi;
        let rendimento_giornaliero = 0;

        if (base_calcolo > 0) {
            rendimento_giornaliero = (valoriSlice[i] - base_calcolo) / base_calcolo;
        }

        fattoreCumulativoAnno *= (1 + rendimento_giornaliero);
        fattoreCumulativoAll *= (1 + rendimento_giornaliero);

        twrCumulativo.push((fattoreCumulativoAll - 1) * 100);
    }
    if (currentYear !== "") {
        rendimentiAnnuali[currentYear] = (fattoreCumulativoAnno - 1) * 100;
    }

    // --- CALCOLO DRAWDOWN SUL TWR CUMULATIVO ---
    let drawdowns = [0];
    let peakTwr = twrCumulativo[0] !== undefined ? twrCumulativo[0] : 0;
    let maxDrawdown = 0;
    let sumDrawdown = 0;
    let drawdownCount = 0;
    let currentDuration = 0;
    let maxDuration = 0;

    for (let i = 1; i < twrCumulativo.length; i++) {
        if (twrCumulativo[i] > peakTwr) {
            peakTwr = twrCumulativo[i];
        }

        let dd = 0;
        let peakValueFactor = 1 + peakTwr / 100;
        let currentValueFactor = 1 + twrCumulativo[i] / 100;

        if (peakValueFactor > 0) {
            dd = (currentValueFactor / peakValueFactor - 1) * 100;
        }

        drawdowns.push(dd);

        if (dd < -0.01) { // Tolleranza per arrotondamenti
            currentDuration++;
            if (currentDuration > maxDuration) maxDuration = currentDuration;
            if (dd < maxDrawdown) maxDrawdown = dd;
            sumDrawdown += dd;
            drawdownCount++;
        } else {
            currentDuration = 0;
        }
    }

    let avgDrawdown = drawdownCount > 0 ? sumDrawdown / drawdownCount : 0;

    // --- DISEGNO GRAFICO RENDIMENTI ANNUALI ---
    let labelsAnni = Object.keys(rendimentiAnnuali);
    let dataAnni = Object.values(rendimentiAnnuali);
    let bgColorsAnni = dataAnni.map(v => v >= 0 ? 'rgba(40, 167, 69, 0.7)' : 'rgba(220, 53, 69, 0.7)');
    let borderColorsAnni = dataAnni.map(v => v >= 0 ? '#28a745' : '#dc3545');

    const ctxAnni = document.getElementById('graficoRendimentiAnnuali').getContext('2d');
    if (graficoAnniObj !== null) graficoAnniObj.destroy();
    graficoAnniObj = new Chart(ctxAnni, {
        type: 'bar',
        data: {
            labels: labelsAnni,
            datasets: [{
                label: 'Rendimento Annuale (%)',
                data: dataAnni,
                backgroundColor: bgColorsAnni,
                borderColor: borderColorsAnni,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function (context) { return context.raw.toFixed(2) + '%'; } } }
            },
            scales: { y: { ticks: { callback: function (value) { return value.toFixed(2) + '%'; } } } }
        }
    });

    // --- DISEGNO GRAFICO DRAWDOWN ---
    const ctxDD = document.getElementById('graficoDrawdown').getContext('2d');
    if (graficoDDObj !== null) graficoDDObj.destroy();
    graficoDDObj = new Chart(ctxDD, {
        type: 'line',
        data: {
            labels: dateSlice,
            datasets: [{
                label: 'Drawdown (%)',
                data: drawdowns,
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                borderWidth: 1.5,
                fill: true,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function (context) { return context.raw.toFixed(2) + '%'; } } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
                y: { grid: { color: '#f1f3f5' }, ticks: { callback: function (value) { return value + '%'; } }, max: 0 }
            }
        }
    });

    // --- AGGIORNAMENTO STATS DRAWDOWN ---
    document.getElementById('drawdown-stats').innerHTML = `
                <div><strong>Max DD:</strong> <span style="color: #dc3545;">${maxDrawdown.toFixed(2)}%</span></div>
                <div><strong>DD Medio:</strong> <span>${avgDrawdown.toFixed(2)}%</span></div>
                <div><strong>Durata Max:</strong> <span>${maxDuration} gg</span></div>
            `;

    aggiornaGraficoBenchmark();
}

// 5.2 AGGIORNAMENTO GRAFICO CONFRONTO BENCHMARK
function aggiornaGraficoBenchmark() {
    if (!datiStoriciGlobal || !datiStoriciGlobal.date || datiStoriciGlobal.date.length === 0) return;

    let dateAll = datiStoriciGlobal.date;

    // Mantieni coerenza con il filtro "Periodo" selezionato globalmente
    let startIndex = 0;
    if (currentPeriodoAndamento !== 'All') {
        let dateOggi = new Date(dateAll[dateAll.length - 1]);
        let anniSottrazione = 0;
        let mesiSottrazione = 0;

        if (currentPeriodoAndamento === '5y') anniSottrazione = 5;
        else if (currentPeriodoAndamento === '2y') anniSottrazione = 2;
        else if (currentPeriodoAndamento === '1y') anniSottrazione = 1;
        else if (currentPeriodoAndamento === '6m') mesiSottrazione = 6;
        else if (currentPeriodoAndamento === '3m') mesiSottrazione = 3;
        else if (currentPeriodoAndamento === '2m') mesiSottrazione = 2;
        else if (currentPeriodoAndamento === '1m') mesiSottrazione = 1;

        if (anniSottrazione > 0 || mesiSottrazione > 0) {
            let dateCutoff = new Date(dateOggi);
            if (anniSottrazione > 0) dateCutoff.setFullYear(dateOggi.getFullYear() - anniSottrazione);
            if (mesiSottrazione > 0) dateCutoff.setMonth(dateOggi.getMonth() - mesiSottrazione);

            let cutoffStr = dateCutoff.toISOString().split('T')[0];
            startIndex = dateAll.findIndex(d => d >= cutoffStr);
            if (startIndex === -1) startIndex = 0;
        }
    }

    let dateSlice = dateAll.slice(startIndex);

    let valoriAll = new Array(dateAll.length).fill(0);
    let investitoAll = new Array(dateAll.length).fill(0);
    let dividendiAll = new Array(dateAll.length).fill(0);

    if (datiStoriciGlobal.tickers && activeTickers.length > 0) {
        activeTickers.forEach(ticker => {
            if (datiStoriciGlobal.tickers[ticker]) {
                let dataTicker = datiStoriciGlobal.tickers[ticker];
                for (let i = 0; i < dateAll.length; i++) {
                    valoriAll[i] += dataTicker.values[i];
                    investitoAll[i] += dataTicker.invested[i];
                    if (dataTicker.dividends) dividendiAll[i] += dataTicker.dividends[i];
                }
            }
        });
    } else if (!datiStoriciGlobal.tickers) {
        valoriAll = datiStoriciGlobal.values;
        investitoAll = datiStoriciGlobal.invested;
        if (datiStoriciGlobal.dividends) dividendiAll = datiStoriciGlobal.dividends;
    }

    let valoriSlice = valoriAll.slice(startIndex);
    let investitoSlice = investitoAll.slice(startIndex);
    let dividendiSlice = dividendiAll.slice(startIndex);

    let twrPortafoglio = [0];
    let fattoreCumulativo = 1.0;

    for (let i = 1; i < valoriSlice.length; i++) {
        let v_prev = valoriSlice[i - 1];
        let inv_prev = investitoSlice[i - 1];
        let cash_flow_oggi = investitoSlice[i] - inv_prev;

        let base_calcolo = v_prev + cash_flow_oggi;

        if (mostraDividendi) {
            let div_prev = dividendiSlice[i - 1] || 0;
            let div_oggi = dividendiSlice[i] || 0;
            base_calcolo = (v_prev + div_prev) + cash_flow_oggi;
            let r = 0;
            if (base_calcolo > 0) r = ((valoriSlice[i] + div_oggi) - base_calcolo) / base_calcolo;
            fattoreCumulativo *= (1 + r);
        } else {
            let r = 0;
            if (base_calcolo > 0) r = (valoriSlice[i] - base_calcolo) / base_calcolo;
            fattoreCumulativo *= (1 + r);
        }

        twrPortafoglio.push((fattoreCumulativo - 1) * 100);
    }

    let selectedBenchmark = document.getElementById('select-benchmark').value;
    let bPricesAll = datiStoriciGlobal.benchmarks ? datiStoriciGlobal.benchmarks[selectedBenchmark] : null;
    let twrBenchmark = new Array(dateSlice.length).fill(0);

    if (bPricesAll) {
        let bPricesSlice = bPricesAll.slice(startIndex);
        let startPrice = 0;
        // Cerca il primo giorno valido dall'inizio del periodo in cui il benchmark era già scambiabile
        for (let i = 0; i < bPricesSlice.length; i++) {
            if (bPricesSlice[i] > 0) {
                startPrice = bPricesSlice[i];
                break;
            }
        }

        if (startPrice > 0) {
            for (let i = 0; i < bPricesSlice.length; i++) {
                if (bPricesSlice[i] > 0) {
                    twrBenchmark[i] = ((bPricesSlice[i] - startPrice) / startPrice) * 100;
                } else if (i > 0) {
                    twrBenchmark[i] = twrBenchmark[i - 1];
                }
            }
        }
    }

    const ctxB = document.getElementById('graficoBenchmark').getContext('2d');
    if (graficoBenchmarkObj !== null) graficoBenchmarkObj.destroy();
    graficoBenchmarkObj = new Chart(ctxB, {
        type: 'line',
        data: {
            labels: dateSlice,
            datasets: [
                {
                    label: 'Portafoglio (TWR %)',
                    data: twrPortafoglio,
                    borderColor: '#6f42c1',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: selectedBenchmark + ' (TWR %)',
                    data: twrBenchmark,
                    borderColor: '#fd7e14',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.1,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: function (context) { return context.dataset.label + ': ' + context.raw.toFixed(2) + '%'; } } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
                y: { grid: { color: '#f1f3f5' }, ticks: { callback: function (value) { return value + '%'; } } }
            }
        }
    });
}

// 5.3 ANALISI GEMINI AI
async function chiediAnalisiGemini() {
    if (!window.portfolioSnapshot) {
        alert(window.Translations.noPortfolioData || "No portfolio data available.");
        return;
    }

    const modal = document.getElementById('gemini-modal');
    const content = document.getElementById('gemini-content');
    modal.style.display = 'flex';
    let isIt = document.documentElement.lang === 'it';
    content.innerHTML = '<div style="text-align:center; padding:30px; font-size:1.1em; color:#6c757d;">⏳ ' + (isIt ? 'Analisi del portafoglio in corso...' : 'Analyzing portfolio...') + '</div>';

    try {
        let res = await fetch('/api/analyze_portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...window.portfolioSnapshot,
                portfolio_id: activePortfolioId
            })
        });
        let data = await res.json();
        if (res.ok) {
            let formattedText = data.analisi.replace(/### (.*?)\n/g, '<h4>$1</h4>').replace(/## (.*?)\n/g, '<h3>$1</h3>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
            content.innerHTML = formattedText;
        } else {
            content.innerHTML = '<span style="color:#dc3545; font-weight:bold;">❌ Errore: ' + (data.errore || 'Unknown error') + '</span>';
        }
    } catch (e) {
        content.innerHTML = '<span style="color:#dc3545; font-weight:bold;">❌ Errore di rete durante la richiesta a Gemini.</span>';
    }
}

// 6. AGGIUNTA TRANSAZIONE 
async function aggiungiTransazione() {
    let asset_name = document.getElementById("asset_name").value.trim();
    let date = document.getElementById("date").value;
    let asset_type = document.getElementById("asset_type").value;
    let price_per_share = parseFloat(document.getElementById("price_per_share").value) || 0;
    let fees = parseFloat(document.getElementById("fees").value) || 0;
    let quantity = parseFloat(document.getElementById("quantity").value) || 0;
    let type = document.querySelector('input[name="type"]:checked').value;
    // Ticker override: usa il valore mostrato nel campo (già auto-risolto o modificato dall'utente)
    let ticker_override = (document.getElementById("ticker_override") || {}).value || '';

    if (!asset_name || !date || !price_per_share || !quantity) { alert("Compila tutti i campi principali prima di salvare."); return; }

    let totale = price_per_share * quantity;
    let nuovaTransazione = {
        date: date,
        asset_name: asset_name,
        operation_type: type,
        price_per_share: price_per_share,
        fees: fees,
        quantity: quantity,
        total_value: totale,
        asset_type: asset_type,
        ticker: ticker_override.trim() // vuoto = il backend risolve automaticamente
    };

    try {
        await fetch('/api/transactions?portfolio_id=' + activePortfolioId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuovaTransazione)
        });

        document.getElementById("asset_name").value = "";
        document.getElementById("price_per_share").value = "";
        document.getElementById("fees").value = "0";
        document.getElementById("quantity").value = "1";
        document.querySelector('input[name="type"][value="Buy"]').checked = true;
        // Reset campo ticker override
        let overrideInput = document.getElementById("ticker_override");
        if (overrideInput) { overrideInput.value = ''; }
        let overrideGroup = document.getElementById('ticker-override-group');
        if (overrideGroup) { overrideGroup.style.display = 'none'; }
        let status = document.getElementById('ticker-resolve-status');
        if (status) { status.textContent = ''; }

        document.getElementById('graficoAndamento').style.display = 'none';
        document.getElementById('loading-grafico').style.display = 'block';
        document.getElementById('loading-grafico').innerText = "Scarico dati aggiornati dal mercato...";

        caricaDati();
    } catch (error) { alert("Errore durante il salvataggio."); }
}

// 7. ELIMINAZIONE TRANSAZIONE
async function eliminaTransazione(id) {
    let conferma = confirm("Sei sicuro di voler eliminare questa transazione?");
    if (conferma) {
        try {
            let risposta = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
            if (risposta.ok) {
                document.getElementById('graficoAndamento').style.display = 'none';
                document.getElementById('loading-grafico').style.display = 'block';
                document.getElementById('loading-grafico').innerText = "Ricalcolo andamento storico...";
                caricaDati();
            }
        } catch (error) { alert("Errore di rete."); }
    }
}

// 7.2 AGGIORNA TIPO ASSET MASSIVO
async function aggiornaTipoAsset(ticker, nuovoTipo) {
    try {
        let risposta = await fetch('/api/transactions/asset_type?portfolio_id=' + activePortfolioId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: ticker, asset_type: nuovoTipo })
        });

        if (risposta.ok) {
            // Ricaricamento per aggiornare i grafici a ciambella e le tabelle
            caricaDati();
        } else {
            alert("Errore durante l'aggiornamento del tipo asset.");
        }
    } catch (error) { alert("Errore di connessione al server."); }
}

// 7.1 SVUOTA PORTAFOGLIO
async function svuotaPortafoglio() {
    let conferma = confirm("ATTENZIONE! Sei sicuro di voler eliminare TUTTE le transazioni dal portafoglio?\n\nTi suggeriamo vivamente di esportare un file CSV come backup prima di procedere.\n\nVuoi davvero continuare e cancellare tutto?");
    if (conferma) {
        try {
            let risposta = await fetch('/api/transactions/all?portfolio_id=' + activePortfolioId, { method: 'DELETE' });
            if (risposta.ok) {
                alert("Tutte le transazioni sono state eliminate.");
                document.getElementById('graficoAndamento').style.display = 'none';
                document.getElementById('loading-grafico').style.display = 'block';
                document.getElementById('loading-grafico').innerText = "Ricalcolo andamento storico...";
                caricaDati();
            } else {
                alert("Errore durante l'eliminazione.");
            }
        } catch (error) { alert("Errore di rete."); }
    }
}

// 8. ESPORTA CSV
function esportaCSV() {
    window.location.href = '/api/export_csv?portfolio_id=' + activePortfolioId;
}

function esportaDB() {
    window.location.href = '/api/backup_db';
}

let currentCsvFile = null;

function openMappingModal(file, headers, sample) {
    currentCsvFile = file;
    let container = document.getElementById('mapping-fields');
    container.innerHTML = '';

    const dbFields = [
        { id: 'date', label: window.document.documentElement.lang === 'it' ? 'Data' : 'Date', required: true },
        { id: 'asset_name', label: window.document.documentElement.lang === 'it' ? 'Strumento (Ticker/ISIN)' : 'Instrument (Ticker/ISIN)', required: true },
        { id: 'operation_type', label: window.document.documentElement.lang === 'it' ? 'Tipo Operazione (Acquisto/Vendita/Div.)' : 'Operation Type (Buy/Sell/Dividend)', required: false },
        { id: 'price_per_share', label: window.document.documentElement.lang === 'it' ? 'Prezzo per Quota' : 'Price per Share', required: false },
        { id: 'fees', label: window.document.documentElement.lang === 'it' ? 'Commissioni' : 'Fees', required: false },
        { id: 'quantity', label: window.document.documentElement.lang === 'it' ? 'Quantità' : 'Quantity', required: false },
        { id: 'total_value', label: window.document.documentElement.lang === 'it' ? 'Controvalore / Totale' : 'Total Value', required: false }
    ];

    let optionsHtml = '<option value="">-- Ignora / Non presente --</option>';
    headers.forEach((h, i) => {
        let sampleText = sample[i] ? ` (e.g., ${sample[i]})` : '';
        optionsHtml += `<option value="${h}">${h}${sampleText}</option>`;
    });

    dbFields.forEach(field => {
        let row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        let reqStar = field.required ? '<span style="color:red;">*</span>' : '';
        row.innerHTML = `<label style="margin: 0; width: 45%;">${field.label} ${reqStar}</label><select id="map_${field.id}" style="width: 50%; padding: 8px; border-radius: 6px; border: 1px solid #ced4da;">${optionsHtml}</select>`;
        container.appendChild(row);

        // Auto-matching basato su parole chiave
        let select = row.querySelector('select');
        let bestMatch = '';
        let labelLower = field.id.toLowerCase();
        for (let i = 0; i < headers.length; i++) {
            let hLower = headers[i].toLowerCase();
            if (hLower.includes(labelLower) || labelLower.includes(hLower) ||
                (labelLower === 'date' && (hLower.includes('data') || hLower.includes('date'))) ||
                (labelLower === 'asset_name' && (hLower.includes('isin') || hLower.includes('ticker') || hLower.includes('simbolo') || hLower.includes('strumento'))) ||
                (labelLower === 'operation_type' && (hLower.includes('tipo') || hLower.includes('type') || hLower.includes('operazione'))) ||
                (labelLower === 'price_per_share' && (hLower.includes('prezzo') || hLower.includes('price'))) ||
                (labelLower === 'quantity' && (hLower.includes('quant') || hLower.includes('qty'))) ||
                (labelLower === 'total_value' && (hLower.includes('totale') || hLower.includes('total') || hLower.includes('importo') || hLower.includes('controvalore')))
            ) {
                bestMatch = headers[i];
                break;
            }
        }
        if (bestMatch) select.value = bestMatch;
    });

    document.getElementById('csv-mapping-modal').style.display = 'flex';
}

async function confermaMappingCSV() {
    let mapping = {
        date: document.getElementById('map_date').value,
        asset_name: document.getElementById('map_asset_name').value,
        operation_type: document.getElementById('map_operation_type').value,
        price_per_share: document.getElementById('map_price_per_share').value,
        fees: document.getElementById('map_fees').value,
        quantity: document.getElementById('map_quantity').value,
        total_value: document.getElementById('map_total_value').value
    };

    if (!mapping.date || !mapping.asset_name) {
        alert("Compila tutti i campi obbligatori (*).");
        return;
    }

    document.getElementById('csv-mapping-modal').style.display = 'none';
    document.getElementById('loading-grafico').style.display = 'block';
    document.getElementById('loading-grafico').innerText = "Importazione dati personalizzata in corso...";
    document.getElementById('graficoAndamento').style.display = 'none';

    let formData = new FormData();
    formData.append("file", currentCsvFile);
    formData.append("mapping", JSON.stringify(mapping));

    try {
        let risposta = await fetch('/api/import_custom_csv?portfolio_id=' + activePortfolioId, { method: 'POST', body: formData });
        let result = await risposta.json();
        if (risposta.ok) { alert(result.messaggio); caricaDati(); } else { alert(result.errore || "Errore durante l'importazione."); caricaDati(); }
    } catch (error) { alert("Errore di rete durante l'importazione."); } finally { currentCsvFile = null; event.target.value = ''; }
}

// 9. IMPORTA CSV
async function importaCSV(event) {
    let file = event.target.files[0];
    if (!file) return;

    let fonte = document.getElementById('fonte-csv').value;

    if (fonte === 'Custom') {
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
            openMappingModal(file, data.headers, data.sample);
        } catch (e) { alert("Errore di rete"); event.target.value = ''; }
        return;
    }

    let formData = new FormData();
    formData.append("file", file);
    formData.append("fonte", fonte);

    document.getElementById('loading-grafico').style.display = 'block';
    document.getElementById('loading-grafico').innerText = "Importazione dati in corso...";
    document.getElementById('graficoAndamento').style.display = 'none';

    try {
        let risposta = await fetch('/api/import_csv?portfolio_id=' + activePortfolioId, { method: 'POST', body: formData });
        let result = await risposta.json();

        if (risposta.ok) {
            alert(result.messaggio);
            caricaDati(); // Ricarica tutto con i nuovi dati
        } else {
            alert(result.errore || "Errore durante l'importazione.");
            caricaDati();
        }
    } catch (error) {
        alert("Errore di rete durante l'importazione.");
    } finally {
        event.target.value = ''; // Resetta l'input file
    }
}

function openWalletMappingModal(file, headers, sample) {
    currentCsvFile = file;
    let container = document.getElementById('wallet-mapping-fields');
    container.innerHTML = '';

    const dbFields = [
        { id: 'date', label: window.document.documentElement.lang === 'it' ? 'Data' : 'Date', required: true },
        { id: 'account', label: window.document.documentElement.lang === 'it' ? 'Conto' : 'Account', required: true },
        { id: 'amount', label: window.document.documentElement.lang === 'it' ? 'Importo' : 'Amount', required: true },
        { id: 'category', label: window.document.documentElement.lang === 'it' ? 'Categoria' : 'Category', required: false },
        { id: 'note', label: window.document.documentElement.lang === 'it' ? 'Nota / Causale' : 'Note / Description', required: false },
        { id: 'type', label: window.document.documentElement.lang === 'it' ? 'Tipo Operazione (Entrata/Uscita/Trasfer.)' : 'Operation Type (Income/Expense/Transfer)', required: false }
    ];

    let optionsHtml = '<option value="">-- Ignora / Non presente --</option>';
    headers.forEach((h, i) => {
        let sampleText = sample[i] ? ` (e.g., ${sample[i]})` : '';
        optionsHtml += `<option value="${h}">${h}${sampleText}</option>`;
    });

    dbFields.forEach(field => {
        let row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        let reqStar = field.required ? '<span style="color:red;">*</span>' : '';
        row.innerHTML = `<label style="margin: 0; width: 45%;">${field.label} ${reqStar}</label><select id="wmap_${field.id}" style="width: 50%; padding: 8px; border-radius: 6px; border: 1px solid #ced4da;">${optionsHtml}</select>`;
        container.appendChild(row);

        let select = row.querySelector('select');
        let bestMatch = '';
        let labelLower = field.id.toLowerCase();
        for (let i = 0; i < headers.length; i++) {
            let hLower = headers[i].toLowerCase();
            if (hLower.includes(labelLower) || labelLower.includes(hLower) ||
                (labelLower === 'date' && (hLower.includes('data') || hLower.includes('date'))) ||
                (labelLower === 'account' && (hLower.includes('conto') || hLower.includes('banca') || hLower.includes('account'))) ||
                (labelLower === 'amount' && (hLower.includes('importo') || hLower.includes('amount') || hLower.includes('valore') || hLower.includes('totale'))) ||
                (labelLower === 'category' && (hLower.includes('categoria') || hLower.includes('category'))) ||
                (labelLower === 'note' && (hLower.includes('nota') || hLower.includes('note') || hLower.includes('descrizione') || hLower.includes('causale'))) ||
                (labelLower === 'type' && (hLower.includes('tipo') || hLower.includes('type') || hLower.includes('operazione')))
            ) {
                bestMatch = headers[i];
                break;
            }
        }
        if (bestMatch) select.value = bestMatch;
    });

    document.getElementById('wallet-csv-mapping-modal').style.display = 'flex';
}

async function confermaMappingWalletCSV() {
    let mapping = {
        date: document.getElementById('wmap_date').value,
        account: document.getElementById('wmap_account').value,
        amount: document.getElementById('wmap_amount').value,
        category: document.getElementById('wmap_category').value,
        note: document.getElementById('wmap_note').value,
        type: document.getElementById('wmap_type').value
    };

    if (!mapping.date || !mapping.account || !mapping.amount) {
        alert("Compila tutti i campi obbligatori (*).");
        return;
    }

    document.getElementById('wallet-csv-mapping-modal').style.display = 'none';
    document.getElementById('reload-button').classList.add('loading');

    let formData = new FormData();
    formData.append("file", currentCsvFile);
    formData.append("mapping", JSON.stringify(mapping));

    try {
        let risposta = await fetch('/api/wallet/import_custom_csv?wallet_id=' + activeWalletId, { method: 'POST', body: formData });
        let result = await risposta.json();
        if (risposta.ok) { alert(result.messaggio); caricaDatiWallet(); } else { alert(result.errore || "Errore durante l'importazione."); }
    } catch (error) { alert("Errore di rete durante l'importazione."); } finally { currentCsvFile = null; document.getElementById('file-wallet-csv').value = ''; document.getElementById('reload-button').classList.remove('loading'); }
}

// --- LOGICA TAB ---
function switchTab(tabId, btnElement) {
    if (document.getElementById(tabId).classList.contains('active')) {
        return;
    }
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btnElement.classList.add('active');
    localStorage.setItem('activeTab', tabId);

    // Mantieni l'hash allineato
    let currentHashTab = ottieniTabIdDaHash(window.location.hash);
    if (currentHashTab !== tabId) {
        const hashMapping = {
            'tab-investimenti': 'investments',
            'tab-wallet': 'wallet',
            'tab-bollette': 'bills',
            'tab-veicoli': 'vehicles',
            'tab-prestiti': 'loans',
            'tab-stipendi': 'salaries',
            'tab-fondopensione': 'pension',
            'tab-settings': 'settings'
        };
        let cleanHash = hashMapping[tabId] || tabId.replace('tab-', '');
        window.location.hash = cleanHash;
    }

    if (tabId === 'tab-bollette') {
        inizializzaAnniBollette();
        if (typeof disegnaGraficoBollette === 'function') {
            disegnaGraficoBollette();
        }
    } else if (tabId === 'tab-veicoli') {
        if (typeof window.caricaDatiVeicoli === 'function') {
            window.caricaDatiVeicoli();
        }
    } else if (tabId === 'tab-prestiti') {
        if (typeof window.caricaDatiPrestiti === 'function') {
            window.caricaDatiPrestiti();
        }
    } else if (tabId === 'tab-stipendi') {
        if (typeof window.caricaDatiStipendi === 'function') {
            window.caricaDatiStipendi();
        }
    } else if (tabId === 'tab-fondopensione') {
        if (typeof window.caricaDatiFP === 'function') {
            window.caricaDatiFP();
        }
    } else if (tabId === 'tab-settings') {
        if (typeof window.caricaDatiSettings === 'function') {
            window.caricaDatiSettings();
        }
    } else if (tabId === 'tab-investimenti') {
        ricaricaDatiInvestimenti();
    }
}

function formatNumShort(num) {
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(num);
}

// --- WALLET LOGIC ---
let graficoWalletMensileObj = null;
let graficoWalletCategorieObj = null;
let transazioniWalletGlobal = [];
let contiWalletGlobal = [];
let activeContiWallet = [];
let saldiInizialiWallet = {};
let escludiSaldiContiWallet = [];

// --- LOGICA FILTRO DATE CUSTOM WALLET ---
let walletFilter = { type: 'year', year: new Date().getFullYear(), month: new Date().getMonth(), customFrom: '', customTo: '' };
let uiMesiYear = new Date().getFullYear();
let uiAnniDecadeStart = Math.floor(new Date().getFullYear() / 10) * 10;

function initFiltroDateWallet() {
    applicaFiltroWalletUI(false);
}

function toggleDateFilter() {
    let pop = document.getElementById('date-filter-popover');
    pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
    if (pop.style.display === 'block') aggiornaUIPopover();
}

document.addEventListener('click', function (event) {
    let pop = document.getElementById('date-filter-popover');
    let display = document.querySelector('.date-filter-display');
    if (pop && pop.style.display === 'block' && !pop.contains(event.target) && !display.contains(event.target)) {
        pop.style.display = 'none';
    }
});

function switchDateTab(tabId) {
    document.querySelectorAll('.date-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-btn-' + tabId).classList.add('active');
    document.querySelectorAll('.date-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('date-tab-' + tabId).style.display = 'block';
    aggiornaUIPopover();
}

function cambiaAnnoMesi(dir) { uiMesiYear += dir; aggiornaUIPopover(); }
function cambiaDecennio(dir) { uiAnniDecadeStart += dir * 10; aggiornaUIPopover(); }

function selezionaMese(m) {
    walletFilter.type = 'month'; walletFilter.year = uiMesiYear; walletFilter.month = m;
    document.getElementById('date-filter-popover').style.display = 'none';
    applicaFiltroWalletUI(true);
}

function selezionaAnno(y) {
    walletFilter.type = 'year'; walletFilter.year = y;
    document.getElementById('date-filter-popover').style.display = 'none';
    applicaFiltroWalletUI(true);
}

function selezionaFiltroTutto() {
    walletFilter.type = 'all';
    document.getElementById('date-filter-popover').style.display = 'none';
    applicaFiltroWalletUI(true);
}

function selezionaFiltroCustom() {
    let from = document.getElementById('wallet-date-from').value;
    let to = document.getElementById('wallet-date-to').value;
    if (from && to) {
        walletFilter.type = 'custom'; walletFilter.customFrom = from; walletFilter.customTo = to;
        document.getElementById('date-filter-popover').style.display = 'none';
        applicaFiltroWalletUI(true);
    } else { alert("Seleziona entrambe le date."); }
}

function aggiornaUIPopover() {
    document.getElementById('mesi-anno-label').innerText = uiMesiYear;
    let mesiGrid = document.getElementById('grid-mesi');
    let mesiNomi = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
    mesiGrid.innerHTML = '';
    for (let i = 0; i < 12; i++) {
        let div = document.createElement('div');
        let isActive = walletFilter.type === 'month' && walletFilter.year === uiMesiYear && walletFilter.month === i;
        div.className = 'date-grid-btn' + (isActive ? ' active' : '');
        div.innerText = mesiNomi[i];
        div.onclick = () => selezionaMese(i);
        mesiGrid.appendChild(div);
    }
    document.getElementById('anni-decennio-label').innerText = `${uiAnniDecadeStart} – ${uiAnniDecadeStart + 9}`;
    let anniGrid = document.getElementById('grid-anni');
    anniGrid.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        let y = uiAnniDecadeStart + i;
        let div = document.createElement('div');
        let isActive = walletFilter.type === 'year' && walletFilter.year === y;
        div.className = 'date-grid-btn' + (isActive ? ' active' : '');
        div.innerText = y;
        div.onclick = () => selezionaAnno(y);
        anniGrid.appendChild(div);
    }
}

function applicaFiltroWalletUI(triggerUpdate = true) {
    let monthNames = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
    let text = "";
    if (walletFilter.type === 'all') text = "Tutto lo storico";
    else if (walletFilter.type === 'year') text = walletFilter.year.toString();
    else if (walletFilter.type === 'month') text = `${monthNames[walletFilter.month]} ${walletFilter.year}`;
    else if (walletFilter.type === 'custom') {
        let df = walletFilter.customFrom.split('-'); let dt = walletFilter.customTo.split('-');
        text = `${df[2]}/${df[1]}/${df[0].substring(2)} - ${dt[2]}/${dt[1]}/${dt[0].substring(2)}`;
    }
    document.getElementById('date-filter-text').innerText = text;
    let tabs = { 'all': 'all', 'year': 'years', 'month': 'months', 'custom': 'custom' };
    document.querySelectorAll('.date-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-btn-' + tabs[walletFilter.type]).classList.add('active');
    document.querySelectorAll('.date-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('date-tab-' + tabs[walletFilter.type]).style.display = 'block';
    // Sync secondary table widget text
    aggiornaTableDateUI();
    if (triggerUpdate) aggiornaDashboardWallet();
}

function esportaWalletCSV() {
    if (!activeWalletId) return;
    window.location.href = '/api/wallet/export_csv?wallet_id=' + activeWalletId;
}

async function importaWalletCSV(event) {
    let file = event.target.files[0];
    if (!file) return;
    let fonte = document.getElementById('fonte-wallet-csv').value;

    if (fonte === 'Custom') {
        let formData = new FormData();
        formData.append("file", file);
        document.getElementById('reload-button').classList.add('loading');
        try {
            let res = await fetch('/api/preview_csv', { method: 'POST', body: formData });
            document.getElementById('reload-button').classList.remove('loading');
            if (!res.ok) {
                let err = await res.json();
                alert(err.errore || "Errore nella lettura del file");
                event.target.value = '';
                return;
            }
            let data = await res.json();
            openWalletMappingModal(file, data.headers, data.sample);
        } catch (e) { alert("Errore di rete"); event.target.value = ''; document.getElementById('reload-button').classList.remove('loading'); }
        return;
    }

    let formData = new FormData();
    formData.append("file", file);
    formData.append("fonte", fonte);
    document.getElementById('reload-button').classList.add('loading');
    try {
        let risposta = await fetch('/api/wallet/import_csv?wallet_id=' + activeWalletId, { method: 'POST', body: formData });
        let result = await risposta.json();
        if (risposta.ok) {
            alert(result.messaggio);
            await caricaDatiWallet();
        } else {
            alert(result.errore || window.Translations.importError);
        }
    } catch (error) {
        alert(window.Translations.networkImportError);
    } finally {
        event.target.value = '';
        document.getElementById('reload-button').classList.remove('loading');
    }
}

async function svuotaWallet() {
    if (!activeWalletId) return;
    let conferma = confirm(window.Translations.deleteWalletConfirm);
    if (conferma) {
        try {
            let risposta = await fetch('/api/wallet/transactions/all?wallet_id=' + activeWalletId, { method: 'DELETE' });
            if (risposta.ok) {
                alert(window.Translations.walletDeleted);
                await caricaDatiWallet();
            } else {
                alert(window.Translations.deleteError);
            }
        } catch (error) {
            alert(window.Translations.networkError);
        }
    }
}

async function caricaConfigurazioneContiWallet() {
    try {
        let risposta = await fetch('/api/wallet/account_config?wallet_id=' + activeWalletId);
        if (risposta.ok) {
            let config = await risposta.json();

            // Migrazione da localStorage al Database se il DB è vuoto per questo portafoglio
            if (config.length === 0) {
                let savedSaldi = localStorage.getItem(`saldiIniziali_${activeWalletId}`);
                let savedEsclusioni = localStorage.getItem(`escludiSaldi_${activeWalletId}`);

                if (savedSaldi) { try { saldiInizialiWallet = JSON.parse(savedSaldi); } catch (e) { saldiInizialiWallet = {}; } }
                else { saldiInizialiWallet = {}; }

                if (savedEsclusioni) { try { escludiSaldiContiWallet = JSON.parse(savedEsclusioni); } catch (e) { escludiSaldiContiWallet = []; } }
                else { escludiSaldiContiWallet = []; }

                // Salva in modo asincrono tutto sul DB
                let contiDaSalvare = new Set([...Object.keys(saldiInizialiWallet), ...escludiSaldiContiWallet]);
                contiDaSalvare.forEach(conto => salvaConfigurazioneContoWallet(conto));

                // Rimuovi i dati da localStorage per fare pulizia
                localStorage.removeItem(`saldiIniziali_${activeWalletId}`);
                localStorage.removeItem(`escludiSaldi_${activeWalletId}`);
            } else {
                saldiInizialiWallet = {};
                escludiSaldiContiWallet = [];
                config.forEach(c => {
                    saldiInizialiWallet[c.account] = c.initial_balance;
                    if (c.excluded) { escludiSaldiContiWallet.push(c.account); }
                });
            }
        }
    } catch (e) { console.error("Errore caricamento configurazione conti:", e); }
}

async function salvaConfigurazioneContoWallet(conto) {
    let saldo = saldiInizialiWallet[conto] || 0;
    let escluso = escludiSaldiContiWallet.includes(conto);
    try {
        await fetch('/api/wallet/account_config?wallet_id=' + activeWalletId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account: conto, initial_balance: saldo, excluded: escluso })
        });
    } catch (e) { console.error("Errore salvataggio configurazione conto:", e); }
}

function salvaSaldoInizialeWallet(conto, valore) {
    saldiInizialiWallet[conto] = parseFloat(valore) || 0;
    salvaConfigurazioneContoWallet(conto);
    aggiornaDashboardWallet();
}

function toggleEsclusioneSaldoWallet(conto, isChecked) {
    if (isChecked) {
        escludiSaldiContiWallet = escludiSaldiContiWallet.filter(c => c !== conto);
    } else {
        if (!escludiSaldiContiWallet.includes(conto)) {
            escludiSaldiContiWallet.push(conto);
        }
    }
    salvaConfigurazioneContoWallet(conto);
    aggiornaDashboardWallet();
}

async function caricaDatiWallet() {
    if (!activeWalletId) return;
    try {
        let risposta = await fetch('/api/wallet/transactions?wallet_id=' + activeWalletId);
        if (risposta.ok) {
            transazioniWalletGlobal = await risposta.json();

            // Popola l'elenco dei conti univoci
            let contiSet = new Set();
            transazioniWalletGlobal.forEach(t => {
                contiSet.add(t.account || "Sconosciuto");
            });
            contiWalletGlobal = Array.from(contiSet).sort();

            // Inizializza i conti selezionati o mantieni la selezione corrente
            if (activeContiWallet.length === 0 && contiWalletGlobal.length > 0) {
                activeContiWallet = [...contiWalletGlobal];
            } else if (activeContiWallet.length > 0) {
                activeContiWallet = activeContiWallet.filter(c => contiWalletGlobal.includes(c));
                if (activeContiWallet.length === 0 && contiWalletGlobal.length > 0) {
                    activeContiWallet = [...contiWalletGlobal];
                }
            }

            await caricaConfigurazioneContiWallet();
            initFiltroDateWallet();
            initTableDateFilter();
            disegnaFiltriContiWallet();
            aggiornaDashboardWallet();
        }
    } catch (error) { console.error("Errore caricamento dati Wallet:", error); }
}

function toggleSelectAllWallet(masterCheckbox) {
    let checkboxes = document.querySelectorAll('.wallet-row-checkbox');
    checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
    aggiornaStatoEliminaWallet();
}

function aggiornaStatoEliminaWallet() {
    let btn = document.getElementById('btn-elimina-selezionate-wallet');
    if (!btn) return;
    let selezionati = document.querySelectorAll('.wallet-row-checkbox:checked').length;
    btn.style.display = selezionati > 0 ? 'block' : 'none';
}

async function eliminaTransazioniWalletSelezionate() {
    let checkboxes = document.querySelectorAll('.wallet-row-checkbox:checked');
    if (checkboxes.length === 0) return;
    
    let ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    let isIt = document.documentElement.lang === 'it';
    let msg = isIt ? `Sei sicuro di voler eliminare le ${ids.length} transazioni selezionate?` : `Are you sure you want to delete the ${ids.length} selected transactions?`;
    
    if (!confirm(msg)) return;
    
    try {
        let risposta = await fetch('/api/wallet/transactions/bulk?wallet_id=' + activeWalletId, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids })
        });
        
        if (risposta.ok) {
            caricaDatiWallet(); // Ricarica tutto e aggiorna la UI
        } else {
            let errorData = await risposta.json();
            alert("Errore durante l'eliminazione: " + (errorData.errore || ""));
        }
    } catch (e) {
        alert("Errore di rete durante l'eliminazione.");
    }
}

async function aggiornaCategoriaWallet(transactionId, nuovaCategoria) {
    try {
        let risposta = await fetch('/api/wallet/transactions/' + transactionId + '/category', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: nuovaCategoria })
        });
        
        if (risposta.ok) {
            caricaDatiWallet(); // Ricarica i dati per aggiornare grafici e tabelle
        } else {
            let errorData = await risposta.json();
            alert("Errore durante l'aggiornamento della categoria: " + (errorData.errore || ""));
        }
    } catch (e) {
        alert("Errore di rete durante l'aggiornamento.");
    }
}

function disegnaFiltriContiWallet() {
    // I bottoni a pillola originali sono stati sostituiti dalle Card.
    // Questa funzione resta vuota per retrocompatibilità. Il rendering
    // delle card avviene alla fine di aggiornaDashboardWallet.
}

function disegnaCardsContiWallet(saldiContiMap) {
    let container = document.getElementById('wallet-accounts-grid');
    if (!container) return;
    container.innerHTML = '';

    let colors = ['#16528e', '#0d6efd', '#e83e8c', '#212529', '#dc3545', '#17a2b8', '#fd7e14', '#0dcaf0'];

    contiWalletGlobal.forEach((conto, i) => {
        let isActive = activeContiWallet.includes(conto);
        let saldo = saldiContiMap[conto] || 0;

        let btn = document.createElement('button');
        btn.className = 'wallet-card' + (!isActive ? ' inactive' : '');
        btn.style.backgroundColor = colors[i % colors.length];

        btn.innerHTML = `
                    <div class="card-icon">🏦</div>
                    <div class="card-title">${conto}</div>
                    <div class="card-amount">${formatEuro(saldo)}</div>
                `;

        btn.onclick = () => {
            if (isActive) {
                activeContiWallet = activeContiWallet.filter(c => c !== conto);
            } else {
                activeContiWallet.push(conto);
            }
            if (activeContiWallet.length === 0) {
                activeContiWallet.push(conto);
                alert("Devi mantenere almeno un conto selezionato.");
                return;
            }
            aggiornaDashboardWallet();
        };
        container.appendChild(btn);
    });

    let addBtn = document.createElement('button');
    addBtn.className = 'wallet-add-card';
    addBtn.innerText = '+ Aggiungi conto';
    addBtn.onclick = () => { alert('Per aggiungere un conto, importa un file CSV contenente transazioni per quel nuovo conto.'); };
    container.appendChild(addBtn);
}

function spostaPeriodoFiltro(dir) {
    if (walletFilter.type === 'year') {
        walletFilter.year += dir;
        uiMesiYear = walletFilter.year;
        uiAnniDecadeStart = Math.floor(walletFilter.year / 10) * 10;
    } else if (walletFilter.type === 'month') {
        walletFilter.month += dir;
        if (walletFilter.month > 11) { walletFilter.month = 0; walletFilter.year += 1; }
        else if (walletFilter.month < 0) { walletFilter.month = 11; walletFilter.year -= 1; }
        uiMesiYear = walletFilter.year;
    } else if (walletFilter.type === 'all' || walletFilter.type === 'custom') {
        return; // Navigation not applicable for these filters
    }
    applicaFiltroWalletUI(true);
}

function calcolaPeriodiWallet() {
    let startCur, endCur, startPrev, endPrev;
    const oggi = new Date();
    oggi.setHours(23, 59, 59, 999);

    if (walletFilter.type === 'all') {
        startCur = new Date(0); endCur = oggi; startPrev = new Date(0); endPrev = new Date(0);
    } else if (walletFilter.type === 'year') {
        startCur = new Date(walletFilter.year, 0, 1); endCur = new Date(walletFilter.year, 11, 31, 23, 59, 59);
        startPrev = new Date(walletFilter.year - 1, 0, 1); endPrev = new Date(walletFilter.year - 1, 11, 31, 23, 59, 59);
    } else if (walletFilter.type === 'month') {
        startCur = new Date(walletFilter.year, walletFilter.month, 1); endCur = new Date(walletFilter.year, walletFilter.month + 1, 0, 23, 59, 59);
        startPrev = new Date(walletFilter.year, walletFilter.month - 1, 1); endPrev = new Date(walletFilter.year, walletFilter.month, 0, 23, 59, 59);
    } else if (walletFilter.type === 'custom') {
        if (walletFilter.customFrom && walletFilter.customTo) {
            startCur = new Date(walletFilter.customFrom);
            endCur = new Date(walletFilter.customTo);
            endCur.setHours(23, 59, 59, 999);
            const duration = endCur.getTime() - startCur.getTime();
            endPrev = new Date(startCur.getTime() - 1);
            startPrev = new Date(endPrev.getTime() - duration);
        } else {
            startCur = new Date(0); endCur = oggi; startPrev = new Date(0); endPrev = new Date(0);
        }
    }
    return { startCur, endCur, startPrev, endPrev, label: "" };
}

function aggiornaDashboardWallet() {
    let transazioni = transazioniWalletGlobal;
    if (!transazioni) return;

    const { startCur, endCur, startPrev, endPrev, label } = calcolaPeriodiWallet();

    let entrateCur = 0, speseCur = 0;
    let entratePrev = 0, spesePrev = 0;

    let entrateMensili = {}, speseMensili = {}, spesePerCategoria = {};
    let entratePerConto = {}, spesePerConto = {}, trasferimentiPerConto = {};
    let entratePreConto = {}, spesePreConto = {}, trasferimentiPreConto = {};
    let nettoMensileCur = {};
    
    // Azzera l'array delle transazioni filtrate prima di ripopolarlo
    transazioniValideWallet = [];
    currentPageWallet = 1;

    // Azzera anche i filtri aggiuntivi se presenti
    currentFiltertestoWallet = "";
    currentFilterContoWallet = [];
    currentFilterCategoriaWallet = [];
    
    const filtroTestoDOM = document.getElementById('filtroWalletTesto');
    if (filtroTestoDOM) filtroTestoDOM.value = "";
    
    if (typeof renderFiltroPills === "function") {
        renderFiltroPills('conto');
        renderFiltroPills('categoria');
    }



    transazioni.forEach(t => {
        let conto = t.account || "Sconosciuto";
        if (activeContiWallet.length > 0 && !activeContiWallet.includes(conto)) return;

        let dataStr = t.data_operazione;
        if (!dataStr) dataStr = t.date;
        if (!dataStr) return;
        let tDate = new Date(dataStr);
        let importo = parseFloat(t.amount) || 0;
        let mese = dataStr.substring(0, 7);
        let cat = t.category || "Altro";

        let isTransfer = t.type === 'Transfer' ||
            (t.type && t.type.toLowerCase().match(/(transfer|trasferiment|trasferisci|preleva|giroconto)/)) ||
            cat.toLowerCase().match(/(transfer|trasferiment|trasferisci|preleva|giroconto)/);

        let isCur = tDate >= startCur && tDate <= endCur;

        let isPrev = tDate >= startPrev && tDate <= endPrev;
        let isBeforeCur = tDate < startCur;

        if (isBeforeCur) {
            if (isTransfer) {
                trasferimentiPreConto[conto] = (trasferimentiPreConto[conto] || 0) + importo;
            } else {
                if (t.type === 'Income') entratePreConto[conto] = (entratePreConto[conto] || 0) + importo;
                else if (t.type === 'Expense') spesePreConto[conto] = (spesePreConto[conto] || 0) + Math.abs(importo);
            }
        }

        if (isTransfer) {
            if (isCur) {
                trasferimentiPerConto[conto] = (trasferimentiPerConto[conto] || 0) + importo;
                nettoMensileCur[mese] = (nettoMensileCur[mese] || 0) + importo;
                transazioniValideWallet.push({
                    id: t.id,
                    dataStr: dataStr,
                    conto: conto,
                    cat: cat + ' (Trasf.)',
                    note: t.note,
                    importo: importo,
                    isTransfer: true
                });
            }
        } else {
            if (isCur) {
                if (t.type === 'Income') {
                    entrateCur += importo;
                    entrateMensili[mese] = (entrateMensili[mese] || 0) + importo;
                    entratePerConto[conto] = (entratePerConto[conto] || 0) + importo;
                    nettoMensileCur[mese] = (nettoMensileCur[mese] || 0) + importo;
                } else if (t.type === 'Expense') {
                    let spesaAssoluta = Math.abs(importo);
                    speseCur += spesaAssoluta;
                    speseMensili[mese] = (speseMensili[mese] || 0) + spesaAssoluta;
                    spesePerCategoria[cat] = (spesePerCategoria[cat] || 0) + spesaAssoluta;
                    spesePerConto[conto] = (spesePerConto[conto] || 0) + spesaAssoluta;
                    nettoMensileCur[mese] = (nettoMensileCur[mese] || 0) - spesaAssoluta;
                }

                transazioniValideWallet.push({
                    id: t.id,
                    dataStr: dataStr,
                    conto: conto,
                    cat: cat,
                    note: t.note,
                    importo: importo,
                    isTransfer: false
                });
            }

            if (isPrev) {
                if (t.type === 'Income') {
                    entratePrev += importo;
                } else if (t.type === 'Expense') {
                    spesePrev += Math.abs(importo);
                }
            }
        }
    });

    let nettoCur = entrateCur - speseCur;
    let nettoPrev = entratePrev - spesePrev;

    // Ordina dalla più recente alla meno recente
    transazioniValideWallet.sort((a, b) => new Date(b.dataStr) - new Date(a.dataStr));
    
    // Popola i dropdown dei filtri
    let contiUnici = new Set(transazioniValideWallet.map(t => t.conto));
    let categorieUniche = new Set(transazioniValideWallet.map(t => t.cat));
    
    if (typeof popolaFiltroPills === "function") {
        popolaFiltroPills('conto', Array.from(contiUnici).sort());
        popolaFiltroPills('categoria', Array.from(categorieUniche).sort());
    }

    renderTabellaWallet();

    let mesi = Array.from(new Set([...Object.keys(entrateMensili), ...Object.keys(speseMensili)])).sort();
    let datiEntrate = mesi.map(m => entrateMensili[m] || 0);
    let datiSpeseChart = mesi.map(m => -(speseMensili[m] || 0)); // Usiamo valori negativi per il rendering giù dall'asse
    let datiNetto = mesi.map(m => (entrateMensili[m] || 0) - (speseMensili[m] || 0));

    const ctxMensile = document.getElementById('graficoWalletMensile').getContext('2d');
    if (graficoWalletMensileObj !== null) graficoWalletMensileObj.destroy();
    graficoWalletMensileObj = new Chart(ctxMensile, {
        type: 'bar',
        data: {
            labels: mesi,
            datasets: [
                { label: 'Flusso Netto', data: datiNetto, type: 'line', borderColor: '#0d6efd', backgroundColor: 'transparent', borderWidth: 2, tension: 0.3, pointRadius: 4, pointBackgroundColor: '#0d6efd' },
                { label: 'Entrate', data: datiEntrate, backgroundColor: 'rgba(40, 167, 69, 0.8)', borderRadius: 4 },
                { label: 'Uscite', data: datiSpeseChart, backgroundColor: 'rgba(220, 53, 69, 0.8)', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, ticks: { callback: function (v) { return '€' + Math.abs(v); } }, grid: { borderDash: [5, 5] } }
            },
            plugins: {
                tooltip: {
                    callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + formatEuro(Math.abs(ctx.raw)); } }
                }
            }
        }
    });

    // Ordiniamo le categorie per importo speso decrescente
    let catOrdinate = Object.entries(spesePerCategoria).sort((a, b) => b[1] - a[1]);

    let baseColors = ['#dc3545', '#fd7e14', '#ffc107', '#20c997', '#17a2b8', '#0d6efd', '#6f42c1', '#e83e8c', '#6610f2', '#adb5bd', '#6c757d'];
    let bgColors = catOrdinate.map((_, i) => baseColors[i % baseColors.length]);

    const ctxCat = document.getElementById('graficoWalletCategorie').getContext('2d');
    if (graficoWalletCategorieObj !== null) graficoWalletCategorieObj.destroy();
    graficoWalletCategorieObj = new Chart(ctxCat, { type: 'doughnut', data: { labels: catOrdinate.map(c => c[0]), datasets: [{ data: catOrdinate.map(c => c[1]), backgroundColor: bgColors }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: function (ctx) { return ctx.label + ': ' + formatEuro(ctx.raw); } } } } } });

    // Disegna tabella saldi conti
    let htmlSaldiConti = "";
    let totaleSaldoIniziale = 0;
    let totaleSaldoInizioPeriodo = 0;
    let totaleEntrateConti = 0;
    let totaleSpeseConti = 0;
    let totaleTrasferimentiConti = 0;
    let totaleNettoConti = 0;
    let totaleSaldoFinale = 0;

    let saldiContiMap = {};

    contiWalletGlobal.forEach(conto => {
        if (activeContiWallet.length > 0 && !activeContiWallet.includes(conto)) return;

        let isIncluded = !escludiSaldiContiWallet.includes(conto);

        let saldoIniz = saldiInizialiWallet[conto] || 0;
        let nettoPre = (entratePreConto[conto] || 0) - (spesePreConto[conto] || 0) + (trasferimentiPreConto[conto] || 0);
        let saldoInizioPeriodo = saldoIniz + nettoPre;

        let entrate = entratePerConto[conto] || 0;
        let spese = spesePerConto[conto] || 0;
        let trasferimenti = trasferimentiPerConto[conto] || 0;
        let netto = entrate - spese + trasferimenti;
        let saldoFin = saldoInizioPeriodo + netto;

        if (isIncluded) {
            totaleSaldoIniziale += saldoIniz;
            totaleSaldoInizioPeriodo += saldoInizioPeriodo;
            totaleEntrateConti += entrate;
            totaleSpeseConti += spese;
            totaleTrasferimentiConti += trasferimenti;
            totaleNettoConti += netto;
            totaleSaldoFinale += saldoFin;
        }

        saldiContiMap[conto] = saldoFin;

        htmlSaldiConti += `<tr style="${!isIncluded ? 'opacity: 0.5;' : ''}"><td style="text-align: center;"><input type="checkbox" ${isIncluded ? 'checked' : ''} onchange="toggleEsclusioneSaldoWallet('${conto}', this.checked)" title="Includi nei totali"></td><td><strong>${conto}</strong></td><td><input type="number" step="0.01" value="${saldoIniz}" onchange="salvaSaldoInizialeWallet('${conto}', this.value)" style="width: 110px; padding: 6px; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.9em; text-align: right;" ${!isIncluded ? 'disabled' : ''}></td><td style="color: #495057;">${formatEuro(saldoInizioPeriodo)}</td><td style="color: #28a745;">${formatEuro(entrate)}</td><td style="color: #dc3545;">${formatEuro(spese)}</td><td style="color: ${trasferimenti >= 0 ? '#0d6efd' : '#6f42c1'};">${formatEuro(trasferimenti)}</td><td style="color: ${netto >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">${formatEuro(netto)}</td><td style="font-weight: bold; color: #0d6efd;">${formatEuro(saldoFin)}</td></tr>`;
    });

    let tabellaSaldi = document.getElementById('corpo-tabella-saldi-conti');
    if (tabellaSaldi) {
        htmlSaldiConti += `<tr style="background-color: #f8f9fa; border-top: 2px solid #dee2e6;"><td></td><td><strong>TOTALE</strong></td><td><strong>${formatEuro(totaleSaldoIniziale)}</strong></td><td><strong>${formatEuro(totaleSaldoInizioPeriodo)}</strong></td><td style="color: #28a745; font-weight: bold;">${formatEuro(totaleEntrateConti)}</td><td style="color: #dc3545; font-weight: bold;">${formatEuro(totaleSpeseConti)}</td><td style="color: ${totaleTrasferimentiConti >= 0 ? '#0d6efd' : '#6f42c1'}; font-weight: bold;">${formatEuro(totaleTrasferimentiConti)}</td><td style="color: ${totaleNettoConti >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">${formatEuro(totaleNettoConti)}</td><td style="font-weight: bold; font-size: 1.1em; color: #0d6efd;">${formatEuro(totaleSaldoFinale)}</td></tr>`;
        tabellaSaldi.innerHTML = htmlSaldiConti;
    }

    // 1. Renderizzazione Card Account Top
    disegnaCardsContiWallet(saldiContiMap);

    // 2. Renderizzazione Flusso di Cassa & Trend sub-labels
    document.getElementById('flusso-kpi-netto').innerText = formatEuro(nettoCur);
    document.getElementById('flusso-kpi-entrate').innerText = formatEuro(entrateCur);
    document.getElementById('flusso-kpi-uscite').innerText = formatEuro(speseCur);

    let maxFlusso = Math.max(entrateCur, speseCur);
    let pctEntrate = maxFlusso > 0 ? (entrateCur / maxFlusso) * 100 : 0;
    let pctUscite = maxFlusso > 0 ? (speseCur / maxFlusso) * 100 : 0;

    document.getElementById('bar-entrate').style.width = pctEntrate + '%';
    document.getElementById('bar-uscite').style.width = pctUscite + '%';

    const formatDiff = (cur, prev, isExpense) => {
        if (walletFilter.type === 'all') return "";
        let diff = cur - prev;
        if (diff === 0 && prev === 0) return "";
        let pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;
        let arrow = diff >= 0 ? '▲' : '▼';
        let color = diff >= 0 ? (isExpense ? '#dc3545' : '#28a745') : (isExpense ? '#28a745' : '#dc3545');
        return `<span style="color: ${color}; background: ${color}20; padding: 2px 8px; border-radius: 12px;">${arrow} ${Math.abs(pct).toFixed(0)}%</span> <span style="color: #6c757d; font-weight: normal;">vs prec.</span>`;
    };

    document.getElementById('flusso-netto-sub').innerHTML = formatDiff(nettoCur, nettoPrev, false);
    // Usiamo il netto generato nel periodo come approssimazione del trend del saldo rispetto al periodo precedente
    document.getElementById('trend-saldo-sub').innerHTML = formatDiff(nettoCur, nettoPrev, false);

    // 3. Renderizzazione Gauges Tachimetro Panoramica
    if (gaugeSaldoObj) gaugeSaldoObj.destroy();
    if (gaugeFlussoObj) gaugeFlussoObj.destroy();
    if (gaugeSpeseObj) gaugeSpeseObj.destroy();

    const createGauge = (id, color, pct) => {
        if (pct < 0) pct = 0; if (pct > 100) pct = 100;
        let ctx = document.getElementById(id).getContext('2d');
        return new Chart(ctx, {
            type: 'doughnut',
            data: { datasets: [{ data: [pct, 100 - pct], backgroundColor: [color, '#f1f3f5'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, circumference: 180, rotation: 270, cutout: '80%', plugins: { tooltip: { enabled: false } } }
        });
    };

    // Creiamo un effetto visuale "pieno" basandoci su proporzioni visive gradevoli
    gaugeSaldoObj = createGauge('gaugeSaldo', '#fd7e14', totaleSaldoFinale > 0 ? 80 : 0);
    gaugeFlussoObj = createGauge('gaugeFlusso', '#20c997', entrateCur > 0 ? 75 : 0);
    gaugeSpeseObj = createGauge('gaugeSpese', '#dc3545', speseCur > 0 ? 60 : 0);

    document.getElementById('gauge-val-saldo').innerText = formatNumShort(totaleSaldoFinale);
    document.getElementById('gauge-val-flusso').innerText = formatNumShort(nettoCur);
    document.getElementById('gauge-val-spese').innerText = formatNumShort(speseCur);

    // 4. Renderizzazione Grafico Trend Saldo Cumulativo
    let mesiCumulativi = Object.keys(nettoMensileCur).sort();
    let trendLabels = [];
    let trendData = [];
    let runningBalance = totaleSaldoInizioPeriodo;

    if (mesiCumulativi.length === 0) {
        trendLabels = [(startCur.getFullYear() > 1970 ? startCur : new Date()).toISOString().split('T')[0]];
        trendData = [runningBalance];
    } else {
        mesiCumulativi.forEach(m => {
            trendLabels.push(m);
            runningBalance += nettoMensileCur[m];
            trendData.push(runningBalance);
        });
    }

    const ctxTrend = document.getElementById('graficoTrendSaldo').getContext('2d');
    if (trendSaldoObj !== null) trendSaldoObj.destroy();
    trendSaldoObj = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [{
                label: 'Saldo',
                data: trendData,
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHitRadius: 10
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return formatEuro(ctx.raw); } } } },
            scales: { x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: 6 } }, y: { display: false, min: Math.min(...trendData) * 0.9 } }
        }
    });

    document.getElementById('trend-saldo-kpi').innerText = formatEuro(totaleSaldoFinale);
}

function openPdfMappingModal(text) {
    document.getElementById('pdf-preview-content').innerText = text;
    document.getElementById('pdf_map_date').value = '';
    document.getElementById('pdf_map_asset_name').value = '';
    document.getElementById('pdf_map_operation_type').value = 'Buy';
    document.getElementById('pdf_map_price_per_share').value = '';
    document.getElementById('pdf_map_fees').value = '0';
    document.getElementById('pdf_map_quantity').value = '';
    document.getElementById('pdf_map_total_value').value = '';

    document.getElementById('pdf-mapping-modal').style.display = 'flex';
}

function assignSelectedTextToInput(inputId) {
    let selection = window.getSelection().toString().trim();
    if (selection) {
        document.getElementById(inputId).value = selection;
    } else {
        alert("Seleziona prima del testo nell'anteprima del PDF.");
    }
}

function parseLocalizedNumber(str) {
    if (!str) return 0;
    str = str.replace(/[€$\s+]/g, '');
    if (str.includes(',') && str.includes('.')) {
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            str = str.replace(/,/g, '');
        }
    } else {
        str = str.replace(',', '.');
    }
    return parseFloat(str) || 0;
}

async function confermaPdfMapping() {
    let asset_name = document.getElementById('pdf_map_asset_name').value.trim();
    let date = document.getElementById('pdf_map_date').value.trim();
    let operation_type = document.getElementById('pdf_map_operation_type').value;
    let price_per_share = parseLocalizedNumber(document.getElementById('pdf_map_price_per_share').value);
    let fees = parseLocalizedNumber(document.getElementById('pdf_map_fees').value);
    let quantity = parseLocalizedNumber(document.getElementById('pdf_map_quantity').value);
    let total_value = parseLocalizedNumber(document.getElementById('pdf_map_total_value').value);
    let asset_type = 'ETF';

    if (!asset_name || !date || !price_per_share || !quantity) {
        alert("Compila tutti i campi obbligatori (Data, Strumento, Prezzo, Quantità).");
        return;
    }

    if (total_value === 0) {
        total_value = (price_per_share * quantity) + (operation_type === 'Buy' ? fees : -fees);
    }

    let formattedDate = date;
    if (date.includes('/')) {
        let parts = date.split('/');
        if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else if (date.includes('.')) {
        let parts = date.split('.');
        if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    let nuovaTransazione = {
        date: formattedDate, asset_name: asset_name, operation_type: operation_type,
        price_per_share: price_per_share, fees: fees, quantity: quantity, total_value: total_value, asset_type: asset_type
    };

    try {
        let risposta = await fetch('/api/transactions?portfolio_id=' + activePortfolioId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuovaTransazione)
        });

        if (risposta.ok) {
            alert("Transazione importata con successo!");
            document.getElementById('pdf-mapping-modal').style.display = 'none';
            document.getElementById('file-pdf').value = '';
            document.getElementById('loading-grafico').style.display = 'block';
            document.getElementById('loading-grafico').innerText = "Aggiornamento dati...";
            caricaDati();
        } else {
            let res = await risposta.json();
            alert("Errore: " + (res.errore || "Impossibile salvare la transazione."));
        }
    } catch (e) { alert("Errore di rete."); }
}

// 9.1 IMPORTA SINGOLA TRANSAZIONE DA PDF
async function importaPDF(event) {
    let file = event.target.files[0];
    if (!file) return;

    let fonte = document.getElementById('fonte-pdf').value;

    if (fonte === 'Custom') {
        let formData = new FormData();
        formData.append("file", file);
        document.getElementById('loading-grafico').style.display = 'block';
        document.getElementById('loading-grafico').innerText = "Estrazione testo dal PDF in corso...";
        try {
            let res = await fetch('/api/preview_pdf', { method: 'POST', body: formData });
            document.getElementById('loading-grafico').style.display = 'none';
            if (!res.ok) {
                let err = await res.json();
                alert(err.errore || "Errore nella lettura del file");
                event.target.value = '';
                return;
            }
            let data = await res.json();
            openPdfMappingModal(data.text);
        } catch (e) { alert("Errore di rete"); event.target.value = ''; document.getElementById('loading-grafico').style.display = 'none'; }
        return;
    }

    let formData = new FormData();
    formData.append("file", file);
    formData.append("fonte", fonte);

    document.getElementById('loading-grafico').style.display = 'block';
    document.getElementById('loading-grafico').innerText = "Analisi del PDF in corso...";
    document.getElementById('graficoAndamento').style.display = 'none';

    try {
        let risposta = await fetch('/api/import_pdf?portfolio_id=' + activePortfolioId, { method: 'POST', body: formData });
        let result = await risposta.json();

        if (risposta.ok) {
            alert(result.messaggio);
            caricaDati();
        } else {
            alert(result.errore || "Errore durante l'importazione.");
            caricaDati();
        }
    } catch (error) {
        alert("Errore di rete durante l'importazione del PDF.");
    } finally {
        event.target.value = ''; // Resetta l'input per permettere nuovi caricamenti
    }
}

// --- 10. FUNZIONI WALLET BUDGETBAKERS ---
/*
async function caricaTokenWallet() {
    try {
        let risposta = await fetch('/api/config/wallet_token');
        let data = await risposta.json();
        if (data.token) {
            document.getElementById('wallet-token').value = data.token;
        }
    } catch (e) {
        console.error("Errore caricamento token:", e);
    }
}

async function salvaTokenWallet() {
    let token = document.getElementById('wallet-token').value.trim();
    if (!token) {
        alert("Inserisci un token valido.");
        return;
    }
    try {
        let risposta = await fetch('/api/config/wallet_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token })
        });
        if (risposta.ok) {
            alert("Token salvato con successo!");
        }
    } catch (e) {
        alert("Errore nel salvataggio del token.");
    }
}

async function syncWallet() {
    let token = document.getElementById('wallet-token').value.trim();
    if (!token) {
        alert("Salva prima un token API valido.");
        return;
    }
    
    document.getElementById('loading-wallet').style.display = 'block';
    
    try {
        let risposta = await fetch('/api/wallet/sync', { method: 'POST' });
        let data = await risposta.json();
        if (risposta.ok) {
            await caricaSaldiWallet();
        } else {
            alert(data.errore || "Errore durante la sincronizzazione.");
        }
    } catch (e) {
        alert("Errore di rete durante la sincronizzazione.");
    } finally {
        document.getElementById('loading-wallet').style.display = 'none';
    }
}

async function caricaSaldiWallet() {
    try {
        let risposta = await fetch('/api/wallet/saldi');
        let datiSaldi = await risposta.json();
        
        if (datiSaldi.length === 0) {
            let ndw = document.getElementById('no-data-wallet');
            if (ndw) ndw.style.display = 'block';
            if (graficoSaldiObj !== null) {
                graficoSaldiObj.destroy();
                graficoSaldiObj = null;
            }
            return;
        }
        
        let ndw = document.getElementById('no-data-wallet');
        if (ndw) ndw.style.display = 'none';
        
        let dateSet = new Set();
        let accountNames = new Set();
        datiSaldi.forEach(r => {
            dateSet.add(r.data);
            accountNames.add(r.account_name);
        });

        let dates = Array.from(dateSet).sort();
        let datasets = [];
        let accountList = Array.from(accountNames);
        let colors = ['#0d6efd', '#28a745', '#ffc107', '#dc3545', '#6f42c1', '#17a2b8', '#fd7e14', '#20c997', '#e83e8c', '#6610f2'];

        accountList.forEach((accName, index) => {
            let dataForAcc = [];
            let lastBalance = 0;
            dates.forEach(d => {
                let record = datiSaldi.find(r => r.data === d && r.account_name === accName);
                if (record) lastBalance = record.saldo; // Mantiene il saldo precedente se non è stato letto un aggiornamento quel giorno
                dataForAcc.push(lastBalance);
            });
            
            datasets.push({
                label: accName,
                data: dataForAcc,
                backgroundColor: colors[index % colors.length] + '40',
                borderColor: colors[index % colors.length],
                fill: true,
                borderWidth: 2,
                tension: 0.1,
                pointRadius: 3
            });
        });

        if (graficoSaldiObj !== null) graficoSaldiObj.destroy();
        const ctx = document.getElementById('graficoSaldiWallet').getContext('2d');
        graficoSaldiObj = new Chart(ctx, {
            type: 'line',
            data: { labels: dates, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 10 } },
                    tooltip: {
                        callbacks: {
                            label: function(context) { return context.dataset.label + ': ' + formatEuro(context.raw); },
                            footer: function(tooltipItems) {
                                let total = 0;
                                tooltipItems.forEach(function(ti) { total += ti.parsed.y; });
                                return 'Totale Liquido: ' + formatEuro(total);
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { 
                        stacked: true, grid: { color: '#f1f3f5' },
                        ticks: { callback: function(value) { return '€' + value.toLocaleString('it-IT'); } }
                    }
                }
            }
        });
    } catch (e) {
        console.error("Errore nel caricamento del grafico saldi:", e);
    }
}
*/

// --- 11. AGGIORNAMENTO AUTOMATICO UI (ORE 17:00) ---
function scheduleDailyUpdate() {
    let now = new Date();
    // Impostiamo l'aggiornamento UI alle 17:00:10 (10 secondi dopo l'avvio del task backend)
    let targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 10, 0);
    let millisTillTarget = targetTime - now;

    if (millisTillTarget < 0) {
        millisTillTarget += 86400000; // Se sono già passate le 17:00:10, schedula per domani (+24h in ms)
    }

    setTimeout(function () {
        console.log("Esecuzione aggiornamento automatico della dashboard (17:00:10)");
        handleReload();
        scheduleDailyUpdate(); // Riprogramma per il giorno successivo
    }, millisTillTarget);
}

// --- FILTRI TABELLE ---
function filtraTabella(tbodyId, query) {
    let tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    let trs = tbody.getElementsByTagName('tr');
    let filtro = query.toLowerCase();
    for (let i = 0; i < trs.length; i++) {
        let textVal = trs[i].textContent || trs[i].innerText;
        if (textVal.toLowerCase().indexOf(filtro) > -1) {
            trs[i].style.display = "";
        } else {
            trs[i].style.display = "none";
        }
    }
}

// --- PAGINAZIONE WALLET ---
let currentPageWallet = 1;
let itemsPerPageWallet = 20;
let currentFiltertestoWallet = "";
let currentFilterContoWallet = [];
let currentFilterCategoriaWallet = [];
let transazioniValideWallet = [];

// --- TABLE DATE WIDGET (shared with walletFilter) ---
let tdfUiMesiYear = new Date().getFullYear();
let tdfUiDecadeStart = Math.floor(new Date().getFullYear() / 10) * 10;

function initTableDateFilter() {
    aggiornaTableDateUI();
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('table-date-filter-wrapper');
        const popover = document.getElementById('table-date-filter-popover');
        if (wrapper && popover && !wrapper.contains(e.target)) {
            popover.style.display = 'none';
        }
    }, true);
}

function toggleTableDateFilter() {
    const pop = document.getElementById('table-date-filter-popover');
    if (!pop) return;
    const isVisible = pop.style.display !== 'none';
    pop.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        const tab = walletFilter.type === 'all' ? 'all' : (walletFilter.type === 'month' ? 'months' : walletFilter.type === 'custom' ? 'custom' : 'years');
        switchTableDateTab(tab);
    }
}

function switchTableDateTab(tab) {
    ['custom','months','years','all'].forEach(t => {
        const btn = document.getElementById('tdf-btn-' + t);
        const content = document.getElementById('tdf-tab-' + t);
        if (btn) btn.classList.remove('active');
        if (content) content.style.display = 'none';
    });
    const activeBtn = document.getElementById('tdf-btn-' + tab);
    const activeContent = document.getElementById('tdf-tab-' + tab);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.style.display = '';
    if (tab === 'months') renderTableGridMesi();
    if (tab === 'years') renderTableGridAnni();
}

function renderTableGridMesi() {
    const label = document.getElementById('tdf-mesi-anno-label');
    if (label) label.textContent = tdfUiMesiYear;
    const grid = document.getElementById('tdf-grid-mesi');
    if (!grid) return;
    const nomi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    grid.innerHTML = nomi.map((m, i) => {
        const isActive = walletFilter.type === 'month' && walletFilter.month === i && walletFilter.year === tdfUiMesiYear;
        return `<div class="date-grid-btn ${isActive ? 'active' : ''}" onclick="selezionaTableMese(${tdfUiMesiYear}, ${i})">${m}</div>`;
    }).join('');
}

function renderTableGridAnni() {
    const label = document.getElementById('tdf-anni-decennio-label');
    if (label) label.textContent = tdfUiDecadeStart + ' – ' + (tdfUiDecadeStart + 9);
    const grid = document.getElementById('tdf-grid-anni');
    if (!grid) return;
    let html = '';
    for (let y = tdfUiDecadeStart; y < tdfUiDecadeStart + 10; y++) {
        const isActive = walletFilter.type === 'year' && walletFilter.year === y;
        html += `<div class="date-grid-btn ${isActive ? 'active' : ''}" onclick="selezionaTableAnno(${y})">${y}</div>`;
    }
    grid.innerHTML = html;
}

function cambiaTableAnnoMesi(dir) { tdfUiMesiYear += dir; renderTableGridMesi(); }
function cambiaTableDecennio(dir) { tdfUiDecadeStart += dir * 10; renderTableGridAnni(); }

function selezionaTableMese(year, month) {
    walletFilter.type = 'month'; walletFilter.year = year; walletFilter.month = month;
    uiMesiYear = year;
    document.getElementById('table-date-filter-popover').style.display = 'none';
    applicaFiltroWalletUI(true);
}

function selezionaTableAnno(year) {
    walletFilter.type = 'year'; walletFilter.year = year;
    uiAnniDecadeStart = Math.floor(year / 10) * 10;
    document.getElementById('table-date-filter-popover').style.display = 'none';
    applicaFiltroWalletUI(true);
}

function applicaTableFiltroCustom() {
    const from = document.getElementById('tdf-date-from')?.value;
    const to = document.getElementById('tdf-date-to')?.value;
    if (!from || !to) return;
    walletFilter.type = 'custom'; walletFilter.customFrom = from; walletFilter.customTo = to;
    document.getElementById('table-date-filter-popover').style.display = 'none';
    applicaFiltroWalletUI(true);
}

function resetTableFilter() {
    walletFilter.type = 'all';
    const pop = document.getElementById('table-date-filter-popover');
    if (pop) pop.style.display = 'none';
    applicaFiltroWalletUI(true);
}

function spostaTableFiltro(dir) {
    spostaPeriodoFiltro(dir);
}

function aggiornaTableDateUI() {
    const el = document.getElementById('table-date-filter-text');
    if (!el) return;
    const nomi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    if (walletFilter.type === 'all') el.textContent = 'Tutto lo storico';
    else if (walletFilter.type === 'year') el.textContent = walletFilter.year;
    else if (walletFilter.type === 'month') el.textContent = nomi[walletFilter.month] + ' ' + walletFilter.year;
    else if (walletFilter.type === 'custom') {
        let df = walletFilter.customFrom.split('-'); let dt = walletFilter.customTo.split('-');
        el.textContent = `${df[2]}/${df[1]}/${df[0].substring(2)} - ${dt[2]}/${dt[1]}/${dt[0].substring(2)}`;
    }
}


function applicaFiltriWallet() {
    const tDOM = document.getElementById('filtroWalletTesto');
    currentFiltertestoWallet = tDOM ? tDOM.value.toLowerCase() : "";
    currentPageWallet = 1;
    renderTabellaWallet();
}

function toggleFiltroPill(tipo, valore) {
    let arr = tipo === 'conto' ? currentFilterContoWallet : currentFilterCategoriaWallet;
    
    if (valore === "") {
        arr.length = 0; 
    } else {
        const index = arr.indexOf(valore);
        if (index > -1) {
            arr.splice(index, 1);
        } else {
            arr.push(valore);
        }
    }
    
    renderFiltroPills(tipo);
    applicaFiltriWallet();
}

function renderFiltroPills(tipo) {
    const arr = tipo === 'conto' ? currentFilterContoWallet : currentFilterCategoriaWallet;
    const containerId = tipo === 'conto' ? 'filtroWalletConto' : 'filtroWalletCategoria';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    Array.from(container.children).forEach(pill => {
        let val = pill.getAttribute('data-value');
        if ((val === "" && arr.length === 0) || (val !== "" && arr.includes(val))) {
            pill.style.background = '#0d6efd';
            pill.style.color = 'white';
            pill.style.borderColor = '#0d6efd';
        } else {
            pill.style.background = '#f8f9fa';
            pill.style.color = '#333';
            pill.style.borderColor = '#ced4da';
        }
    });
}

function popolaFiltroPills(tipo, opzioni) {
    const containerId = tipo === 'conto' ? 'filtroWalletConto' : 'filtroWalletCategoria';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let labelTutti = document.documentElement.lang === 'it' ? (tipo === 'conto' ? 'Tutti i Conti' : 'Tutte le Categorie') : (tipo === 'conto' ? 'All Accounts' : 'All Categories');
    
    let html = `<div onclick="toggleFiltroPill('${tipo}', '')" data-value="" style="padding: 4px 10px; border-radius: 12px; border: 1px solid #ced4da; font-size: 0.85em; cursor: pointer; user-select: none; transition: 0.2s;">${labelTutti}</div>`;
    
    opzioni.forEach(opt => {
        html += `<div onclick="toggleFiltroPill('${tipo}', '${opt}')" data-value="${opt}" style="padding: 4px 10px; border-radius: 12px; border: 1px solid #ced4da; font-size: 0.85em; cursor: pointer; user-select: none; transition: 0.2s;">${opt}</div>`;
    });
    
    container.innerHTML = html;
    renderFiltroPills(tipo);
}


function cambiaPaginaWallet(delta) {
    currentPageWallet += delta;
    renderTabellaWallet();
}

function renderTabellaWallet() {
    let filtrate = transazioniValideWallet;
    if (currentFiltertestoWallet) {
        filtrate = filtrate.filter(t => {
            let dParts = t.dataStr.split('-');
            let dataVis = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}/${dParts[0]}` : t.dataStr;
            let fullText = `${dataVis} ${t.conto} ${t.cat} ${t.note || ''} ${t.importo}`.toLowerCase();
            return fullText.includes(currentFiltertestoWallet);
        });
    }
    if (currentFilterContoWallet && currentFilterContoWallet.length > 0) {
        filtrate = filtrate.filter(t => currentFilterContoWallet.includes(t.conto));
    }
    if (currentFilterCategoriaWallet && currentFilterCategoriaWallet.length > 0) {
        filtrate = filtrate.filter(t => currentFilterCategoriaWallet.includes(t.cat));
    }


    let totaleFiltrato = 0;
    filtrate.forEach(t => {
        if (!t.isTransfer) {
            totaleFiltrato += (t.importo || 0);
        }
    });

    let totalePagine = Math.ceil(filtrate.length / itemsPerPageWallet) || 1;
    if (currentPageWallet < 1) currentPageWallet = 1;
    if (currentPageWallet > totalePagine) currentPageWallet = totalePagine;

    let start = (currentPageWallet - 1) * itemsPerPageWallet;
    let end = start + itemsPerPageWallet;
    let paginated = filtrate.slice(start, end);

    let tutteCategorie = [...new Set(transazioniWalletGlobal.map(tg => tg.category || "Altro"))].sort();

    let htmlRighe = "";
    paginated.forEach(t => {
        let dParts = t.dataStr.split('-');
        let dataVis = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}/${dParts[0]}` : t.dataStr;
        let coloreImporto = '#212529';
        if (t.isTransfer) {
            coloreImporto = t.importo > 0 ? '#0d6efd' : (t.importo < 0 ? '#6f42c1' : '#212529');
        } else {
            coloreImporto = t.importo > 0 ? '#28a745' : (t.importo < 0 ? '#dc3545' : '#212529');
        }
        
        let selectCat = `<select onchange="aggiornaCategoriaWallet(${t.id}, this.value)" style="border: 1px solid #ced4da; border-radius: 4px; padding: 4px; font-size: 0.9em; cursor: pointer; max-width: 150px;">`;
        let catAttuale = t.cat.replace(' (Trasf.)', '');
        let optionTrovata = false;
        tutteCategorie.forEach(c => {
            let selected = (c === catAttuale) ? 'selected' : '';
            if (c === catAttuale) optionTrovata = true;
            selectCat += `<option value="${c.replace(/"/g, '&quot;')}" ${selected}>${c}</option>`;
        });
        if (!optionTrovata) {
            selectCat += `<option value="${catAttuale.replace(/"/g, '&quot;')}" selected>${catAttuale}</option>`;
        }
        selectCat += `</select>`;
        if (t.isTransfer) {
            selectCat += ' <span style="font-size:0.8em; color:#6c757d;">(Trasf.)</span>';
        }

        htmlRighe += `<tr><td style="text-align: center;"><input type="checkbox" class="wallet-row-checkbox" value="${t.id}" onchange="aggiornaStatoEliminaWallet()"></td><td>${dataVis}</td><td>${t.conto}</td><td>${selectCat}</td><td>${t.note || ''}</td><td style="color: ${coloreImporto}; font-weight: bold;">${formatEuro(t.importo)}</td></tr>`;
    });

    if (filtrate.length === 0) {
        htmlRighe = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">${window.Translations.noTransactionsFound || 'No transactions found.'}</td></tr>`;
    }
    document.getElementById("corpo-tabella-wallet").innerHTML = htmlRighe;
    
    // Resetta master checkbox
    let masterCb = document.getElementById('selectAllWallet');
    if (masterCb) masterCb.checked = false;
    aggiornaStatoEliminaWallet();

    let btnPrev = `<button onclick="cambiaPaginaWallet(-1)" ${currentPageWallet === 1 ? 'disabled' : ''} style="padding: 5px 10px; margin-right: 5px; cursor: ${currentPageWallet === 1 ? 'not-allowed' : 'pointer'}; border: 1px solid #ced4da; background-color: #f8f9fa; border-radius: 4px;">&laquo; Precedente</button>`;
    let btnNext = `<button onclick="cambiaPaginaWallet(1)" ${currentPageWallet === totalePagine ? 'disabled' : ''} style="padding: 5px 10px; margin-left: 5px; cursor: ${currentPageWallet === totalePagine ? 'not-allowed' : 'pointer'}; border: 1px solid #ced4da; background-color: #f8f9fa; border-radius: 4px;">Successivo &raquo;</button>`;
    
    let labelTotale = document.documentElement.lang === 'it' ? 'Totale transazioni' : 'Total transactions';
    let pagHtml = `<div style="text-align: center; margin-top: 15px; display: flex; justify-content: center; align-items: center; color: #495057;">${btnPrev} <span style="margin: 0 15px;">Pagina ${currentPageWallet} di ${totalePagine} (${labelTotale}: ${filtrate.length})</span> ${btnNext}</div>`;

    let container = document.getElementById("paginazione-wallet-container");
    if (container) {
        container.innerHTML = pagHtml;
    }

    let saldoFiltriDOM = document.getElementById("wallet-saldo-filtri");
    if (saldoFiltriDOM) {
        let labelSaldo = document.documentElement.lang === 'it' ? 'Saldo filtri' : 'Filtered balance';
        saldoFiltriDOM.innerHTML = `(${labelSaldo}: <span style="color: ${totaleFiltrato >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">${formatEuro(totaleFiltrato)}</span>)`;
    }
}

// --- PAGINAZIONE INVESTIMENTI ---
let currentPageInvestimenti = 1;
let itemsPerPageInvestimenti = 20;
let currentFiltertestoInvestimenti = "";
let currentFilterStrumentoInv = [];
let currentFilterTipoAssetInv = [];
let currentFilterTipoOpInv = [];
let transazioniValideInvestimenti = [];

function applicaFiltriInvestimenti() {
    const tDOM = document.getElementById('filtroInvestimentiTesto');
    currentFiltertestoInvestimenti = tDOM ? tDOM.value.toLowerCase() : "";
    currentPageInvestimenti = 1;
    renderTabellaInvestimenti();
}

function toggleFiltroPillInv(tipo, valore) {
    let arr = tipo === 'strumento' ? currentFilterStrumentoInv
             : tipo === 'tipoAsset' ? currentFilterTipoAssetInv
             : currentFilterTipoOpInv;
    if (valore === "") {
        arr.length = 0;
    } else {
        const idx = arr.indexOf(valore);
        if (idx > -1) arr.splice(idx, 1); else arr.push(valore);
    }
    renderFiltroPillsInv(tipo);
    currentPageInvestimenti = 1;
    renderTabellaInvestimenti();
}

function renderFiltroPillsInv(tipo) {
    const arr = tipo === 'strumento' ? currentFilterStrumentoInv
               : tipo === 'tipoAsset' ? currentFilterTipoAssetInv
               : currentFilterTipoOpInv;
    const containerId = tipo === 'strumento' ? 'filtroInvStrumento'
                      : tipo === 'tipoAsset' ? 'filtroInvTipoAsset'
                      : 'filtroInvTipoOp';
    const container = document.getElementById(containerId);
    if (!container) return;
    Array.from(container.children).forEach(pill => {
        const val = pill.getAttribute('data-value');
        const active = (val === "" && arr.length === 0) || (val !== "" && arr.includes(val));
        pill.style.background = active ? '#0d6efd' : '#f8f9fa';
        pill.style.color = active ? 'white' : '#333';
        pill.style.borderColor = active ? '#0d6efd' : '#ced4da';
    });
}

function popolaFiltroPillsInv(tipo, opzioni) {
    const containerId = tipo === 'strumento' ? 'filtroInvStrumento'
                      : tipo === 'tipoAsset' ? 'filtroInvTipoAsset'
                      : 'filtroInvTipoOp';
    const container = document.getElementById(containerId);
    if (!container) return;
    const isIt = document.documentElement.lang === 'it';
    const labelTutti = tipo === 'strumento' ? (isIt ? 'Tutti' : 'All')
                     : tipo === 'tipoAsset' ? (isIt ? 'Tutti' : 'All')
                     : (isIt ? 'Tutti' : 'All');
    let html = `<div onclick="toggleFiltroPillInv('${tipo}', '')" data-value="" style="padding: 4px 10px; border-radius: 12px; border: 1px solid #ced4da; font-size: 0.82em; cursor: pointer; user-select: none; transition: 0.2s; white-space: nowrap;">${labelTutti}</div>`;
    opzioni.forEach(opt => {
        const safeOpt = opt.replace(/'/g, "\\'");
        html += `<div onclick="toggleFiltroPillInv('${tipo}', '${safeOpt}')" data-value="${opt}" style="padding: 4px 10px; border-radius: 12px; border: 1px solid #ced4da; font-size: 0.82em; cursor: pointer; user-select: none; transition: 0.2s; white-space: nowrap;">${opt}</div>`;
    });
    container.innerHTML = html;
    renderFiltroPillsInv(tipo);
}

function applicaFiltroInvestimentiTesto(testo) {
    currentFiltertestoInvestimenti = testo.toLowerCase();
    currentPageInvestimenti = 1;
    renderTabellaInvestimenti();
}


function cambiaPaginaInvestimenti(delta) {
    currentPageInvestimenti += delta;
    renderTabellaInvestimenti();
}

function renderTabellaInvestimenti() {
    let filtrate = transazioniValideInvestimenti;
    if (currentFiltertestoInvestimenti) {
        filtrate = filtrate.filter(t => {
            let fullText = `${t.date} ${t.ticker} ${t.asset_name} ${t.operation_type} ${t.price_per_share} ${t.quantity} ${t.total_value}`.toLowerCase();
            return fullText.includes(currentFiltertestoInvestimenti);
        });
    }
    if (currentFilterStrumentoInv && currentFilterStrumentoInv.length > 0) {
        filtrate = filtrate.filter(t => currentFilterStrumentoInv.includes(t.ticker ? t.ticker.toUpperCase() : ''));
    }
    if (currentFilterTipoAssetInv && currentFilterTipoAssetInv.length > 0) {
        filtrate = filtrate.filter(t => currentFilterTipoAssetInv.includes(t.asset_type));
    }
    if (currentFilterTipoOpInv && currentFilterTipoOpInv.length > 0) {
        filtrate = filtrate.filter(t => currentFilterTipoOpInv.includes(t.operation_type));
    }
    
    // Popola pill filters con i valori univoci presenti nel dataset
    const strumentiUnici = [...new Set(transazioniValideInvestimenti.map(t => t.ticker ? t.ticker.toUpperCase() : '').filter(Boolean))].sort();
    const tipiAssetUnici = [...new Set(transazioniValideInvestimenti.map(t => t.asset_type).filter(Boolean))].sort();
    const tipiOpUnici = [...new Set(transazioniValideInvestimenti.map(t => t.operation_type).filter(Boolean))].sort();
    popolaFiltroPillsInv('strumento', strumentiUnici);
    popolaFiltroPillsInv('tipoAsset', tipiAssetUnici);
    popolaFiltroPillsInv('tipoOp', tipiOpUnici);

    // Ordina sempre dalla più recente alla meno recente (opzionale ma utile)
    filtrate.sort((a, b) => new Date(b.date) - new Date(a.date));

    let totalePagine = Math.ceil(filtrate.length / itemsPerPageInvestimenti) || 1;
    if (currentPageInvestimenti < 1) currentPageInvestimenti = 1;
    if (currentPageInvestimenti > totalePagine) currentPageInvestimenti = totalePagine;

    let start = (currentPageInvestimenti - 1) * itemsPerPageInvestimenti;
    let end = start + itemsPerPageInvestimenti;
    let paginated = filtrate.slice(start, end);

    let isIt = document.documentElement.lang === 'it';
    let htmlRighe = "";
    paginated.forEach(transazione => {
        let tipoOp = transazione.operation_type;
        if (!isIt) {
            if (tipoOp === 'Buy' || tipoOp === 'Acquisto') tipoOp = 'Purchase';
            else if (tipoOp === 'Sell' || tipoOp === 'Vendita') tipoOp = 'Sale';
            else if (tipoOp === 'Dividend' || tipoOp === 'Dividendo') tipoOp = 'Div.';
        }

        let selectTipoAsset = `
                    <select onchange="aggiornaTipoAsset('${transazione.asset_name}', this.value)" style="border: 1px solid #ced4da; border-radius: 4px; padding: 4px; font-size: 0.9em; cursor: pointer;">
                        <option value="ETF" ${transazione.asset_type === 'ETF' ? 'selected' : ''}>ETF</option>
                        <option value="Single Stocks" ${transazione.asset_type === 'Single Stocks' || transazione.asset_type === 'Azioni singole' ? 'selected' : ''}>${isIt ? 'Azioni singole' : 'Single Stocks'}</option>
                        <option value="Single Bonds" ${transazione.asset_type === 'Single Bonds' || transazione.asset_type === 'Obbligazioni Singole' ? 'selected' : ''}>${isIt ? 'Obbligazioni Singole' : 'Single Bonds'}</option>
                        <option value="Gold" ${transazione.asset_type === 'Gold' || transazione.asset_type === 'Oro' ? 'selected' : ''}>${isIt ? 'Oro' : 'Gold'}</option>
                        <option value="Bitcoin" ${transazione.asset_type === 'Bitcoin' ? 'selected' : ''}>Bitcoin</option>
                        <option value="Cash" ${transazione.asset_type === 'Cash' || transazione.asset_type === 'Liquidità' ? 'selected' : ''}>${isIt ? 'Liquidità' : 'Cash'}</option>
                    </select>
                `;
        htmlRighe += `
                    <tr>
                        <td><button class="btn-elimina" onclick="eliminaTransazione(${transazione.id})" title="${isIt ? 'Elimina transazione' : 'Delete transaction'}">×</button></td>
                        <td>${transazione.date}</td>
                        <td>
                            <strong>${transazione.ticker ? transazione.ticker.toUpperCase() : ''}</strong>
                            <div style="font-size: 0.8em; color: #6c757d;">${transazione.asset_name ? transazione.asset_name.toUpperCase() : ''}</div>
                        </td>
                        <td>${selectTipoAsset}</td>
                        <td>${tipoOp}</td>
                        <td>${transazione.price_per_share ? transazione.price_per_share.toFixed(3) : 0}</td>
                        <td>${transazione.fees ? transazione.fees.toFixed(2) : 0}</td>
                        <td>${transazione.quantity}</td>
                        <td>${transazione.total_value ? transazione.total_value.toFixed(2) : 0}</td>
                    </tr>
                `;
    });

    if (filtrate.length === 0) {
        htmlRighe = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 20px;">${window.Translations.noTransactionsFound || 'No transactions found.'}</td></tr>`;
    }
    document.getElementById("corpo-tabella").innerHTML = htmlRighe;

    let btnPrev = `<button onclick="cambiaPaginaInvestimenti(-1)" ${currentPageInvestimenti === 1 ? 'disabled' : ''} style="padding: 5px 10px; margin-right: 5px; cursor: ${currentPageInvestimenti === 1 ? 'not-allowed' : 'pointer'}; border: 1px solid #ced4da; background-color: #f8f9fa; border-radius: 4px;">&laquo; Precedente</button>`;
    let btnNext = `<button onclick="cambiaPaginaInvestimenti(1)" ${currentPageInvestimenti === totalePagine ? 'disabled' : ''} style="padding: 5px 10px; margin-left: 5px; cursor: ${currentPageInvestimenti === totalePagine ? 'not-allowed' : 'pointer'}; border: 1px solid #ced4da; background-color: #f8f9fa; border-radius: 4px;">Successivo &raquo;</button>`;
    let pagHtml = `<div style="text-align: center; margin-top: 15px; display: flex; justify-content: center; align-items: center; color: #495057;">${btnPrev} <span style="margin: 0 15px;">Pagina ${currentPageInvestimenti} di ${totalePagine} (Totale transazioni: ${filtrate.length})</span> ${btnNext}</div>`;

    let container = document.getElementById("paginazione-investimenti-container");
    if (container) {
        container.innerHTML = pagHtml;
    }
}

// --- LOGICA BOLLETTE & CONSUMI ---
let bolletteGlobal = [];
let bolletteConfigGlobal = { water_unit: 'm³', electricity_unit: 'kWh', gas_unit: 'Smc' };
let graficoBolletteObj = null;
let activeVisualizzazioneBollette = 'price';

function cambiaVisualizzazioneBollette(tipo) {
    activeVisualizzazioneBollette = tipo;
    const btnPrice = document.getElementById('btn-bollette-view-price');
    const btnCons = document.getElementById('btn-bollette-view-consumption');
    if (btnPrice) btnPrice.classList.toggle('active', tipo === 'price');
    if (btnCons) btnCons.classList.toggle('active', tipo === 'consumption');
    disegnaGraficoBollette();
}

async function caricaDatiBollette() {
    if (!activeBillsId) return;
    try {
        // Carica impostazioni unità
        let resConfig = await fetch(`/api/bills/config?bills_id=${activeBillsId}`);
        if (resConfig.ok) {
            bolletteConfigGlobal = await resConfig.json();
        }
        
        // Aggiorna le etichette nei modal e form
        document.querySelectorAll('.unit-water-lbl').forEach(el => el.innerText = bolletteConfigGlobal.water_unit);
        document.querySelectorAll('.unit-electricity-lbl').forEach(el => el.innerText = bolletteConfigGlobal.electricity_unit);
        document.querySelectorAll('.unit-gas-lbl').forEach(el => el.innerText = bolletteConfigGlobal.gas_unit);
        
        // Carica i dati delle bollette
        let resBills = await fetch(`/api/bills?bills_id=${activeBillsId}`);
        if (resBills.ok) {
            bolletteGlobal = await resBills.json();
            aggiornaKPIBollette();
            disegnaGraficoBollette();
            popolaTabellaBollette();
        }
    } catch (error) {
        console.error("Errore nel caricamento bollette:", error);
    }
}

function aggiornaKPIBollette() {
    const kpiAcquaCosto = document.getElementById('kpi-acqua-costo');
    const kpiAcquaConsumo = document.getElementById('kpi-acqua-consumo');
    const kpiLuceCosto = document.getElementById('kpi-luce-costo');
    const kpiLuceConsumo = document.getElementById('kpi-luce-consumo');
    const kpiGasCosto = document.getElementById('kpi-gas-costo');
    const kpiGasConsumo = document.getElementById('kpi-gas-consumo');
    
    if (!kpiAcquaCosto) return;
    
    if (bolletteGlobal && bolletteGlobal.length > 0) {
        const latest = bolletteGlobal[0]; // ordinati DESC per data
        const meseNomi = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
        const dataStr = `${meseNomi[latest.month - 1]} ${latest.year}`;
        
        kpiAcquaCosto.innerText = formatEuro(latest.water_price);
        kpiAcquaConsumo.innerText = `${latest.water_consumption.toFixed(1)} ${bolletteConfigGlobal.water_unit} (${dataStr})`;
        
        kpiLuceCosto.innerText = formatEuro(latest.electricity_price);
        kpiLuceConsumo.innerText = `${latest.electricity_consumption.toFixed(1)} ${bolletteConfigGlobal.electricity_unit} (${dataStr})`;
        
        kpiGasCosto.innerText = formatEuro(latest.gas_price);
        kpiGasConsumo.innerText = `${latest.gas_consumption.toFixed(1)} ${bolletteConfigGlobal.gas_unit} (${dataStr})`;
    } else {
        kpiAcquaCosto.innerText = "-";
        kpiAcquaConsumo.innerText = "-";
        kpiLuceCosto.innerText = "-";
        kpiLuceConsumo.innerText = "-";
        kpiGasCosto.innerText = "-";
        kpiGasConsumo.innerText = "-";
    }
}

function disegnaGraficoBollette() {
    const canvas = document.getElementById('graficoBollette');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (graficoBolletteObj) {
        graficoBolletteObj.destroy();
        graficoBolletteObj = null;
    }
    
    // Ordine cronologico crescente (da più vecchio a più recente) per il grafico
    const billsSorted = [...bolletteGlobal].reverse();
    
    const labels = [];
    const waterData = [];
    const electricityData = [];
    const gasData = [];
    
    const lang = document.documentElement.lang || 'en';
    const meseNomi = lang.startsWith('it') 
        ? ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
        : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    billsSorted.forEach(b => {
        labels.push(`${meseNomi[b.month - 1]} ${b.year}`);
        if (activeVisualizzazioneBollette === 'price') {
            waterData.push(b.water_price);
            electricityData.push(b.electricity_price);
            gasData.push(b.gas_price);
        } else {
            waterData.push(b.water_consumption);
            electricityData.push(b.electricity_consumption);
            gasData.push(b.gas_consumption);
        }
    });
    
    const isPrice = activeVisualizzazioneBollette === 'price';
    
    const labelWater = window.Translations.water || 'Water';
    const labelElectricity = window.Translations.electricity || 'Electricity';
    const labelGas = window.Translations.gas || 'Gas';

    const datasets = [
        {
            label: isPrice ? `${labelWater} (€)` : `${labelWater} (${bolletteConfigGlobal.water_unit})`,
            data: waterData,
            backgroundColor: 'rgba(14, 165, 233, 0.7)',
            borderColor: 'rgb(14, 165, 233)',
            borderWidth: 1,
            borderRadius: 4
        },
        {
            label: isPrice ? `${labelElectricity} (€)` : `${labelElectricity} (${bolletteConfigGlobal.electricity_unit})`,
            data: electricityData,
            backgroundColor: 'rgba(245, 158, 11, 0.7)',
            borderColor: 'rgb(245, 158, 11)',
            borderWidth: 1,
            borderRadius: 4
        },
        {
            label: isPrice ? `${labelGas} (€)` : `${labelGas} (${bolletteConfigGlobal.gas_unit})`,
            data: gasData,
            backgroundColor: 'rgba(168, 85, 247, 0.7)',
            borderColor: 'rgb(168, 85, 247)',
            borderWidth: 1,
            borderRadius: 4
        }
    ];
    
    graficoBolletteObj = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return isPrice ? formatEuro(value) : value;
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += isPrice ? formatEuro(context.parsed.y) : context.parsed.y;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function popolaTabellaBollette() {
    const tbody = document.getElementById('lista-bollette-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!bolletteGlobal || bolletteGlobal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #6c757d;">${window.Translations.noBills || "No bills inserted."}</td></tr>`;
        return;
    }
    
    const meseNomi = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    
    bolletteGlobal.forEach(b => {
        const dataStr = `${meseNomi[b.month - 1]} ${b.year}`;
        const totCosto = b.water_price + b.electricity_price + b.gas_price;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600;">${dataStr}</td>
            <td>
                <div style="font-weight: bold; color: #2c3e50;">${formatEuro(b.water_price)}</div>
                <div style="font-size: 0.8em; color: #6c757d;">${b.water_consumption} ${bolletteConfigGlobal.water_unit}</div>
            </td>
            <td>
                <div style="font-weight: bold; color: #2c3e50;">${formatEuro(b.electricity_price)}</div>
                <div style="font-size: 0.8em; color: #6c757d;">${b.electricity_consumption} ${bolletteConfigGlobal.electricity_unit}</div>
            </td>
            <td>
                <div style="font-weight: bold; color: #2c3e50;">${formatEuro(b.gas_price)}</div>
                <div style="font-size: 0.8em; color: #6c757d;">${b.gas_consumption} ${bolletteConfigGlobal.gas_unit}</div>
            </td>
            <td style="font-weight: bold; color: #2c3e50; font-size: 1.1em;">${formatEuro(totCosto)}</td>
            <td>
                <button onclick="modificaBolletta(${b.id})" class="btn-filter" style="padding: 4px 8px; font-size: 0.8em; background-color: #0d6efd; color: white;">✏️</button>
                <button onclick="eliminaBolletta(${b.id})" class="btn-filter" style="padding: 4px 8px; font-size: 0.8em; background-color: #dc3545; color: white;">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function inizializzaAnniBollette() {
    const selectAnno = document.getElementById('bolletta-year');
    if (!selectAnno || selectAnno.children.length > 0) return;
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 5; y <= currentYear + 1; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.innerText = y;
        if (y === currentYear) opt.selected = true;
        selectAnno.appendChild(opt);
    }
}

function apriModalBolletta() {
    document.getElementById('bolletta-id').value = '';
    document.getElementById('form-bolletta').reset();
    document.getElementById('modal-bolletta-title').innerText = "Aggiungi Bolletta";
    
    // Seleziona anno e mese corrente come default
    inizializzaAnniBollette();
    document.getElementById('bolletta-year').value = new Date().getFullYear();
    document.getElementById('bolletta-month').value = new Date().getMonth() + 1;
    
    document.getElementById('modal-bolletta').style.display = 'flex';
}

function chiudiModalBolletta() {
    document.getElementById('modal-bolletta').style.display = 'none';
}

function modificaBolletta(id) {
    const b = bolletteGlobal.find(item => item.id === id);
    if (!b) return;
    
    inizializzaAnniBollette();
    document.getElementById('bolletta-id').value = b.id;
    document.getElementById('bolletta-year').value = b.year;
    document.getElementById('bolletta-month').value = b.month;
    
    document.getElementById('bolletta-water-price').value = b.water_price;
    document.getElementById('bolletta-water-consumption').value = b.water_consumption;
    
    document.getElementById('bolletta-electricity-price').value = b.electricity_price;
    document.getElementById('bolletta-electricity-consumption').value = b.electricity_consumption;
    
    document.getElementById('bolletta-gas-price').value = b.gas_price;
    document.getElementById('bolletta-gas-consumption').value = b.gas_consumption;
    
    document.getElementById('modal-bolletta-title').innerText = "Modifica Bolletta";
    document.getElementById('modal-bolletta').style.display = 'flex';
}

async function salvaBolletta(event) {
    event.preventDefault();
    if (!activeBillsId) return;
    
    const id = document.getElementById('bolletta-id').value;
    const year = parseInt(document.getElementById('bolletta-year').value);
    const month = parseInt(document.getElementById('bolletta-month').value);
    
    const payload = {
        bills_id: parseInt(activeBillsId),
        year: year,
        month: month,
        water_price: parseFloat(document.getElementById('bolletta-water-price').value || 0),
        water_consumption: parseFloat(document.getElementById('bolletta-water-consumption').value || 0),
        electricity_price: parseFloat(document.getElementById('bolletta-electricity-price').value || 0),
        electricity_consumption: parseFloat(document.getElementById('bolletta-electricity-consumption').value || 0),
        gas_price: parseFloat(document.getElementById('bolletta-gas-price').value || 0),
        gas_consumption: parseFloat(document.getElementById('bolletta-gas-consumption').value || 0)
    };
    
    try {
        let res = await fetch('/api/bills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            chiudiModalBolletta();
            await caricaDatiBollette();
        } else {
            let err = await res.json();
            alert(err.errore || "Errore durante il salvataggio.");
        }
    } catch (e) {
        console.error(e);
        alert("Errore di rete.");
    }
}

async function eliminaBolletta(id) {
    if (!confirm("Sei sicuro di voler eliminare questa bolletta?")) return;
    
    try {
        let res = await fetch(`/api/bills/${id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            await caricaDatiBollette();
        } else {
            let err = await res.json();
            alert(err.errore || "Errore durante l'eliminazione.");
        }
    } catch (e) {
        console.error(e);
        alert("Errore di rete.");
    }
}

function apriModalSettingsBollette() {
    document.getElementById('setting-water-unit').value = bolletteConfigGlobal.water_unit || 'm³';
    document.getElementById('setting-electricity-unit').value = bolletteConfigGlobal.electricity_unit || 'kWh';
    document.getElementById('setting-gas-unit').value = bolletteConfigGlobal.gas_unit || 'Smc';
    
    document.getElementById('modal-settings-bollette').style.display = 'flex';
}

function chiudiModalSettingsBollette() {
    document.getElementById('modal-settings-bollette').style.display = 'none';
}

async function salvaSettingsBollette(event) {
    event.preventDefault();
    if (!activeBillsId) return;
    
    const payload = {
        bills_id: parseInt(activeBillsId),
        water_unit: document.getElementById('setting-water-unit').value,
        electricity_unit: document.getElementById('setting-electricity-unit').value,
        gas_unit: document.getElementById('setting-gas-unit').value
    };
    
    try {
        let res = await fetch('/api/bills/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            chiudiModalSettingsBollette();
            await caricaDatiBollette();
        } else {
            let err = await res.json();
            alert(err.errore || "Errore durante il salvataggio della configurazione.");
        }
    } catch (e) {
        console.error(e);
        alert("Errore di rete.");
    }
}

function esportaBolletteCSV() {
    if (!activeBillsId) return;
    window.location.href = `/api/bills/export_csv?bills_id=${activeBillsId}`;
}

async function importaBolletteCSV(event) {
    const file = event.target.files[0];
    if (!file || !activeBillsId) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        let res = await fetch(`/api/bills/import_csv?bills_id=${activeBillsId}`, {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            let data = await res.json();
            alert(data.messaggio || "Importazione completata!");
            await caricaDatiBollette();
        } else {
            let err = await res.json();
            alert(err.errore || "Errore durante l'importazione.");
        }
    } catch (error) {
        console.error(error);
        alert("Errore di rete durante l'importazione.");
    } finally {
        event.target.value = ''; // reset file input
    }
}

// ── SETTINGS MANAGEMENT ────────────────────────────────────────────────────────
window.applyTabVisibility = function() {
    const tabs = [
        { id: 'tab-investimenti', btnId: 'btn-tab-investimenti', storageKey: 'tab_investimenti_active' },
        { id: 'tab-wallet', btnId: 'btn-tab-wallet', storageKey: 'tab_wallet_active' },
        { id: 'tab-bollette', btnId: 'btn-tab-bollette', storageKey: 'tab_bollette_active' },
        { id: 'tab-veicoli', btnId: 'btn-tab-veicoli', storageKey: 'tab_veicoli_active' },
        { id: 'tab-prestiti', btnId: 'btn-tab-prestiti', storageKey: 'tab_prestiti_active' },
        { id: 'tab-stipendi', btnId: 'btn-tab-stipendi', storageKey: 'tab_stipendi_active' },
        { id: 'tab-fondopensione', btnId: 'btn-tab-fondopensione', storageKey: 'tab_fondopensione_active' }
    ];

    tabs.forEach(t => {
        const btn = document.getElementById(t.btnId);
        if (!btn) return;
        const active = localStorage.getItem(t.storageKey) !== 'false'; // default is true
        if (active) {
            btn.style.setProperty('display', 'block', 'important');
        } else {
            btn.style.setProperty('display', 'none', 'important');
            
            // If the tab is currently active, switch away to another active tab
            const tabEl = document.getElementById(t.id);
            if (tabEl && tabEl.classList.contains('active')) {
                const firstActive = tabs.find(x => localStorage.getItem(x.storageKey) !== 'false');
                if (firstActive) {
                    const firstBtn = document.getElementById(firstActive.btnId);
                    if (firstBtn) {
                        switchTab(firstActive.id, firstBtn);
                    }
                } else {
                    // Fall back to settings tab if everything else is disabled
                    const settingsBtn = document.getElementById('btn-tab-settings');
                    if (settingsBtn) {
                        switchTab('tab-settings', settingsBtn);
                    }
                }
            }
        }
    });
};

window.toggleTabSetting = function(storageKey, isChecked) {
    // Prevent disabling ALL tabs
    const tabs = [
        'tab_investimenti_active', 'tab_wallet_active', 'tab_bollette_active',
        'tab_veicoli_active', 'tab_prestiti_active', 'tab_stipendi_active', 'tab_fondopensione_active'
    ];
    
    if (!isChecked) {
        const activeCount = tabs.reduce((count, key) => {
            if (key === storageKey) return count;
            return count + (localStorage.getItem(key) !== 'false' ? 1 : 0);
        }, 0);
        
        if (activeCount === 0) {
            alert("Devi mantenere almeno un tab attivo!");
            const checkbox = document.getElementById('setting-' + storageKey.replace('_active', '').replace('tab_', 'tab-'));
            if (checkbox) checkbox.checked = true;
            return;
        }
    }

    localStorage.setItem(storageKey, isChecked ? 'true' : 'false');
    window.applyTabVisibility();
};

window.saveDefaultTabSetting = function(tabId) {
    localStorage.setItem('default_tab', tabId);
};

window.caricaDatiSettings = function() {
    const tabs = [
        { id: 'setting-tab-investimenti', storageKey: 'tab_investimenti_active' },
        { id: 'setting-tab-wallet', storageKey: 'tab_wallet_active' },
        { id: 'setting-tab-bollette', storageKey: 'tab_bollette_active' },
        { id: 'setting-tab-veicoli', storageKey: 'tab_veicoli_active' },
        { id: 'setting-tab-prestiti', storageKey: 'tab_prestiti_active' },
        { id: 'setting-tab-stipendi', storageKey: 'tab_stipendi_active' },
        { id: 'setting-tab-fondopensione', storageKey: 'tab_fondopensione_active' }
    ];

    tabs.forEach(t => {
        const cb = document.getElementById(t.id);
        if (cb) {
            cb.checked = localStorage.getItem(t.storageKey) !== 'false';
        }
    });

    const defaultTabSelect = document.getElementById('setting-default-tab');
    if (defaultTabSelect) {
        defaultTabSelect.value = localStorage.getItem('default_tab') || 'tab-investimenti';
    }
};
