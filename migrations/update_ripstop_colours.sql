-- Colours for Ripstop: remove White, Tan, Earth Brown; add Rust, Autumn Brown
-- Identifies Ripstop by fabric_types.name or code (case-insensitive).

-- Remove White, Tan, Earth Brown for Ripstop
DELETE FROM public.fabric_type_color_options
WHERE fabric_type_id IN (
  SELECT id FROM public.fabric_types
  WHERE LOWER(TRIM(name)) = 'ripstop' OR LOWER(TRIM(code)) = 'ripstop'
)
AND TRIM(color_name) IN ('White', 'Tan', 'Earth Brown');

-- Add Rust and Autumn Brown for Ripstop (if not already present)
INSERT INTO public.fabric_type_color_options (fabric_type_id, color_name, is_active)
SELECT ft.id, 'Rust', true
FROM public.fabric_types ft
WHERE (LOWER(TRIM(ft.name)) = 'ripstop' OR LOWER(TRIM(ft.code)) = 'ripstop')
AND NOT EXISTS (
  SELECT 1 FROM public.fabric_type_color_options o
  WHERE o.fabric_type_id = ft.id AND TRIM(o.color_name) = 'Rust'
);

INSERT INTO public.fabric_type_color_options (fabric_type_id, color_name, is_active)
SELECT ft.id, 'Autumn Brown', true
FROM public.fabric_types ft
WHERE (LOWER(TRIM(ft.name)) = 'ripstop' OR LOWER(TRIM(ft.code)) = 'ripstop')
AND NOT EXISTS (
  SELECT 1 FROM public.fabric_type_color_options o
  WHERE o.fabric_type_id = ft.id AND TRIM(o.color_name) = 'Autumn Brown'
);
