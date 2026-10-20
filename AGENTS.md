# Coding Agent Instructions

## Operating Principles

Keep it simple. Simple is better than complex.
Make the smallest maintainable change that solves the actual request.
Prefer existing patterns over new abstractions.
Avoid broad refactors, speculative helpers, and clever architecture unless clearly justified.
Do not build for hypothetical future use. Implement the current need cleanly and stop there.
Use judgment. Read enough surrounding code to understand the existing pattern, then avoid unnecessary exploration. Validate based on risk.
Assume the user is a principal engineer.
Optimize for correctness, speed, judgment, and token efficiency.
Correct the user when appropriate.

## Success Criteria

Done means:

- the requested behavior is implemented
- the change is minimal and follows existing patterns (unless a large task was assigned)
- risky behavior was validated, or validation was intentionally skipped with a reason
- the post-modification workflow (tasks tracking, string localization, container rebuild) was executed
- remaining risks are stated plainly

## Context Discipline

Protect context aggressively.

As tool output, file reads, and conversation history grow, useful signal gets diluted. Keep active context focused on the current decision.

Before opening files or running broad searches, ask:

1. What exact question am I answering?
2. Which file, symbol, route, or component is most likely relevant?
3. Can I inspect a narrower slice first?
4. Can `rg`, imports, references, or file names locate the answer?

Prefer targeted searches, focused file sections, nearby call sites, diffs, capped logs, and targeted test output.

Avoid dumping full files (especially large monolithic files like `app.py`, `app.js`, `veicoli.js`), full logs, unrelated directories, or broad repo exploration after the relevant code is found.

When context gets large, summarize the current task state and keep only:

- decisions
- relevant file paths
- changed behavior
- unresolved risks

## Subagents

Use subagents only when they save context, save time, or materially improve output quality.

For research, review, and exploration tasks, avoid confirmation bias. Do not pass a preferred conclusion. Ask the subagent to investigate, compare, or verify, and require evidence, tradeoffs, uncertainty, and better alternatives.

Good uses:

- repo exploration
- scoped implementation
- QA or security review
- documentation/API checks
- web research
- copywriting/content variants

Avoid subagents for trivial work the main agent can finish faster.

When using a subagent, assign a narrow task and require:

- findings
- files inspected
- files changed, if any
- validation run, if any
- risks or uncertainty

The main agent owns final judgment and integration.

## Code Changes

Prefer direct edits using available environment tools like `replace_file_content`.

Before adding helpers, maps, files, abstractions, or validation layers, ask:

1. Can this be done inline?
2. Can existing code already do this?
3. Is this solving the exact issue?
4. Is reuse or readability clearly improved?

Do not create new abstractions, helper layers, provider interfaces, background tasks, docs, or config files unless the current task clearly needs them.
Before adding a new function, model, setting, or endpoint, check whether an existing pattern already solves the same problem in `app.py` or the corresponding frontend module.

For bugs, patch the narrow failing path first.
For small behavior changes, make the direct edit first.
Avoid unrelated cleanup.

Split work into reviewable steps when possible:

- behavior change
- mechanical refactor
- template/UI adjustments
- translations

Do not mix these unless the user explicitly asks for a broad rewrite.

For complex tasks:

- identify the minimal path through the codebase
- split work into small patches
- validate only the risky parts
- keep a short running summary of decisions, changed files, and remaining risks

## Validation

Match validation to risk.

Skip validation by default for low-risk changes and say so plainly.

Never skip validation when touching:

- database schema definitions & table alterations in `init_db()`
- raw SQLite queries, parameterized inputs, and database transactions
- sensitive data handling (passwords, tokens, API keys, session secrets)
- auth, sessions, CSRF, and rate limiting (`Flask-Limiter`)
- Google Gemini AI prompts, PDF extraction schemas, and token optimization filters
- APScheduler background jobs (`send_weekly_report`, `send_daily_reminders`, `update_pension_fund_prices_job`, `sync_budgetbakers_monthly_job`, `check_vehicle_recalls_monthly_job`, `send_annual_report_job`)
- external integrations (Drivvo sync, BudgetBakers API, Home Assistant energy webhook)
- financial calculations, loan amortization math, and deterministic annual report metrics (`annual_report.py`)
- Dockerfile, Gunicorn concurrency settings, or container orchestration (`docker-compose.yml`)

Low-risk examples:

- copy changes and static text
- UI labels, icons, and badge colors
- CSS styling and Bootstrap/chart layout tweaks
- minor template adjustments without server logic

Also validate when:

- a previous command failed
- the user asked for validation
- the change affects multiple routes, templates, or frontend tab modules

