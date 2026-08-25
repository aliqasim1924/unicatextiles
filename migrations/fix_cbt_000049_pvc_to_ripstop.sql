-- ============================================================================
-- CBT-000049 was created as PVC by mistake; reclassify to RIPSTOP.
-- Keeps Olive Green / 320 GSM / 1800 mm; remaps catalog option FKs.
-- Also updates finished rolls and store receipt items from this batch.
-- ============================================================================

WITH ripstop AS (
  SELECT id AS fabric_type_id
  FROM public.fabric_types
  WHERE code = 'RIPSTOP'
),
opts AS (
  SELECT
    r.fabric_type_id,
    g.id AS gsm_option_id,
    c.id AS color_option_id,
    w.id AS width_option_id
  FROM ripstop r
  JOIN public.fabric_type_gsm_options g
    ON g.fabric_type_id = r.fabric_type_id AND g.gsm = 320
  JOIN public.fabric_type_color_options c
    ON c.fabric_type_id = r.fabric_type_id AND c.color_name = 'Olive Green'
  JOIN public.fabric_type_width_options w
    ON w.fabric_type_id = r.fabric_type_id AND w.width_mm = 1800
),
batch AS (
  SELECT id
  FROM public.coating_batches
  WHERE batch_no = 'CBT-000049'
)
UPDATE public.coating_batches cb
SET
  fabric_type_id = o.fabric_type_id,
  gsm_option_id = o.gsm_option_id,
  color_option_id = o.color_option_id,
  width_option_id = o.width_option_id,
  coating_type = 'RIPSTOP'
FROM opts o, batch b
WHERE cb.id = b.id;

WITH ripstop AS (
  SELECT id AS fabric_type_id
  FROM public.fabric_types
  WHERE code = 'RIPSTOP'
),
opts AS (
  SELECT
    r.fabric_type_id,
    g.id AS gsm_option_id,
    c.id AS color_option_id,
    w.id AS width_option_id
  FROM ripstop r
  JOIN public.fabric_type_gsm_options g
    ON g.fabric_type_id = r.fabric_type_id AND g.gsm = 320
  JOIN public.fabric_type_color_options c
    ON c.fabric_type_id = r.fabric_type_id AND c.color_name = 'Olive Green'
  JOIN public.fabric_type_width_options w
    ON w.fabric_type_id = r.fabric_type_id AND w.width_mm = 1800
),
batch AS (
  SELECT id
  FROM public.coating_batches
  WHERE batch_no = 'CBT-000049'
)
UPDATE public.finished_fabric_rolls ffr
SET
  fabric_type_id = o.fabric_type_id,
  gsm_option_id = o.gsm_option_id,
  color_option_id = o.color_option_id,
  width_option_id = o.width_option_id,
  coating_type = 'RIPSTOP'
FROM opts o, batch b
WHERE ffr.batch_id = b.id;

UPDATE public.finished_fabric_store_receipt_items ri
SET coating_type = 'RIPSTOP'
FROM public.finished_fabric_rolls ffr
JOIN public.coating_batches cb ON cb.id = ffr.batch_id
WHERE ri.roll_id = ffr.id
  AND cb.batch_no = 'CBT-000049';
