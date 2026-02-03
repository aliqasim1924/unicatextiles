-- Add price (Rand) per line for order value tracking
ALTER TABLE public.customer_order_lines
  ADD COLUMN IF NOT EXISTS price_rand NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.customer_order_lines.price_rand IS 'Line value in South African Rand (R). Used for order value tracking.';
