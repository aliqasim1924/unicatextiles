-- Migration: Weaving beams master + beam loading & weft usage per base fabric order
-- No database clearance. Adds tables and one column.

-- 1. Beams master (steel beams used for warp)
CREATE TABLE IF NOT EXISTS public.weaving_beams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beam_no TEXT NOT NULL UNIQUE,
  tare_weight_kg NUMERIC NOT NULL CHECK (tare_weight_kg >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.weaving_beams IS 'Master list of steel beams (warp). Beam number and empty weight for scale-based yarn tracking.';

-- 2. Beam loading per production order (warp yarn on beam)
CREATE TABLE IF NOT EXISTS public.base_fabric_order_beams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_fabric_order_id UUID NOT NULL REFERENCES public.base_fabric_orders(id) ON DELETE CASCADE,
  beam_id UUID NOT NULL REFERENCES public.weaving_beams(id),
  yarn_item_id UUID NOT NULL REFERENCES public.yarn_items(id),
  weight_ready_kg NUMERIC NOT NULL CHECK (weight_ready_kg >= 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_base_fabric_order_beams_order
  ON public.base_fabric_order_beams(base_fabric_order_id);

COMMENT ON TABLE public.base_fabric_order_beams IS 'Beam(s) loaded per base fabric order. Yarn loaded = weight_ready_kg - beam tare. Only issued yarn should be selected.';

-- 3. Weft usage per production order (cones)
CREATE TABLE IF NOT EXISTS public.base_fabric_order_weft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_fabric_order_id UUID NOT NULL REFERENCES public.base_fabric_orders(id) ON DELETE CASCADE,
  yarn_item_id UUID NOT NULL REFERENCES public.yarn_items(id),
  cone_sequence INT,
  kg_start NUMERIC NOT NULL CHECK (kg_start >= 0),
  kg_end NUMERIC NOT NULL CHECK (kg_end >= 0),
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_base_fabric_order_weft_order
  ON public.base_fabric_order_weft(base_fabric_order_id);

COMMENT ON TABLE public.base_fabric_order_weft IS 'Weft cone usage per order. Consumption = kg_start - kg_end. Only issued yarn should be selected.';

-- 4. Flag to grandfather existing RUNNING orders (skip beam/weft requirement)
ALTER TABLE public.base_fabric_orders
  ADD COLUMN IF NOT EXISTS beam_weft_not_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.base_fabric_orders.beam_weft_not_required IS 'If true, order can be completed without beam/weft data (e.g. already on machine at go-live).';

-- One-off: mark existing RUNNING orders so they can complete without beam/weft
UPDATE public.base_fabric_orders
SET beam_weft_not_required = true
WHERE status = 'RUNNING' AND (beam_weft_not_required IS NULL OR beam_weft_not_required = false);
