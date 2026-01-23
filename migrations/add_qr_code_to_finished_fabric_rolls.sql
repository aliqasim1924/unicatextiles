-- Migration: Add qr_code column to finished_fabric_rolls table
-- Date: 2024
-- Description: Adds QR code support for finished fabric rolls to enable QR code scanning and tracking

-- Add qr_code column to finished_fabric_rolls table
-- Making it nullable to support existing records
ALTER TABLE public.finished_fabric_rolls
ADD COLUMN IF NOT EXISTS qr_code TEXT;

-- Add comment to document the column
COMMENT ON COLUMN public.finished_fabric_rolls.qr_code IS 'QR code identifier for the finished fabric roll. Format: FFR-{timestamp}-{random}';

-- Optional: Create an index for faster lookups by QR code (if needed)
-- CREATE INDEX IF NOT EXISTS idx_finished_fabric_rolls_qr_code ON public.finished_fabric_rolls(qr_code);