Validation hierarchy:

1. Python syntax check: `docker compose exec cotrack python -m py_compile <modified_file>` (e.g. `docker compose exec cotrack python -m py_compile app.py annual_report.py budgetbakers_sync.py drivvo_sync.py`)
2. Runtime & container health: `docker compose ps` and `docker compose logs --tail 50 cotrack`
3. Smoke test affected endpoints: `curl -I http://localhost:5001/` or curl specific API routes
4. Client-side JS sanity check for syntax errors when editing frontend scripts

### Preexisting Failures (Baseline Zero Policy)

Application syntax errors, database migration drifts, and container crash loops must be kept at zero. Baseline zero means zero — finding a preexisting defect is the trigger to fix it, not to leave it and move on.

If you discover a failure while working on something unrelated:

1. Confirm whether it is preexisting or introduced by your change.
2. Fix it immediately if scoped and safe. If it is large or risky, inform the user explicitly rather than passing over it silently.
3. Keep the fix distinct and clearly documented.

## Command Output

Protect context usage. **Any command with unknown or potentially large output must be byte-capped.**

Default pattern:

```bash
COMMAND 2>&1 | head -c 4000
```

For logs or recent failures:

```bash
COMMAND 2>&1 | tail -c 4000
```

Do not rely on line limits as the only cap. A single line can be huge. Avoid using only `head -n`, `tail -n`, or `sed -n '1,20p'`.

Scope before printing content:

- list files with `rg -l` before printing matches
- count matches with `rg -c` before reading them
- search specific paths instead of whole directories
- use `rg -m`, `--max-count`, `--max-filesize`, and small context when useful
- inspect file size before reading unknown generated files, logs, or minified assets

For commands where the exit code matters, capture output first, print a capped amount, then exit with the original status:

```bash
tmp="$(mktemp)"
COMMAND >"$tmp" 2>&1
status=$?
tail -c 5000 "$tmp"
rm -f "$tmp"
exit "$status"
```

Avoid unbounded output from:

```bash
cat app.py
rg -n "term" .
find .
docker compose logs
```

Use bounded versions instead:

```bash
rg -l "term" . | head -c 2000
rg -n -m 20 "term" app.py 2>&1 | head -c 2000
docker compose logs --tail 50 cotrack 2>&1 | tail -c 4000
```

## Communication

Before editing, state the approach only for non-trivial tasks.

During complex work, keep updates very short:

- what was found
- what changed
- what risk remains

After work, summarize:

- what changed
- files touched
- validation run, or why skipped
- post-modification steps executed (tasks, translations, docker rebuild)
- remaining risk

Keep summaries short. Do not explain obvious edits.

Oververbosity: low

---

# CoTrack Notes

CoTrack (*Collaboration Tracking* / *Complete Tracking*) is a self-hosted, privacy-first collaborative life and financial assets tracking hub. Built with Flask (Python 3.11), persistent SQLite, Jinja2, Vanilla JavaScript (modular architecture), Chart.js, Flask-Babel, APScheduler, and Google Gemini AI, it is designed for individuals, families, and collaborative groups to monitor wealth, cash flows, energy, garage fleets, loans, salaries, and pension funds in a unified dashboard running inside Docker behind Gunicorn on port `5001`.

## Repository Map

- `app.py`: Central Flask application containing SQLite database initialization (`init_db`), authentication, session handling, REST API endpoints, background schedulers, financial scrapers, and Gemini AI endpoints.
- `annual_report.py`: Annual consolidated financial report engine aggregating deterministic, mathematically rigorous metrics from all database tables (zero AI hallucinations), generating responsive HTML email reports and in-browser previews.
- `budgetbakers_sync.py`: REST API synchronization service for BudgetBakers (Wallet App) transactions, with Gemini-powered smart category mapping and local database caching.
- `drivvo_sync.py`: Fleet synchronization service for Drivvo, automating real-time sync of vehicle activities (refuelings, maintenance, expenses, incomes, reminders) with plate normalization and session caching.
- `scraping/`:
  - `scrape_engine.py`: Scrapers for pension fund unit prices and Škoda/VAG VIN vehicle recall campaigns (`check_vin_recall`).
  - `fondi_pensione.json`: Registry and metadata for supported Italian pension fund compartments (Cometa, Fonchim, Fonte, Secondapensione, etc.).
