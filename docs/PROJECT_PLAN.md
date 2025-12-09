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

### Toolbox Navigation
- Desktop: left sidebar with quick links (Home, Yarn Control, Dyes & Chemicals, Base Fabric)
- Mobile: hamburger button opening a slide-out menu with the same links
- Consistent Back button with arrow icon across Toolbox pages
- Navigation chrome is excluded from printed pages (print:hidden)

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
  - Yarn issues can optionally be linked to a Base Fabric Order
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

### Dyes & Chemicals Module

- DB:
  - dye_items
  - dye_transactions
  - dye_stock (view)
- Screens:
  - /toolbox/dyes
  - /toolbox/dyes/receiving
  - /toolbox/dyes/issuing
  - /toolbox/dyes/stock
- Master Data:
  - /toolbox/dyes/items – manage dyes & chemicals items.
- Issue Slips:
  - Each ISSUE transaction gets a slip number (e.g. DIS-000001).
  - Printable Dyes & Chemicals Issue Slip:
    - Can be re-opened and reprinted.
    - Has company footer (doc number, page number) and logo placeholder.
  - Same visual style as Yarn Issue Slip.
- Ledger:
  - /toolbox/dyes/ledger/[dyeItemId]
  - /toolbox/dyes/transaction/[transactionId]
  - Ledger shows all dye_transactions for an item.
  - Transaction detail is read-only and allows reprint of ISSUE slip.
- Uses shared suppliers:
  - Supplier is selected from suppliers table for receipts.
- Later: issue slips similar to Yarn Issuing.

### Base Fabric Module

- DB:
  - base_fabric_items
  - base_fabric_orders
  - base_fabric_rolls
- Concepts:
  - base_fabric_items: fabric specs (GSM, construction, width, etc.)
  - base_fabric_orders: weaving production orders (planned meters, loom, ETA, status)
  - base_fabric_rolls: actual rolls cut from the machine (length per roll)
  - Planned quantity (m) vs actual (sum of rolls)
  - Status: PLANNED, RUNNING, COMPLETED, CANCELLED
  - Over/under allowed, but completion requires a note if variance is significant
- Screens:
  - /toolbox/base-fabric
    - Dashboard with main actions
  - /toolbox/base-fabric/orders
    - Orders list (status, progress)
  - /toolbox/base-fabric/orders/new
    - Create new production order
  - /toolbox/base-fabric/orders/[id]
    - Order detail:
      - Show planned vs actual meters and variance
      - Capture rolls as they are cut
      - Start/Complete order with notes on variance
      - Show linked yarn consumption (if yarn issues are linked to this order):
        - Total yarn kg used
        - Total yarn cost (ZAR)
        - Yarn kg per meter
        - Yarn cost per meter
      - Yarn cost per order is calculated as:
        - For each yarn item, take weighted average unit price ZAR from RECEIPT/RETURN transactions (quantity-weighted)
        - Multiply that average by total ISSUE quantity linked to the order
        - Sum across yarn items for total yarn cost
      - Base Fabric cost (yarn only) per meter = total yarn cost / total produced meters
- Master Data:
  - /toolbox/base-fabric/items
    - Manage base_fabric_items (name, construction, GSM, width, active).
- Rolls:
  - Each roll gets an auto-generated roll number (e.g. BFR-000001).
  - Each roll stores a cut time.
- Production Report:
  - The order detail page can be printed as a one-page production report
    showing planned vs actual and all rolls.
- Follows existing design system (light backgrounds, dark text, teal buttons).
- Coating Intake:
  - Coating Receiving:
    - Rolls issued from Weaving (status: IN_TRANSIT, location: COATING) are received into Coating.
    - Receiving creates a Coating Receiving Slip with its own sequence.
    - On receiving, rolls move to status: READY_FOR_COATING at location: COATING.
- Movement:
  - Base Fabric rolls can be issued from Weaving to Coating using an Issue Slip.
  - Each roll carries a stable QR code value that identifies it; location/status and other properties can change in the DB without changing the QR.
- Screens:
  - /toolbox/base-fabric/issuing
    - Create Issue Slip to Coating.
    - Select rolls (later: scan via QR).

