-- Enforce lot/batch capture for yarn receipt and issue transactions.
CREATE OR REPLACE FUNCTION public.enforce_yarn_transaction_batch_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.transaction_type IN ('RECEIPT', 'ISSUE', 'DEPT_TO_ORDER') THEN
    IF NEW.batch_no IS NULL OR BTRIM(NEW.batch_no) = '' THEN
      RAISE EXCEPTION USING
        errcode = '23514',
        message = 'Lot / Batch No is required for yarn receipts and issues.';
    END IF;

    NEW.batch_no := BTRIM(NEW.batch_no);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_yarn_transaction_batch_no ON public.yarn_transactions;

CREATE TRIGGER trg_enforce_yarn_transaction_batch_no
BEFORE INSERT OR UPDATE OF transaction_type, batch_no
ON public.yarn_transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_yarn_transaction_batch_no();
