-- Ripstop: rename Grey -> Dark Grey and add Light Grey
-- PVC: add Beige
-- Safe to rerun.

-- 1. Rename Ripstop Grey to Dark Grey (preserves existing color_option_id references)
UPDATE public.fabric_type_color_options c
SET color_name = 'Dark Grey'
FROM public.fabric_types ft
WHERE c.fabric_type_id = ft.id
  AND ft.code = 'RIPSTOP'
  AND trim(c.color_name) = 'Grey';

-- 2. Add Light Grey for Ripstop
INSERT INTO public.fabric_type_color_options (fabric_type_id, color_name, is_active)
SELECT ft.id, 'Light Grey', true
FROM public.fabric_types ft
WHERE ft.code = 'RIPSTOP'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fabric_type_color_options c
    WHERE c.fabric_type_id = ft.id
      AND lower(trim(c.color_name)) = lower('Light Grey')
  );

-- 3. Add Beige for PVC
INSERT INTO public.fabric_type_color_options (fabric_type_id, color_name, is_active)
SELECT ft.id, 'Beige', true
FROM public.fabric_types ft
WHERE ft.code = 'PVC'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fabric_type_color_options c
    WHERE c.fabric_type_id = ft.id
      AND lower(trim(c.color_name)) = lower('Beige')
  );

-- 4. Backfill denormalized colour text where Ripstop Grey was stored
UPDATE public.finished_fabric_rolls
SET color = 'Dark Grey'
WHERE lower(trim(coating_type)) LIKE '%ripstop%'
  AND trim(color) = 'Grey';

UPDATE public.coating_batches
SET color = 'Dark Grey'
WHERE lower(trim(coating_type)) LIKE '%ripstop%'
  AND trim(color) = 'Grey';

UPDATE public.customer_order_lines col
SET color = 'Dark Grey'
FROM public.fabric_type_color_options c
JOIN public.fabric_types ft ON ft.id = c.fabric_type_id
WHERE col.color_option_id = c.id
  AND ft.code = 'RIPSTOP'
  AND trim(col.color) = 'Grey';
