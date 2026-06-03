-- Remove cancelled coating batch CBT-000052 (no linked base rolls, chemicals, or finished rolls)

DELETE FROM public.coating_batches
WHERE batch_no = 'CBT-000052'
  AND status = 'CANCELLED';
