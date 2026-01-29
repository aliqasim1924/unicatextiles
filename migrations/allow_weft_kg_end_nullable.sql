-- Allow kg_end to be filled later (when cone or production run finishes)
ALTER TABLE public.base_fabric_order_weft
  ALTER COLUMN kg_end DROP NOT NULL;

-- Drop the CHECK constraint that required kg_end >= 0 (so NULL is allowed)
-- If the constraint name is standard, it might be base_fabric_order_weft_kg_end_check
ALTER TABLE public.base_fabric_order_weft
  DROP CONSTRAINT IF EXISTS base_fabric_order_weft_kg_end_check;

-- Re-add check so when kg_end is set it must be >= 0
ALTER TABLE public.base_fabric_order_weft
  ADD CONSTRAINT base_fabric_order_weft_kg_end_check CHECK (kg_end IS NULL OR kg_end >= 0);
