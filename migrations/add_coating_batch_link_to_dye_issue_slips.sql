-- Allow dye/chemical issue slips to be linked to a coating batch for traceability.
ALTER TABLE public.dye_issue_slips
ADD COLUMN IF NOT EXISTS coating_batch_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dye_issue_slips_coating_batch_id_fkey'
  ) THEN
    ALTER TABLE public.dye_issue_slips
    ADD CONSTRAINT dye_issue_slips_coating_batch_id_fkey
    FOREIGN KEY (coating_batch_id)
    REFERENCES public.coating_batches(id)
    ON DELETE SET NULL;
  END IF;
END $$;
