# Unica Textile Mills — Next.js 14

Production-ready starter using Next.js 14 App Router, TypeScript, Tailwind CSS, framer-motion, and Supabase.

## Quickstart

1) Install dependencies  
`npm install`

2) Environment variables  
Copy `.env.example` to `.env.local` and set:
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

3) Run in development  
`npm run dev`

Open http://localhost:3000 to view the app.

## Deployment (Vercel or Netlify)
- Add the same Supabase variables in your hosting dashboard.
- Build command: `npm run build`
- Start command (if required): `npm start`
- Recommended runtime: Node.js 18+.

## Project Structure
- `src/app` — App Router pages, layout, and global styles.
- `src/lib/supabase` — Browser and server Supabase clients.
- `docs/PROJECT_PLAN.md` — Living project plan and design system rules.

## Design System Highlights
- Font: Inter
- Text color: #0F172A
- Page background: #F1F5F9
- Surface background: #FFFFFF
- Primary: #0F766E (hover #115E59)
- Secondary: #6366F1
- Destructive: #DC2626
- Borders: #E2E8F0