- `templates/`:
  - `index.html`: Main dashboard container layout, tab navigation shell, and theme toggling.
  - `components/`: Modular Jinja2 tab templates:
    - `header.html`: Top navigation bar, user profile info, and notifications.
    - `tabs.html`: Dynamic tab selector buttons.
    - `tab_investimenti.html`: Multi-portfolio stock/ETF/BTP tracking and AI diagnostics.
    - `tab_wallet.html`: Multi-account cash flow, monthly savings trends, and transaction grids.
    - `tab_bollette.html`: Energy dashboard, solar production/feed-in, appliances, GSE Conto Energia/SSP, and TARI.
    - `tab_veicoli.html`: Garage fleet, fuel efficiency (km/L, km/kg, km/kWh), e-bikes, maintenance, reminders, mechanical certificate.
    - `tab_prestiti.html`: Debts, amortization schedules, and early repayment vs investment simulator.
    - `tab_stipendi.html`: Multi-profile gross/net salaries, payslip PDF parsing, family allowances.
    - `tab_fondopensione.html`: Pension funds contributions, TFR, compartment unit price tracking.
    - `tab_settings.html`: System settings, tab visibility toggles, default landing tab, email recipient configurations, DB backup.
    - `auth.html`: User login, registration, and password reset modals.
- `static/`:
  - `js/`: Modular frontend client scripts:
    - `app.js`: Global SPA state, routing, auth, settings, investment, wallet, and bills modules.
    - `veicoli.js`: Garage management, activity modals, maintenance details, fuel calculations, Drivvo sync, recall badges.
    - `prestiti.js`: Loans dashboard, amortization math, statement CSV/PDF imports, early repayment calculator.
    - `stipendi.js`: Salary profiles, payslip PDF parsing, income charts, statistical breakdowns.
    - `fondopensione.js`: Pension fund portfolios, contributions history, unit price graphs, statement parsing.
  - `css/`: Modular stylesheets (`style.css`, `veicoli.css`, `prestiti.css`, `stipendi.css`, `fondopensione.css`).
- `translations/`: Localization catalogs:
  - `messages.pot`: Master extraction template.
  - `translations/it/LC_MESSAGES/messages.po` & `messages.mo`: Italian translations.
- `babel.cfg`: Flask-Babel extraction configuration mapping Python files and Jinja2 HTML templates.
- `data/`: Persistent local directory mounted into the container (`/app/data`), storing `cotrack.db`.
- `docker-compose.yml` / `docker-compose.prod.yml`: Docker service orchestration definitions.
- `Dockerfile`: Production multi-stage Python 3.11 build with unprivileged `appuser` (UID 1000) and Gunicorn runtime.
- `.env` / `.env.example`: Environment variable definitions (AI keys, SMTP, Drivvo, Home Assistant token).

## Core Subsystems & Architectural Rules

### 1. Modular Tab Architecture & Frontend Routing
- The dashboard is organized into specialized domain tabs: **Investments**, **Wallet**, **Bills**, **Vehicles**, **Loans**, **Salaries**, **Pension Fund**, and **Settings**.
- Tab routing is managed via client-side hash navigation (`#investments`, `#wallet`, `#bills`, `#vehicles`, `#loans`, `#salaries`, `#pension_fund`, `#settings`), enabling direct linking and browser bookmarks.
- **Lazy / Deferred Data Fetching**: Heavy scraping operations (e.g. market data fetches via Yahoo Finance and TradingView) MUST execute strictly when the Investments tab is active, never blocking navigation between other tabs.
- Tab visibility can be dynamically enabled or hidden per user via configurations in Settings.

### 2. SQLite Database Architecture & Auto-Migrations
- CoTrack uses native Python `sqlite3` with `conn = get_db_connection()` and `conn.row_factory = sqlite3.Row`.
- The database file is located persistently at `./data/cotrack.db` (mapped to `/app/data/cotrack.db` inside Docker).
- **Auto-Migration Pattern**: Database schema changes and new columns/tables are managed directly inside `init_db()` in `app.py`.
  - New tables use `CREATE TABLE IF NOT EXISTS <table_name> (...)`.
  - Schema evolutions and column additions use idempotent migrations wrapped in `try: conn.execute("ALTER TABLE ... ADD COLUMN ...") except sqlite3.OperationalError: pass`.
  - Never use raw string formatting or concatenation when building SQL queries. Always use parameterized queries with `?` placeholders to prevent SQL injection.

