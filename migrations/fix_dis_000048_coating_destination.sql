-- Correct DIS-000048: slip header was COATING but dye_transactions still had destination GENERAL.
-- Coating batch chemical picker uses chemicals_available_for_coating, which sums ISSUE
-- transactions where destination matches '%coat%'. Store on-hand (dye_stock) is unchanged.

UPDATE public.dye_transactions
SET destination = 'COATING',
    notes = COALESCE(notes, '') || CASE
      WHEN notes IS NULL OR notes = '' THEN ''
      ELSE ' | '
    END || 'Destination corrected from GENERAL to COATING (slip DIS-000048).'
WHERE slip_no = 'DIS-000048'
  AND transaction_type = 'ISSUE'
  AND destination = 'GENERAL';
