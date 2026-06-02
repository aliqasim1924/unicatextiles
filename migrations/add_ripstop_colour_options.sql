-- Add RIPSTOP colour options (catalog-driven dropdowns across the app)
-- Safe to rerun: skips colours that already exist for RIPSTOP

INSERT INTO public.fabric_type_color_options (fabric_type_id, color_name, is_active)
SELECT ft.id, v.color_name, true
FROM public.fabric_types ft
CROSS JOIN (
  VALUES
    ('Khakhi'),
    ('Tan Sand'),
    ('Camel'),
    ('Tan Beige'),
    ('Royal Blue'),
    ('Red')
) AS v(color_name)
WHERE ft.code = 'RIPSTOP'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fabric_type_color_options c
    WHERE c.fabric_type_id = ft.id
      AND lower(c.color_name) = lower(v.color_name)
  );
