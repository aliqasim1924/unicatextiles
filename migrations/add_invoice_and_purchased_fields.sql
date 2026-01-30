-- Purchased base fabric: invoice and supplier on order
ALTER TABLE public.base_fabric_orders
  ADD COLUMN IF NOT EXISTS invoice_no TEXT NULL;
ALTER TABLE public.base_fabric_orders
  ADD COLUMN IF NOT EXISTS invoice_date DATE NULL;
ALTER TABLE public.base_fabric_orders
  ADD COLUMN IF NOT EXISTS purchased_from TEXT NULL;

COMMENT ON COLUMN public.base_fabric_orders.invoice_no IS 'Invoice number when is_outsourced = true.';
COMMENT ON COLUMN public.base_fabric_orders.invoice_date IS 'Invoice date when is_outsourced = true.';
COMMENT ON COLUMN public.base_fabric_orders.purchased_from IS 'Supplier/source when is_outsourced = true.';

-- Dyes & Chemicals: invoice number on transactions (e.g. receipts)
ALTER TABLE public.dye_transactions
  ADD COLUMN IF NOT EXISTS invoice_no TEXT NULL;

COMMENT ON COLUMN public.dye_transactions.invoice_no IS 'Invoice/reference number for receipt or adjustment.';
