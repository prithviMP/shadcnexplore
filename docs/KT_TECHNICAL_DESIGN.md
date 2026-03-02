# ShadcnExplore — Knowledge Transfer & Technical Design Document

This document is the primary KT (Knowledge Transfer) and technical design reference for the **ShadcnExplore** application. It describes deployment (EC2, Git, PM2), technical architecture, and code structure so new team members or users can onboard quickly.

---

## 1. Overview

**ShadcnExplore** is a full-stack screener/analytics web application that:

- Manages **sectors**, **companies**, and **quarterly financial data** (scraped from Screener.in).
- Evaluates **signals** and **formulas** (simple and Excel-style) to produce buy/sell/hold outputs.
- Provides **role-based access** (super_admin, admin, analyst, viewer), **two-step login (email OTP)**, and **scheduled scraping** (node-cron).
- Uses **PostgreSQL** (or Neon serverless) with **Drizzle ORM**, and a **React + Vite** front end with **Shadcn UI**.

The app runs as a **single Node process**: one server serves both the REST API and the static front-end assets.

---

## 2. Deployment Architecture

### 2.1 Hosting: AWS EC2

- The application is deployed on an **AWS EC2** instance.
- Typical path on the server: `~/scrapper-screener/ShadcnExplore` (or `~/scrapper-screener` at repo root with `ShadcnExplore` as the app directory).
- The process is managed by **PM2** so it stays up, restarts on failure, and can be restarted after deployments.

### 2.2 Process Manager: PM2

- **App name in PM2:** `scrapper-screener` (used in `MIGRATION_GUIDE.md` and `LOG_VIEWING_GUIDE.md`).
- PM2 runs the **production** build: `npm start` → `node dist/index.js`.
- Default port is **5000** (configurable via `PORT` in `.env`). The server binds to `0.0.0.0` so it’s reachable from the network.

**Common PM2 commands:**

```bash
# Restart app after deploy or migration
pm2 restart scrapper-screener

# View logs
pm2 logs scrapper-screener

# Filter logs (e.g. signals / formula)
pm2 logs scrapper-screener | grep -E "\[SIGNAL|\[EXCEL-FORMULA"
```

### 2.3 Deployment Workflow (Git pull + build + PM2)

Deployment is **manual**, based on Git and PM2:

1. **SSH** into the EC2 instance:
   ```bash
   ssh -i /path/to/your-key.pem ec2-user@YOUR_SERVER_IP
   ```

2. **Go to app directory:**
   ```bash
   cd ~/scrapper-screener/ShadcnExplore
   ```

3. **Pull latest code:**
   ```bash
   git pull
   ```

4. **Install dependencies** (if `package.json` or lockfile changed):
   ```bash
   npm install
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```
   - This runs `vite build` (front end) and `esbuild` (server bundle) and outputs to `dist/`.

6. **Restart the app with PM2:**
   ```bash
   pm2 restart scrapper-screener
   ```

7. **Optional — run DB migrations** (if this release includes schema changes):
   - See [MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md) and [server/migrations/README.md](../server/migrations/README.md).
   - Example: `npm run db:migrate-signals-updated-at` or `./server/migrations/runAllMigrations.sh`.
   - After migrations, run `pm2 restart scrapper-screener` again if needed.

There is **no separate reverse proxy or process name** documented in-repo; the single Node process serves both API and static files on `PORT`.

---

## 3. Technical Architecture (High Level)

```
                    ┌─────────────────────────────────────────┐
                    │              EC2 Instance                 │
                    │  ┌─────────────────────────────────────┐  │
                    │  │  PM2 (process manager)               │  │
                    │  │    └─ scrapper-screener              │  │
                    │  │         └─ node dist/index.js        │  │
                    │  │              (Express server)        │  │
                    │  │  • Serves /api/* (REST)              │  │
                    │  │  • Serves /* (static from dist/)     │  │
                    │  │  • Port: PORT env (default 5000)     │  │
                    │  └─────────────────────────────────────┘  │
                    │                  │                         │
                    │                  ▼                         │
                    │  ┌─────────────────────────────────────┐  │
                    │  │  PostgreSQL (DATABASE_URL)           │  │
                    │  │  (or Neon serverless)                │  │
                    │  └─────────────────────────────────────┘  │
                    └─────────────────────────────────────────┘
```

