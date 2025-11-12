# Design Guidelines: Financial Data Analysis Platform

## Design Approach

**Selected Approach:** Design System - shadcn/ui + Data-Heavy Application Patterns

**Inspiration References:**
- Linear (clean productivity aesthetics, minimal chrome)
- Stripe Dashboard (data-heavy interfaces, clear hierarchy)
- Notion (information organization, table views)

**Core Principle:** Prioritize data visibility and functional clarity over decorative elements. Every pixel serves the user's analytical workflow.

---

## Typography

**Font Families:**
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for data tables, formulas)

**Hierarchy:**
- Page Titles: text-2xl font-semibold
- Section Headers: text-lg font-medium
- Body/Table Data: text-sm font-normal
- Labels/Meta: text-xs font-medium uppercase tracking-wide
- Formula/Code: text-sm font-mono

---

## Layout System

**Spacing Units:** Use Tailwind units of **2, 3, 4, 6, 8, 12, 16** consistently
- Component padding: p-4 to p-6
- Section spacing: space-y-6 to space-y-8
- Card padding: p-6
- Form field gaps: gap-4
- Table cell padding: p-3

**Container Strategy:**
- Full-width dashboard with sidebar: No max-width constraint
- Content areas within dashboard: max-w-7xl mx-auto
- Modal/dialog content: max-w-2xl to max-w-4xl
- Form containers: max-w-md

---

## Component Library

### Navigation & Layout

**Sidebar Navigation (Persistent):**
- Fixed left sidebar (w-64) with Logo at top
- Navigation items with icons (Heroicons)
- Role-based menu items visibility
- Active state with subtle background indicator
- User profile/logout at bottom

**Top Header Bar:**
- Breadcrumb navigation showing current context (Sector > Company)
- Global search input (prominent, always visible)
- Notification bell icon
- User avatar dropdown (role badge visible)

### Data Display Components

**Signal Badges:**
- BUY: Green badge with pill shape, uppercase text
- SELL: Red badge with pill shape, uppercase text
- HOLD: Yellow/amber badge with pill shape, uppercase text
- Use rounded-full px-3 py-1 text-xs font-semibold

**Data Tables:**
- Zebra striping (subtle gray alternating rows)
- Sticky headers on scroll
- Sortable columns (arrow indicators)
- Row hover state (subtle background change)
- Monospace font for numerical data alignment
- Compact density (h-12 rows)

**Cards:**
- Clean white cards with subtle border (border-gray-200)
- Minimal shadow (shadow-sm)
- Rounded corners (rounded-lg)
- Consistent padding (p-6)

### Excel-like Spreadsheet (Luckysheet)

**Container:**
- Full-height, full-width panel when active
- Toolbar integrated at top (formula bar, formatting controls)
- Sheet tabs at bottom
- Grid with clear cell borders
- Formula bar always visible when cell selected

### Query Builder

**Visual Builder:**
- Drag-drop zone with dashed border placeholder
- Filter condition cards (rounded-md border p-4)
- Logical operator badges (AND/OR) between conditions
- Field selector dropdowns with grouped options
- Value input fields inline with conditions
- Add/Remove condition buttons (icon-only, subtle)

### Forms & Authentication

**Login/Signup Pages:**
- Centered card layout (max-w-md mx-auto)
- Minimal branding (logo + app name at top)
- Tab switcher for Email/Password vs OTP login
- Form fields with labels above inputs
- Primary CTA button (full-width)
- Secondary links (text-sm text-gray-600)

**Form Inputs:**
- Clear labels (text-sm font-medium mb-2)
- Input fields with border (rounded-md border-gray-300)
- Focus ring (ring-2 ring-blue-500)
- Error states (border-red-500 + text-red-500 message below)
- Helper text below inputs (text-xs text-gray-500)

### Formula Manager (Admin)

**Formula List:**
- Table view with columns: Name, Scope, Condition, Signal, Priority, Enabled
- Scope badge indicators (Global/Sector/Company)
- Inline edit/delete actions (icon buttons)
- Add Formula button (top-right)
- Test formula button (opens modal with test data)

**Formula Editor Modal:**
- Large textarea for formula condition (font-mono)
- Scope selector (radio buttons: Global/Sector/Company)
- Conditional scope value input (sector dropdown or ticker input)
- Signal type selector (dropdown: BUY/SELL/HOLD)
- Priority number input (small width)
- Description textarea

### Dashboard & Sector Views

**Dashboard Layout:**
- Overview stats cards row (4 cards: Total Companies, Active Signals, Sectors, Last Update)
- Sectors grid (3-4 columns on desktop, responsive)
- Recent signals table (compact, last 10 signals)

**Sector View:**
- Sector header with breadcrumb
- Company list table with signal indicators
- Quick filters (signal type, metrics)
- Sort by signal/company name

**Company Detail:**
- Company header (ticker + name, sector badge)
- Quarterly data table (scrollable, many columns)
- Applied signals list (cards with formula name + result)
- Charts for key metrics (line charts, minimal styling)

---

## Icons & Assets

**Icon Library:** Heroicons (via CDN) - use outline variant for navigation, solid for actions
- Navigation: ChartBarIcon, BuildingOfficeIcon, TableCellsIcon, UserGroupIcon
- Actions: PlusIcon, TrashIcon, PencilIcon, ArrowPathIcon
- Signals: ArrowUpIcon (BUY), ArrowDownIcon (SELL), MinusIcon (HOLD)

**Images:** No hero images or marketing visuals needed for this application interface. Focus is on data and functionality.

---

## Animations

**Minimal Motion:**
- Transition properties only on interactive elements (buttons, dropdowns)
- Use transition-colors duration-200 for hover states
- Avoid scroll animations, parallax, or decorative motion
- Loading spinners for async operations (simple spinning circle)

---

## Role-Based Visual Cues

**Admin:** Full access - no visual restrictions
**Analyst:** "Create" buttons visible for tables/queries, formulas section read-only (grayed out edit buttons)
**Viewer:** All edit/create buttons hidden, tables/forms display-only mode (disabled inputs with cursor-not-allowed)

**Implementation:** Use disabled states, hidden buttons, and read-only indicators consistently across all interfaces for non-permitted actions.

---

## Accessibility

- All interactive elements minimum 44px touch target
- Form inputs with explicit labels (no placeholder-only)
- ARIA labels on icon-only buttons
- Keyboard navigation support (focus visible states)
- Sufficient contrast ratios (WCAG AA compliant)
- Table headers with proper scope attributes