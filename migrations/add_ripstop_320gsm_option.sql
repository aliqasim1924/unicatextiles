-- Add 320 GSM option for RIPSTOP finished fabric (catalog-driven dropdowns)

INSERT INTO public.fabric_type_gsm_options (fabric_type_id, gsm, is_active)
SELECT ft.id, 320, true
FROM public.fabric_types ft
WHERE ft.code = 'RIPSTOP'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fabric_type_gsm_options g
    WHERE g.fabric_type_id = ft.id
      AND g.gsm = 320
  );
