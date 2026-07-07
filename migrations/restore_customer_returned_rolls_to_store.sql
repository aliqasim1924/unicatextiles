-- Restore customer-returned rolls stuck in RETURNED status back to Finished Store stock.
-- Uses the length_m and grade recorded on each customer_return_lines row.

UPDATE public.finished_fabric_rolls ffr
SET
  status = 'IN_STORE',
  current_location = 'FINISHED_STORE',
  length_m = crl.length_m,
  grade = COALESCE(crl.grade, ffr.grade),
  received_store_at = cr.created_at,
  received_store_by = cr.returned_by
FROM public.customer_return_lines crl
JOIN public.customer_returns cr ON cr.id = crl.return_id
WHERE ffr.id = crl.roll_id
  AND ffr.status = 'RETURNED'
  AND ffr.current_location = 'RETURNED';