- **Single port:** One HTTP server; no separate “front-end server” in production.
- **Development:** Vite dev server is used for the client; the same Express app still serves the API and proxies as needed (`server/vite.ts`).
- **Database:** PostgreSQL (local or Neon). Connection and schema are in `server/db.ts` and `shared/schema.ts`.

---

## 4. Code Structure (Where What Lives)

### 4.1 Directory Layout

```
ShadcnExplore/
├── client/                 # Front end (React + Vite)
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── App.tsx          # App shell, routing (wouter), layout
│       ├── components/     # Reusable UI (incl. Shadcn, FormulaEditor, etc.)
│       ├── contexts/      # AuthContext
│       ├── hooks/
│       ├── lib/            # queryClient, etc.
│       ├── pages/          # Route-level pages (Dashboard, SectorsList, etc.)
│       └── utils/
├── server/                 # Back end (Express + TypeScript)
│   ├── index.ts            # Entry: Express app, cookie/JSON, routes, Vite/static, PORT listen
│   ├── routes.ts           # All REST API routes (auth, sectors, companies, formulas, signals, etc.)
│   ├── db.ts               # DB connection (Drizzle + pg or Neon)
│   ├── storage.ts          # Data access layer (DbStorage)
│   ├── auth.ts             # Passwords, sessions, OTP (email)
│   ├── middleware.ts       # requireAuth, requireRole, requirePermission
│   ├── vite.ts             # Dev: setupVite(); Prod: serveStatic
│   ├── scraper.ts          # Screener.in scraping
│   ├── scheduler.ts        # node-cron scraping & signal refresh jobs
│   ├── formulaEvaluator.ts # Simple formula evaluation
│   ├── excelFormulaEvaluator.ts  # Excel-style formula evaluation
│   ├── mainSignalEvaluator.ts    # Main signal evaluation for companies
│   ├── signalProcessor.ts  # Signal job processing
│   ├── taskManager.ts      # Background task management
│   ├── queryExecutor.ts    # Query execution (saved queries)
│   ├── excelQueryParser.ts # Excel query parsing
│   ├── email.ts            # SMTP / email (welcome, OTP, password reset, etc.)
│   ├── sms.ts              # SMS (e.g. OTP) — optional
│   ├── settingsManager.ts  # Visible metrics, banking metrics, config files
│   ├── permissions.ts      # Role permissions and checks
│   ├── seed.ts             # DB seed
│   ├── seedPermissions.ts  # Seed role permissions on startup
│   ├── migrations/         # One-off migration scripts (run manually / via npm scripts)
│   └── ... (other helpers and migrations)
├── shared/
│   └── schema.ts           # Drizzle schema + Zod insert/select schemas (shared by server and client types)
├── config/                 # App config (e.g. visible_metrics.json)
├── migrations/             # SQL migrations (some legacy)
├── scripts/                # Utility scripts (e.g. update_csv_tickers.ts)
├── tests/                  # Playwright e2e tests
├── package.json            # Scripts: dev, build, start, db:* , test
├── .env                    # Not committed; DATABASE_URL, PORT, NODE_ENV, email/SMS, etc.
├── SETUP.md                # Local setup, env vars, DB options
├── MIGRATION_GUIDE.md      # How to run migrations on server (incl. PM2 restart)
├── LOG_VIEWING_GUIDE.md    # How to view logs (incl. PM2)
└── docs/
    └── KT_TECHNICAL_DESIGN.md   # This document
```

### 4.2 Key Entry Points

| What                | Where |
|---------------------|--------|
| Server entry        | `server/index.ts` — Express app, middleware, route registration, Vite (dev) or static (prod), listen on `PORT` |
| API routes          | `server/routes.ts` — `registerRoutes(app)`; all `/api/*` handlers |
| DB connection       | `server/db.ts` — reads `DATABASE_URL`, uses Drizzle with `pg` or Neon |
| Schema (tables, Zod) | `shared/schema.ts` — used by server and for client types |
| Client entry        | `client/index.html` + Vite → `client/src/App.tsx` |
| Routing (client)     | `client/src/App.tsx` — wouter `Switch`/`Route` |

### 4.3 Main Back-End Modules (What They Do)

