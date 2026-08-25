-- ============================================================================
-- Remove base fabric rolls created by mistake (identified by QR codes).
-- Also removes their issue-slip lines so FK RESTRICT does not block deletion.
-- Keeps issue slip BFI-000045 (still has other valid rolls).
-- ============================================================================

-- 1) Remove issue lines for the two rolls that were issued to coating
DELETE FROM public.base_fabric_issue_lines
WHERE base_fabric_roll_id IN (
  SELECT id
  FROM public.base_fabric_rolls
  WHERE qr_code IN (
    'BFR-20260619-7QEION',
    'BFR-20260620-MT0V02'
  )
);

-- 2) Delete the mistaken rolls
DELETE FROM public.base_fabric_rolls
WHERE qr_code IN (
  'BFR-20260721-SRY5J8',
  'BFR-20260630-TBQO5O',
  'BFR-20260619-7QEION',
  'BFR-20260620-MT0V02'
);
