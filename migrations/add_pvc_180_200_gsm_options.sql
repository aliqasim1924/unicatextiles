-- Add 180 and 200 GSM options for PVC finished fabric (visible in all catalog-driven dropdowns)
-- Safe to rerun: skips GSM values that already exist for PVC

INSERT INTO public.fabric_type_gsm_options (fabric_type_id, gsm, is_active)
SELECT ft.id, v.gsm, true
FROM public.fabric_types ft
CROSS JOIN (
  VALUES
    (180),
    (200)
) AS v(gsm)
WHERE ft.code = 'PVC'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fabric_type_gsm_options g
    WHERE g.fabric_type_id = ft.id
      AND g.gsm = v.gsm
  );
