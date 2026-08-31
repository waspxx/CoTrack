# 📋 CoTrack - Tasks & Idee
---

## 📥 Idee Lampo (Inbox)
*Spazio per annotare al volo qualsiasi idea, spunto o task prima di organizzarlo.*
- [ ] **Feature** Cambiare alcune cose di grafica del tab wallet per cercare di differenziarsi da Wallet by Budgetbakers

## 🟡 In Corso (In Progress)
*Attività su cui si sta lavorando attualmente.*

## 🟢 Completato (Completed)
*Archivio storico dei task conclusi.*
- [x] **Feature** Tab Veicoli: Controllo periodico mensile automatico e manuale delle campagne di richiamo (Škoda/VAG) tramite VIN con notifica email in caso di richiamo attivo (VinFound), badge di stato nelle schede garage e nel certificato meccanico
- [x] **Feature** Tab Veicoli: Aggiunti all'anagrafica veicolo i campi Numero di Telaio (VIN), Cilindrata, Potenza (kW), Cavalli (CV), HP Fiscali e Classe Euro, con autocalcolo kW/CV e integrazione sia nelle schede garage che nel Certificato Meccanico
- [x] **Feature** Tab Veicoli: Aggiunto tasto per generare un certificato meccanico navigabile e stampabile/esportabile in PDF contenente dati tecnici del veicolo, storico delle manutenzioni registrate (data, argomento e chilometri) e riepilogo dei prossimi interventi da fare (tagliando, revisione ministeriale e revisione bombole metano)
- [x] **Feature** Integrazione REST API BudgetBakers: sincronizzazione automatica delle transazioni del mese precedente ogni 20 del mese alle 06:00, sincronizzazione manuale rapida/personalizzata, mappatura intelligente delle categorie con Gemini AI e cache persistente in DB
- [x] **Feature** Aggiunta la possibilità di modificare le transazioni sia nel tab investimenti che nel tab wallet (con modali dedicate, autocompletamento e sincronizzazione)
- [x] **Feature** Tab Veicoli: Integrazione e sincronizzazione automatica delle attività (rifornimenti, spese, manutenzioni, entrate, promemoria) con Drivvo via credenziali .env e riconoscimento veicoli per targa
- [x] **Feature** Tab Prestiti: Simulatore Risparmio con confronto convenienza estinzione anticipata VS investimento dello stesso importo (durata, tasso, obbligazioni/ETF, tasse plusvalenza e detrazione IRPEF 19% mutuo)
- [x] **Feature** Aggiunto nel tab wallet la media delle entrate, uscite e risparmio degli ultimi 12 mesi e l'andamento del risparmio percentuale con grafico
- [x] **Feature** Aggiunto andamento annuale netto/lordo/lavoro nel tab stipendi e statistiche di gruppo con selettore di contributo delle singole persone
- [x] **Feature** In base ai tab in uso, aggiornare il report di Gemini per inviare via mail i dati più significativi per compararli con la settimana o il mese precedente. Cercare di ridurre il più possibile il consumo di token.
- [x] **Feature** Associazione automatica dei cedolini caricati (PDF/CSV) alla persona attiva selezionata
- [x] **Bug** Persistenza delle persone aggiunte e della persona selezionata nel tab stipendi durante il cambio tab
- [x] **Feature** Calcolo automatico della scadenza iniziale per promemoria ricorrenti chilometrici basandosi sulla manutenzione precedente registrata dello stesso tipo
- [x] **Feature** Controllo giornaliero dei promemoria dei veicoli in scadenza e invio mail di avviso via SMTP
- [x] **Feature** Tracciamento bici elettriche e sessioni di ricarica nel garage (Ah/Volt per calcolo capacità batteria, percentuali di avvio/fine ricarica e calcolo kWh automatico)
- [x] **Marketing** Aggiornare README.md
- [x] **Bug** Tab Impostazioni: quando si passa a un altro tab, il contenuto del tab impostazioni rimane visibile in fondo alla pagina.
- [x] **BUG** Tab prestiti: in Registrazione & Storico il tasto modifica transazione registrata non fa nulla.
- [x] **Feature** Implementare tab prestiti (inserire simulatore risparmio interessi se rimborsato anticipatamente, dashboard progressi, storico transazioni, import/export transazioni)
- [x] **Feature** Tab Veicoli: Permetti l'archiviazione dei veicoli
- [x] **Bug** tab veicoli: quando elimino una manutenzione la lista non si aggiorna automaticamente
- [x] **Feature** Tab Veicoli: In grafici e report inserisci grafico a barre delle spese mensili divise per categoria selezionabili, Grafico della media del carburante, 2 grafici a torta per tipologie di spesa e di manutenzione.
- [x] **Feature** Tab Veicoli: sotto a veicolo attivo inserisci un filtro con: mese corrente, mese precedente, ultimo mese, ultimi 3 mesi, ultimi 6 mesi, ultimo anno, tutto il periodo, personalizza. di default: tutto il periodo. Questo filtro serve per tutto, dati e grafici.
- [x] **Feature** Tab Veicoli: in aggiungi promemoria, se seleziono frequenza ricorrente devo nascondere data scadenza e chilometri scadenza. devono diventare obbligatori i campi ripeti ogni.
- [x] **Feature** Tab Veicoli: quando aggiungo una manutenzione o una spesa fai un check sui promemoria, se esiste un promemoria per quella specifica manutenzione o spesa allora rinnova il promemoria se è ricorrente o chiedi di completarlo se ha una scadenza singola.
- [x] **Feature** Bisogna aggiungere un link statico ad ogni tab, in modo che se accedo a quel link si apre quel tab.
- [x] **Bug** Se apro un tab diverso da Investimenti, non deve partire lo scraping dei dati finanziari che servono solo al tab Investimenti.
- [x] **Feature** Tab Veicoli: Rinominare Servizio in Manutenzione
- [x] **Feature** Tab Veicoli: In Aggiunti Attività/Manutenzione al posto di una combobox nella descrizione dev'esserci un multiselettore per selezionare ogni tipologia di ricambio o lavoro con un rispettivo valore. Il costo manutenzione sarà la somma di questi valori. Sulla barra laterale in homepage si può aggiungere una sezione per cambiare la lista dei ricambi e lavori possibili (senza specificare alcun valore).
- [x] **Feature** Tab Veicoli: In homepage sulla barra a sinistra, aggiungi delle sezioni per modificare la lista di categorie entrata, categoria spesa.
- [x] **Feature** Tab Veicoli: Eliminare l'attività Percorso.
- [x] Nel form Rifornimento il costo totale è obbligatorio e il volume è calcolato in automatico.
- [x] Visualizzazione dell'ultima lettura contachilometri disponibile vicino al campo contachilometri.
- [x] Modifica dinamica di Litri in kg per il Metano.
- [x] Aggiunta della checkbox "Mancato rifornimento precedente?" per evitare il calcolo dell'efficienza nell'ultimo pieno.
- [x] Aggiunta opzioni promemoria singolo/ricorrente e associazione a liste spesa/manutenzione con scadenze obbligatorie dinamiche.
- [x] Risolto problema di navigazione del tab Investimenti (collisione router hashchange) e tradotti gli indirizzi con hash (#investments, #bills, #vehicles) in inglese.
- [x] Tab Veicoli: Aggiunta dei tasti "Importa" ed "Esporta" nella scheda di ciascun veicolo per l'importazione/esportazione in formato Drivvo CSV.
- [x] Tab Veicoli: Rimosso il riquadro "Gestione Dati Backup" dalla sezione Grafici e Report.
- [x] Tab Veicoli: Risolto bug del caricamento iniziale con garage_id nullo e corretto errore 415 HTTP in Flask per le chiamate GET.
- [x] Tab Veicoli: Corretto il parsing dell'importazione dei servizi/manutenzioni da Drivvo raggruppandoli per data e contachilometri in formato JSON, e aggiornate le categorie di manutenzione/spesa di default partendo dai file CSV presenti nella cartella import.
- [x] Tab Veicoli: Corretta la visualizzazione JSON grezza delle manutenzioni nelle sezioni 'Attività Recenti' e 'Manutenzioni & Tagliandi' formattando opportunamente la stringa JSON.
- [x] Tab Veicoli: Risolto bug del precaricamento della data nella modifica attività (ripulendo i millisecondi o il timestamp orario incompatibili con input[type=date]).
- [x] Tab Veicoli: Ordinata la lista del multi-selettore dei dettagli di manutenzione mettendo in testa quelli selezionati e aggiornandola reattivamente all'evento di selezione/deselezione senza perdere il focus.
- [x] Tab Veicoli: Rimossi i grafici 'Variazione Prezzi Carburante' e 'Costo Mensile Storico' dal template HTML e dalla logica JavaScript.
- [x] Tab Veicoli: Aggiornata dinamicamente l'unità di misura (km/L, km/kg o km/kWh) nel grafico 'Andamento Consumo Carburante' basandosi sul tipo di alimentazione del veicolo attivo.
- [x] Tab Veicoli: Allineati i colori dei grafici 'Distribuzione Spese Totali' e 'Andamento Consumo Carburante' con gli altri grafici (sostituendo le variabili CSS grezze con i codici colore HEX coerenti).
- [x] Tab Veicoli: Modificato il grafico a ciambella 'Distribuzione Spese Totali' in modo da accumulare e visualizzare dinamicamente le reali categorie di spesa (es. 'Acquisto', 'Passaggio Di Propietà') invece di raggrupparle genericamente sotto 'Altro'.
- [x] Tab Veicoli: Ottimizzate le performance di caricamento iniziale parallelizzando le chiamate fetch lato client ed introducendo indici SQL opportuni nel database (su vehicles.garage_id e vehicle_activities.vehicleId) per velocizzare le query.
- [x] Tab Veicoli: Parallelizzato il caricamento globale all'avvio dell'applicazione (checkAuth in app.js), riducendo la latenza per l'attivazione iniziale dei Garage e dei dati correlati.
- [x] Tab Veicoli: Rimossa la scritta 'Versione 1.0.0', corretta l'icona del tasto 'Aggiungi veicolo' definendo esplicitamente le dimensioni dell'SVG nel CSS, e corretto il layout dei form di gestione categorie (rendendo gli input ampi ed evitando l'espansione impropria del pulsante Aggiungi).
- [x] **Feature** Tab prestiti: implementare import estratto conto dell'intermediario del prestito per riconoscere le transazioni
- [x] **Feature** Aggiungere settings generali, tra cui quali tab attivare
- [x] **Feature** Implementare tab stipendi, supporterà più persone (conterrà voci lorde e nette, assegni unici, leggerà direttamente la busta paga, lo stile dev'essere simile al tab veicoli e al tab prestiti)
- [x] **Feature** Implementare tab fondo pensione, supporterà più fondi (se di categoria, bisogna inserire i valori della busta paga magari leggendola automaticamente)












