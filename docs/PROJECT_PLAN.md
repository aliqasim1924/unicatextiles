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
  - /toolbox/yarn
    - /toolbox/yarn/receiving
    - /toolbox/yarn/issuing
    - /toolbox/yarn/stock

### Auth & Access

- Supabase Auth using email + password
- Public routes: /auth/login, /auth/register
- Protected routes: /toolbox and everything under /toolbox/**
- If not authenticated → redirect to /auth/login
- After login → redirect to /toolbox

### Yarn Module (Database + Screens)
- Database tables:
  - yarn_items
  - yarn_transactions
  - yarn_stock (view)
- Features:
  - Yarn Receiving
  - Yarn Issuing
  - Yarn Stock Overview
- Routes:
  - /toolbox/yarn
  - /toolbox/yarn/receiving
  - /toolbox/yarn/issuing
  - /toolbox/yarn/stock

Notes:
- RLS is enabled on tables; yarn_stock view reflects policies from underlying tables.

Design system colors and layout rules apply to all pages in this module.

