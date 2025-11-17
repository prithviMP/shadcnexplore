# Financial Data Analysis Platform

## Overview

This is a web-based financial data analysis platform designed to replace an Excel-based screening system. The application enables users to analyze company financial data across sectors, create custom formulas for signal generation (BUY/SELL/HOLD), and perform advanced queries on quarterly financial metrics.

The platform serves three user roles with varying permissions: Admins (full access), Analysts (view + create tables/queries), and Viewers (read-only access to signals and dashboards).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Tooling:**
- React 18+ with TypeScript for type safety
- Vite as the build tool and development server
- Wouter for client-side routing (lightweight alternative to React Router)
- TanStack Query (React Query) for server state management and data fetching

**UI Component System:**
- shadcn/ui component library with Radix UI primitives
- Tailwind CSS for styling with custom design tokens
- Design inspiration from Linear, Stripe Dashboard, and Notion
- Theme system supporting light/dark modes
- Custom color system using HSL with CSS variables

**Key Design Decisions:**
- **Component-first architecture**: Reusable UI components in `/client/src/components/ui/`
- **Page-based routing**: Main application pages in `/client/src/pages/`
- **Data-heavy interface patterns**: Tables, cards, and dashboards optimized for financial data display
- **Typography**: Inter font for UI, JetBrains Mono for data/code display
- **Spacing system**: Consistent Tailwind units (2, 3, 4, 6, 8, 12, 16)

**State Management Strategy:**
- React Query for server state (data fetching, caching, synchronization)
- React Context for theme management
- Local component state with useState for UI state
- Currently using mock data (marked with `//todo: remove mock functionality`)

### Backend Architecture

**Framework & Runtime:**
- Node.js with Express.js server
- TypeScript for type safety across the stack
- ESM (ES Modules) module system

**Server Structure:**
- Entry point: `server/index.ts`
- Route registration: `server/routes.ts` (currently minimal, ready for expansion)
- Storage abstraction: `server/storage.ts` with in-memory implementation
- Vite integration for development with HMR

**API Design Philosophy:**
- RESTful API design with `/api` prefix for all endpoints
- JSON request/response format
- Request logging middleware for debugging
- Storage interface pattern for future database integration

**Planned API Endpoints (from requirements):**
- Authentication: `/api/v1/auth/*` (register, login, OTP, logout)
- User Management: `/api/v1/users/*` (CRUD operations)
- Data: `/api/v1/companies/*`, `/api/v1/sectors/*`
- Formulas: `/api/v1/formulas/*` (CRUD with role-based access)
- Tables: `/api/v1/tables/*` (custom user tables)
- Queries: `/api/v1/queries/*` (query builder and execution)
- Scraper: `/api/v1/scraper/*` (web scraping triggers)

### Data Storage Solutions

**Current Implementation:**
- In-memory storage (`MemStorage` class) for users
- Interface-based design (`IStorage`) for easy migration to database

**Database Configuration (Drizzle ORM):**
- Drizzle ORM configured for PostgreSQL
- Schema location: `shared/schema.ts`
- Migration output: `./migrations`
- Database connection via `DATABASE_URL` environment variable
- Uses `@neondatabase/serverless` driver for Neon database support

**Schema Design:**
- Currently minimal: `users` table with id, username, password
- Planned tables (from requirements):
  - companies, quarterly_data, formulas, custom_tables
  - saved_queries, users, otp_codes, user_sessions, role_permissions

**Data Model Patterns:**
- Zod schemas for validation (via `drizzle-zod`)
- TypeScript types inferred from Drizzle schemas
- Separation of insert schemas vs. select schemas

### Authentication and Authorization

**Planned Authentication (from requirements):**
- Dual login methods: Email/password + Mobile OTP
- JWT token-based authentication
- Password hashing (bcrypt/argon2)
- OTP system with 5-10 minute expiry
- Session management with `connect-pg-simple` for PostgreSQL session store

**Role-Based Access Control (RBAC):**
- Three roles: Admin, Analyst, Viewer
- Permission hierarchy:
  - **Admin**: Full access (formulas, users, scraping, all features)
  - **Analyst**: View data, create/edit tables, use query builder
  - **Viewer**: Read-only (dashboards, signals only)
- Frontend route guards based on user role
- Backend middleware for permission checking (planned)

**Current State:**
- Mock authentication with hardcoded role ("admin")
- Sidebar navigation filtered by role
- No actual auth implementation yet (marked for implementation)

### Key Application Features