### 3. Google Gemini AI Integrations & Token Optimization
CoTrack leverages Google Gemini AI via the `google-genai` SDK (`from google import genai`) with a dual-model configuration:
- **Primary Model**: `gemini-3.8-flash` (defined via `GEMINI_MODEL_PRIMARY`).
- **Fallback Model**: `gemini-3.5-flash-lite` (defined via `GEMINI_MODEL_FALLBACK`) on rate limits (HTTP 429) or transient errors.
- **Key AI Capabilities**:
  - **Portfolio Diagnostics (`/api/analyze_portfolio`)**: Reconstructs historical snapshots ($T_0$, 30 days prior) and compares them with current allocations ($T_1$). Enforces compact YAML payload schemas and concise markdown output (<150 words) to save ~50% token overhead.
  - **Holistic Scheduled Reports (`send_weekly_report`)**: Aggregates macro trends across all active modules into a direct commentary (<250 words) without introductory fluff.
  - **PDF Document Extraction**:
    - Italian payslips (Cedolini) in Salaries (`/api/salaries/parse_pdf`): extracts date, gross, net, and allowances.
    - Pension statements & payslips (`/api/pension_funds/parse_pdf`): extracts TFR, employee contributions, and employer contributions into structured JSON.
    - Loan intermediary statements (`/api/loans/parse_statement_pdf`): extracts transaction history.
    - **Fallback Regex Parsers**: Every PDF parsing endpoint must include a deterministic regex fallback for when `GEMINI_API_KEY` is not provided or Gemini is unreachable.
  - **BudgetBakers Category Mapping**: Maps third-party categories to existing CoTrack categories with local persistent DB caching.

### 4. Shared Garage, Fleet & Mobility Management
- Supports multi-vehicle and e-bike tracking with dynamic status (active/archived).
- **Dynamic Fuel & Consumption Units**: Automatically adapts units and calculations based on fuel type:
  - Gasoline / Diesel / LPG: `km/L`
  - CNG / Metano: `km/kg`
  - Electric / Plug-in Hybrid: `km/kWh`
  - E-Bikes: Tracks battery capacity (Ah / V), start/end charge percentages, and calculated kWh.
- **Smart Reminders**: Supports single and recurring reminders (triggered by mileage or time). Automatically checks prior maintenance entries to calculate initial recurring due dates, and auto-completes/renews reminders when a matching maintenance or expense log is saved.
- **Drivvo Bidirectional Auto-Sync (`drivvo_sync.py`)**: Automatically mirrors refuelings, expenses, maintenance, and reminders to Drivvo using plate matching (`clean_plate`) and credential caching.
- **Recall Campaign Checks**: Periodically queries official manufacturer recall databases (Škoda/VAG) by chassis number (VIN) via `check_vin_recall`, surfacing recall badges in the garage and mechanical certificates.

### 5. Bills, Photovoltaic & Smart Energy Tracking
- Tracks household energy flows: Solar production (`solar_production`), Grid feed-in (`grid_feed_in`), Grid import (`electricity_f1/f2/f3`), Self-consumption, and Self-sufficiency rates.
- **Home Assistant Webhook (`/api/webhooks/bills/energy`)**: Receives monthly energy and appliance consumption telemetry automatically via HTTP POST authenticated with `HASS_WEBHOOK_TOKEN`.
- **Appliance Breakdown**: Dynamic tracking of individual high-load appliances (`bills_appliances` and `bills_appliance_consumptions`).
- **Solar Incentives & TARI**: Dedicated tracking for Italian GSE Conto Energia and Scambio sul Posto (SSP) payouts, alongside municipal waste tax (TARI).

### 6. Loans, Salaries & Pension Funds Tracker
- **Loans & Debt Tracker**: Computes French amortization schedules. Features an advanced Early Repayment Simulator comparing interest savings against market investment alternatives (considering duration, interest rates, capital gains tax, and the Italian 19% IRPEF mortgage interest deduction).
- **Multi-Profile Salaries**: Monitors gross-to-net progression, overtime, bonuses, and family allowances (*assegno unico*) across multiple profiles.
- **Pension Funds Tracker**: Tracks TFR, member contributions, employer contributions, and tax-deductible thresholds across multiple open and closed pension funds, with automated compartment unit price scraping (`scraping/scrape_engine.py`).

### 7. Deterministic Consolidated Annual Report (`annual_report.py`)
- Executes zero-AI, 100% deterministic mathematical aggregation across all database tables (Investments, Wallet, Bills/Energy, Vehicles, Loans, Salaries, Pension Funds).
- Calculates comprehensive year-over-year deltas for every financial dimension.
- Formatted as a clean, accessible HTML email template suitable for non-technical family members, with full-screen browser preview and email testing available in Settings.

