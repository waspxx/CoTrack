# CoTrack 📊

CoTrack is a modern, self-hosted, lightweight personal finance and investment portfolio tracker. It features automated real-time price caching, advanced asset allocation visualization, risk KPI calculations (Volatility, Sharpe Ratio), and integrated Google Gemini AI for automated weekly reports and portfolio diagnostics.

---

## ✨ Features

- **Multi-Portfolio Support**: Manage multiple portfolios with ease.
- **Real-Time & Historical Data**: Automatically fetches and caches stock, ETF, and Italian government bond (BTP) prices using Yahoo Finance and TradingView.
- **Gemini AI Integration**:
  - **On-Demand Analysis**: Instant AI diagnostic of your asset allocation and performance.
  - **Monthly Comparisons**: The AI automatically compares your current portfolio state ($T_1$) with your historical state 30 days ago ($T_0$) to identify trends and shifts.
  - **Weekly Automated Reports**: Scheduled emails summarizing your portfolios with AI-generated commentary.
- **Wallet & Budget Integration**: Import transactions from external wallet managers (e.g. BudgetBakers / Wallet App) to align your investment accounts with cash flow.
- **Import/Export Utilities**: Robust CSV import for custom formats, plus backup exports. PDF statement parsing is also supported.
- **Multilingual UI**: Full support for English and Italian, automatically selected via browser preference or user session.
- **Fully Containerized**: Ready to deploy out-of-the-box with Docker and Docker Compose.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.11 with [Flask](https://flask.palletsprojects.com/)
- **Database**: SQLite (saved in a persistent local directory)
- **AI SDK**: [Google Generative AI SDK](https://github.com/google/generative-ai-python)
- **Task Scheduling**: [APScheduler](https://apscheduler.readthedocs.io/)
- **Frontend**: Vanilla Javascript, Chart.js for charts, responsive CSS styling with dark mode support.
- **Data APIs**: `yfinance` for global equities, `tvDatafeed` for Italian bonds (BTP), and `justetf-scraping`.

---

## 🚀 Quick Start (Docker Compose)

The easiest way to run CoTrack is using Docker Compose.

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/CoTrack.git
   cd CoTrack
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   nano .env
   ```

3. **Launch the Container**:
   ```bash
   docker-compose up -d
   ```
   CoTrack will now be running at `http://localhost:5001`. The database will be persistently stored in `./data/cotrack.db`.

---

## 💻 Local Setup & Development

To run the application locally without Docker:

### Prerequisites
Make sure you have Python 3.11+ and `git` installed on your machine.

### Installation Steps

1. **Create and Activate a Virtual Environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Set up your `.env` file from the template:
   ```bash
   cp .env.example .env
   ```

4. **Initialize and Run**:
   Run the Flask server:
   ```bash
   python3 app.py
   ```
   Open `http://localhost:5001` in your browser.

---

## ⚙️ Configuration & Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Your Google AI Studio API key (Required for AI analysis) | None |
| `GEMINI_MODEL_PRIMARY` | Primary model for portfolio diagnostics | `gemini-3.5-flash` |
| `GEMINI_MODEL_FALLBACK` | Fallback model if primary encounters errors | `gemini-3.1-flash-lite` |
| `SECRET_KEY` | Flask session secret key | (Generate a random hex) |
| `SMTP_SERVER` | SMTP host to send email reports | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USERNAME` | SMTP login username (sender email) | None |
| `SMTP_PASSWORD` | SMTP login password or App Password | None |
| `MAIL_DEFAULT_SENDER` | Email address shown in the "From" header | None |

---

## 📈 Gemini AI Monthly Comparison & Token Optimization

CoTrack is optimized to compare your performance month-over-month. When you request a diagnostic or when the weekly report is compiled, the system:
1. Reconstructs the portfolio snapshot from **30 days ago** (T0) via your local transaction history and database price cache.
2. Formats a compact, token-efficient YAML schema containing today's data (T1) and past data (T0).
3. Requests Gemini to perform an objective comparison of returns, volatility, and allocation shifts.
4. Uses **Markdown format** with a maximum constraint of 150 words, minimizing output token overhead by 50% compared to raw HTML responses.

---

## 🔒 Security Best Practices for Making Public

Before publishing this repository:
1. **Never commit `.env`**: Make sure `.env` remains in `.gitignore`.
2. **Never commit the SQLite database**: Ensure `data/cotrack.db` (and other generated files in `data/`) are ignored.
3. **Change SMTP passwords**: If you tested SMTP settings, verify that they are configured strictly through environment variables.
