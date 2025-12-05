## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- framer-motion
- Supabase (database + auth)

## Design System
- Font: Inter
- Text color: **#0F172A** (dark, slate-900)
- Page background: **#F1F5F9** (light, slate-100)
- Card/surface background: **#FFFFFF**
- Primary buttons: **#0F766E** (teal-700)
- Primary hover: **#115E59** (teal-800)
- Secondary accent: **#6366F1** (indigo-500)
- Destructive: **#DC2626** (red-600)
- Borders: **#E2E8F0** (slate-200)

Design Rules:
- Always use DARK text on LIGHT backgrounds.
- Buttons must contrast and use teal as default.
- Pages should feel clean, minimal, and modern.
- Must work perfectly on mobile, tablet, laptop, desktop.

## Navigation & Modules

- Auth
  - /auth/login
  - /auth/register

- Toolbox (protected)
  - /toolbox
    - Main entry point after login
    - Shows 6 control cards:
      - Yarn Control
      - Base Fabric Control
      - Finished Fabric Control
      - Dyes & Chemicals
      - Stock Control
      - Orders & Dispatch
    - Includes quick shortcuts: Record Yarn Receiving, New Order, Scan QR Code
  - /toolbox/yarn
    - /toolbox/yarn/receiving
    - /toolbox/yarn/issuing
    - /toolbox/yarn/stock

Design System (Toolbox usage):
- Text: #0F172A
- Page background: #F1F5F9
- Card background: #FFFFFF
- Primary buttons: #0F766E (hover #115E59)
- Secondary accent: #6366F1
- Borders: #E2E8F0
- No dark-on-dark layouts

### Auth & Access

- Supabase Auth using email + password
- Public routes: /auth/login, /auth/register
- Protected routes: /toolbox and everything under /toolbox/**
- If not authenticated → redirect to /auth/login
- After login → redirect to /toolbox

### Suppliers Module

- Table: suppliers
- Screen: /toolbox/suppliers
  - List, add, and edit suppliers
- Each supplier has: name, code, contact info, default currency, active flag

### Yarn Module (Updated)

- Database:
  - yarn_items
    - now linked optionally to a default supplier (supplier_id)
  - yarn_transactions
    - now includes supplier_id, pricing and exchange rate fields
  - yarn_stock (view)

- Screens:
  - /toolbox/yarn
  - /toolbox/yarn/receiving
  - /toolbox/yarn/issuing
    - Shows current stock on hand for the selected yarn item (based on yarn_stock view)
    - Warns if the issue quantity exceeds available stock
    - Each issue transaction has a unique slip number (e.g. YIS-000001)
    - Slip number is shown on screen and on the printable Yarn Issue Slip
    - Generates a printable "Yarn Issue Slip" per transaction
    - Slip can be re-opened later via a URL and printed as a source document
    - Pattern will be reused later for Dyes & Chemicals Issue Slips
  - /toolbox/yarn/stock
  - /toolbox/yarn/items (new)
  - /toolbox/yarn/ledger/[yarnItemId]
    - Shows all yarn_transactions for the selected item
    - Displays type, quantity, source/destination, batch, notes, and date
    - Shows running balance per transaction
    - Ledger rows are clickable to view transaction details
  - /toolbox/yarn/transaction/[id]
    - Transaction Detail page for each transaction (read-only)
    - Shows complete transaction information including pricing if available
    - ISSUE transactions can reprint the Yarn Issue Slip from the detail page
    - No editing/adjustments yet; future work will add returns from department, etc.

- Features:
  - Manage Yarn Items (name, denier, material, color, default supplier, UOM, active)
  - Record receiving/issuing with proper yarn selection and supplier selection
  - Capture cost per receipt: USD, ZAR, and exchange rate (ZAR per USD)

- All screens follow the global design system (Inter, light backgrounds, dark text, teal buttons).

Notes:
- RLS is enabled on tables; yarn_stock view reflects policies from underlying tables.

Design system colors and layout rules apply to all pages in this module:
- Text: #0F172A
- Background: #F1F5F9 (page), #FFFFFF (cards)
- Primary buttons: #0F766E, hover #115E59
- Borders: #E2E8F0

