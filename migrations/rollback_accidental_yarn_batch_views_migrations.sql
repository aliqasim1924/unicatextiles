-- Roll back accidental yarn batch migrations applied directly via MCP.
DROP VIEW IF EXISTS public.yarn_batch_balances;
DROP VIEW IF EXISTS public.yarn_batch_ledger;

ALTER TABLE public.yarn_transactions
  DROP CONSTRAINT IF EXISTS yarn_transactions_batch_no_required_for_receipt_issue;

DROP INDEX IF EXISTS public.idx_yarn_transactions_item_batch_time;
DROP INDEX IF EXISTS public.idx_yarn_transactions_batch_no;
