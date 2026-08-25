-- Production order allocation (DEPT_TO_ORDER) should not require batch selection.
-- Batch traceability is enforced at receipt and issue stages.
CREATE OR REPLACE FUNCTION public.enforce_yarn_transaction_batch_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.transaction_type IN ('RECEIPT', 'ISSUE') THEN
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
