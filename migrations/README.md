# Database Migrations

This directory contains SQL migration files for the Unica Textiles System database.

## Running Migrations

### Option 1: Supabase SQL Editor (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of the migration file
5. Run the query

### Option 2: Supabase CLI
If you have Supabase CLI installed:
```bash
supabase db push migrations/add_qr_code_to_finished_fabric_rolls.sql
```

## Migration Files

### `add_qr_code_to_finished_fabric_rolls.sql`
- **Purpose**: Adds `qr_code` column to `finished_fabric_rolls` table
- **Date**: 2024
- **Description**: Enables QR code generation and tracking for finished fabric rolls
- **Impact**: Adds a nullable column, safe to run on existing databases

## Notes
- All migrations are designed to be idempotent (safe to run multiple times)
- Use `IF NOT EXISTS` clauses where possible to prevent errors on re-runs
- Always backup your database before running migrations in production