### 8. Background Schedulers & Concurrency Constraints
- Scheduled jobs run via `APScheduler` (`BackgroundScheduler`) in `app.py`:
  - `send_weekly_report`: Weekly holistic AI commentary (Mondays at 09:00, enabled via `WEEKLY_AI_REPORT_ENABLED=true`).
  - `send_daily_reminders`: Daily scan of vehicle maintenance reminders with SMTP email dispatch (Daily at 08:00).
  - `update_pension_fund_prices_job`: Scrapes pension fund unit prices (Monthly on the 10th at 02:00).
  - `sync_budgetbakers_monthly_job`: Auto-syncs BudgetBakers transactions for the prior month (Monthly on the 20th at 06:00).
  - `check_vehicle_recalls_monthly_job`: Checks VIN recall campaigns for fleet vehicles (Monthly on the 1st at 04:00).
  - `send_annual_report_job` (`id='job_annual_report'`): Compiles and sends the consolidated annual report (December 31st at 21:00).
- **Gunicorn Concurrency Rule**: Gunicorn MUST run with `--workers 1 --threads 4` (as defined in `Dockerfile`). Do NOT increase the worker count, otherwise APScheduler will be instantiated across multiple processes and send duplicate email notifications.

---

## Mandatory Post-Modification Workflow

Whenever modifying code in this repository, you MUST follow these four steps:

1. **String Localization**:
   - If any new user-facing strings were added in Python (wrapped in `_()` or `_l()`) or templates (`{{ _('...') }}`), extract, update, and compile the translations:
     ```bash
     pybabel extract -F babel.cfg -k _ -k _l -o messages.pot .
     pybabel update -i messages.pot -d translations
     pybabel compile -d translations
     ```
   - Verify that new strings are extracted into `messages.pot` and compiled into `translations/it/LC_MESSAGES/messages.mo`.
2. **Container Rebuild & Restart**:
   - Apply the changes to the running Docker environment:
     ```bash
     docker compose down && docker compose up -d --build
     ```
   - Check container health: `docker compose ps`
3. **No Automatic Commits**:
   - Never commit changes to git automatically. Wait for the user's explicit command.

---

## Common Operations & Commands

### Docker Management
- Start containers: `docker compose up -d`
- Stop containers: `docker compose down`
- Rebuild & restart: `docker compose down && docker compose up -d --build`
- Restart single service: `docker compose restart cotrack`
- Inspect application logs: `docker compose logs -f --tail 100 cotrack`
- Inspect container health: `docker compose ps`

### Database & Migrations
- SQLite database is stored locally in `./data/cotrack.db`.
- Database schema changes are auto-executed on startup via `init_db()` in `app.py`.
- Manual SQLite inspection inside container:
  ```bash
  docker compose exec cotrack sqlite3 /app/data/cotrack.db ".tables"
  ```
- Backup database via API: `GET /api/backup_db` (authenticated session).

### Localization (Flask-Babel)
- Complete extraction, update, and compilation cycle:
  ```bash
  pybabel extract -F babel.cfg -k _ -k _l -o messages.pot .
  pybabel update -i messages.pot -d translations
  pybabel compile -d translations
  ```

### Syntax & Compilation Checks
- Check Python syntax inside the container:
  ```bash
  docker compose exec cotrack python -m py_compile app.py annual_report.py budgetbakers_sync.py drivvo_sync.py scraping/scrape_engine.py
  ```

---

## Security, Compliance & Privacy

CoTrack handles private financial records, salary information, and household telemetry. The following rules are strictly enforced:

1. **Password Hashing**: User passwords must be hashed using Werkzeug (`generate_password_hash` and `check_password_hash`). Plaintext passwords must never be stored.
2. **Authentication & Session Security**: Authentication endpoints enforce in-memory rate limiting via `Flask-Limiter` (`5 per minute` on login and registration, `3 per minute` on forgot password). Sessions use `SECRET_KEY` from `.env`.
3. **Webhook Security**: The Home Assistant energy webhook (`/api/webhooks/bills/energy`) requires authentication against `HASS_WEBHOOK_TOKEN` passed via `X-Webhook-Token` or Bearer header.
4. **SQL Injection Prevention**: SQLite queries must exclusively use parameterized queries with `?` markers. Never concatenate raw user input into SQL query strings.
5. **Secrets & Credentials**: `.env` contains API keys (Gemini), SMTP passwords, Drivvo credentials, and webhook tokens. Never commit `.env` to Git.

---

## PR & Commit Expectations

- **Never commit unless the user explicitly asks.** Finishing a task, passing tests, or reaching a natural stopping point does not justify an automatic commit. Wait for a direct instruction such as "commit this", "commit the changes", or "make a commit".
- **Never amend a commit the user has not seen.** If an issue arises after a commit, make a new commit instead of amending.
- Keep commit messages concise with a short imperative title, followed by 1–3 bullet points clarifying the change.
