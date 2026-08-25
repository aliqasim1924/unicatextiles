-- Backfill missing batch numbers for historical 150x2 yarn movements.
-- Context:
-- - Receipt on 2026-02-18 for 150x2 yarn had no batch number.
-- - Related issue on 2026-04-15 also had no batch number.
-- - Assign both to batch 20260218-003 for consistent traceability.

UPDATE public.yarn_transactions
SET batch_no = '20260218-003'
WHERE id IN (
  'b862b1ec-d5f9-4747-95e7-0e9190852514', -- RECEIPT 2026-02-18, 4500.000 kg
  '0caf0a5e-f469-4c6a-9630-999002875a4d'  -- ISSUE   2026-04-15, 2700.000 kg
);
