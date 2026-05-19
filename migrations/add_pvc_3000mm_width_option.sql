-- Add 3000 mm width option for PVC finished fabric (visible in all catalog-driven dropdowns)

INSERT INTO public.fabric_type_width_options (fabric_type_id, width_mm, is_active)
SELECT ft.id, 3000, true
FROM public.fabric_types ft
WHERE ft.code = 'PVC'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fabric_type_width_options w
    WHERE w.fabric_type_id = ft.id
      AND w.width_mm = 3000
  );