| Module | Purpose |
|--------|--------|
| **storage** | CRUD for users, roles, sectors, companies, formulas, signals, quarterly data, scraping logs, scheduler settings, sector schedules, bulk imports, etc. |
| **auth** | Hashing/verifying passwords, session create/get/delete, OTP generation and email OTP send/verify. |
| **scraper** | Fetch and parse Screener.in data; populate quarterly data. |
| **scheduler** | node-cron jobs: daily scraping, full signal refresh, per-sector schedules. |
| **formulaEvaluator** | Simple formula evaluation. |
| **excelFormulaEvaluator** | Excel-like formulas (Q12–Q16, P12–P16, etc.) and evaluation. |
| **mainSignalEvaluator** | Evaluate main signal for a company from quarterly data. |
| **signalProcessor** | Signal job queue/processing. |
| **taskManager** | Background task lifecycle. |
| **queryExecutor** | Run saved query definitions against the DB. |
| **email** | Welcome, admin notification, OTP, password reset, sector update completion. |
| **settingsManager** | Visible/banking metrics and order; config dir and files. |
| **permissions** | Role-based permission definitions and checks. |

### 4.4 Main Front-End Areas

| Area | Purpose |
|------|--------|
| **App.tsx** | Layout (sidebar, theme, global search), route definitions, auth vs public routes. |
| **contexts/AuthContext** | Auth state and login/logout. |
| **pages/** | Dashboard, SectorsList, SectorManager, CompanyManager, CompanyDetail, FormulaManager, FormulaBuilder, QueryBuilder, UserManagement, Settings, Roles, SchedulerSettings, Login, ForgotPassword, ResetPassword. |
| **components/** | Shadcn UI, AppSidebar, FormulaEditor, FormulaHelpPanel, GlobalSearch, ProtectedRoute, etc. |

### 4.5 Database and Migrations

- **ORM:** Drizzle. Schema is in `shared/schema.ts` (users, roles, sectors, companies, formulas, signals, quarterlyData, scrapingLogs, sectorUpdateHistory, bulk imports, scheduler settings, etc.).
- **Migrations:** Two concepts:
  - **Drizzle schema push:** `npm run db:push` (from schema to DB).
  - **One-off scripts:** Under `server/migrations/` (e.g. add column, create table). Run manually or via npm scripts like `npm run db:migrate-signals-updated-at`. See `server/migrations/README.md` for order and `runAllMigrations.ts`/`runAllMigrations.sh`.
- After any schema/migration change on the server, restart the app: `pm2 restart scrapper-screener`.

---

## 5. Environment and Configuration

- **Required:** `DATABASE_URL` (PostgreSQL or Neon).
- **Optional:** `PORT` (default 5000), `NODE_ENV` (development/production).
- **Email:** `EMAIL_PROVIDER`, `SMTP_*`, `APP_URL` — see `SETUP.md`.
- **SMS (optional):** `SMS_PROVIDER`, `TWILIO_*` / `AWS_*` — see `SETUP.md`.

All of this is loaded via `dotenv/config` in `server/index.ts` and used in `server/db.ts` and elsewhere. The `.env` file lives in the **ShadcnExplore** root and is not committed.

---

## 6. Build and Run (Summary)

| Environment | Command | Notes |
|-------------|---------|------|
| Development | `npm run dev` | NODE_ENV=development, tsx server, Vite dev server. |
| Production build | `npm run build` | Vite build + esbuild server bundle → `dist/`. |
| Production run | `npm start` | NODE_ENV=production, `node dist/index.js` (what PM2 runs). |

---

## 7. Related Docs and Scripts

- **[SETUP.md](../SETUP.md)** — Prerequisites, install, env vars, DB options, troubleshooting.
- **[MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md)** — Running migrations on the server, verification, PM2 restart.
- **[server/migrations/README.md](../server/migrations/README.md)** — Migration order, run-all, production deployment note.
- **[LOG_VIEWING_GUIDE.md](../LOG_VIEWING_GUIDE.md)** — Viewing logs (including PM2 and grep).
- **Repo root:** `copy_database_from_ec2.sh` — Copies a DB file from EC2 to local (SQLite path in script; app uses PostgreSQL on server).

---

## 8. Quick Reference: Deployment Checklist

1. SSH to EC2.
2. `cd ~/scrapper-screener/ShadcnExplore`.
3. `git pull` → `npm install` (if needed) → `npm run build`.
4. If there are DB changes: run migrations (see MIGRATION_GUIDE and server/migrations/README).
5. `pm2 restart scrapper-screener`.
6. `pm2 logs scrapper-screener` to confirm.

This document is the single place to understand **how we deploy (EC2, Git, PM2)**, **technical architecture**, and **where each part of the code lives** for ShadcnExplore.
