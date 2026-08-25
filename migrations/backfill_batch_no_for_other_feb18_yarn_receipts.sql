-- Backfill missing batch numbers for remaining yarn receipts on 2026-02-18.
-- Mapping requested by production:
-- - 2/250 (stored as 250x2.....500D/192F) => 20260218-001
-- - 2/300 (2/300D/96F IMG Polyester Yarn) => 20260218-002

UPDATE public.yarn_transactions
SET batch_no = CASE id
  WHEN '4bdbbd8f-aed5-441d-a99a-2ece2a3599f8' THEN '20260218-001'
  WHEN '7e47d62d-f476-498c-8ff2-e109c1e0c86b' THEN '20260218-002'
  ELSE batch_no
END
WHERE id IN (
  '4bdbbd8f-aed5-441d-a99a-2ece2a3599f8',
  '7e47d62d-f476-498c-8ff2-e109c1e0c86b'
);