**Multi-Level Formula System:**
- Three scopes: Global, Sector-specific, Company-specific
- Priority-based evaluation for conflict resolution
- Custom formula language for financial metrics (ROE, PE, PEG, etc.)
- Signal generation: BUY/SELL/HOLD based on formula evaluation

**Data Visualization:**
- Dashboard with sector overview and recent signals
- Company detail pages with quarterly financial data tables
- Signal badges with color-coded indicators
- Gradient text effects for visual hierarchy

**Query Builder:**
- Visual filter builder for creating custom queries
- Saved query functionality
- Support for complex conditions (AND/OR logic)
- Available fields: ticker, sector, revenue, ROE, PE, debt, signals

**Custom Tables:**
- User-created tables for custom analysis
- Planned Excel-like spreadsheet functionality (mentioned Luckysheet in requirements)

## Recent Changes

### Signal Calculation Engine (Task 6) - November 17, 2025

**Implemented:**
- FormulaEvaluator service with condition parsing and evaluation logic
- Bulk and single-company signal calculation endpoints: 
  - POST `/api/signals/calculate` (bulk - all companies or selected subset)
  - POST `/api/signals/calculate/:companyId` (single company)
- Transaction-based signal reconciliation for data integrity
- Scope filtering: Global, Sector-specific, Company-specific formulas
- Priority-based evaluation (lowest number = highest priority)
- Error handling: Preserves existing signals when evaluation fails
- Frontend "Calculate Signals" button in FormulaManager with loading states

**Key Features:**
- Atomic signal updates using database transactions
- Always clears stale signals when evaluation succeeds
- Preserves valid signals when evaluation errors occur
- Validates company IDs before processing
- Requires scopeValue for sector/company scoped formulas

**Known Limitations (Future Enhancement Opportunities):**
1. **scopeValue Validation**: Not enforced at schema/API level during formula creation
   - Manual ID entry required for sector/company scopes
   - Future: Add dropdown selectors populated from `/api/sectors` and `/api/companies`
   - Future: Add schema-level validation (scope≠global ⇒ scopeValue required)

2. **Diagnostics & Observability**: Limited feedback on evaluation results
   - Current: Returns only `signalsGenerated` count
   - Future: Return detailed diagnostics per company (which formula matched, which were skipped, evaluation errors)
   - Future: Add logging for misconfigured formulas (blank scopeValue for sector/company scopes)

3. **Evaluation Robustness**: Basic error handling
   - Current: Catches errors and preserves signals, logs to console
   - Future: Two-phase evaluation (compute all results first, then reconcile)
   - Future: Structured error reporting in API responses

**Files Modified:**
- `server/formulaEvaluator.ts` - Core evaluation logic
- `server/routes.ts` - API endpoints for signal calculation
- `client/src/pages/FormulaManager.tsx` - UI for triggering calculations

## External Dependencies

### Third-Party UI Libraries
- **Radix UI**: Comprehensive set of unstyled, accessible components
  - Dialog, Dropdown Menu, Popover, Select, Tabs, Toast, Tooltip, etc.
  - All components prefixed with `@radix-ui/react-*`
- **shadcn/ui**: Pre-styled component system built on Radix UI
  - Configuration in `components.json`
  - Custom theming with Tailwind CSS
- **Embla Carousel**: Touch-friendly carousel component

### State Management & Data Fetching
- **TanStack Query**: Server state management, caching, and synchronization
- **React Hook Form**: Form state management with `@hookform/resolvers`

### Styling & Design
- **Tailwind CSS**: Utility-first CSS framework
- **PostCSS**: CSS processing with Autoprefixer
- **class-variance-authority**: Variant-based component styling
- **clsx + tailwind-merge**: Conditional class name utilities
- **Google Fonts**: Inter (UI) and JetBrains Mono (monospace) fonts

### Database & ORM
- **Drizzle ORM**: TypeScript ORM for SQL databases
- **Drizzle Kit**: Schema migrations and management
- **@neondatabase/serverless**: Neon Postgres serverless driver
- **Drizzle Zod**: Zod schema generation from Drizzle schemas

### Development Tools
- **Vite**: Build tool and dev server with HMR
- **TypeScript**: Type safety across frontend and backend
- **esbuild**: Fast JavaScript bundler (for production server build)
- **tsx**: TypeScript execution for Node.js development

### Planned Integrations (from requirements)
- **Web Scraping**: BeautifulSoup equivalent (Cheerio/JSDOM) for Screener.in data
- **SMS API**: Twilio or AWS SNS for OTP delivery
- **Session Storage**: PostgreSQL with `connect-pg-simple`

### Replit-Specific Tools
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development mode indicator