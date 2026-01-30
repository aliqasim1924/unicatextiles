-- Add outsourced (purchased) base fabric support to base_fabric_orders
-- (OS) = outsourced: fabric purchased as whole, not produced in-house

ALTER TABLE public.base_fabric_orders
  ADD COLUMN IF NOT EXISTS is_outsourced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.base_fabric_orders
  ADD COLUMN IF NOT EXISTS purchased_cost_per_m_zar NUMERIC(12, 4) NULL;

COMMENT ON COLUMN public.base_fabric_orders.is_outsourced IS 'True when base fabric was purchased (outsourced), not woven in-house.';
COMMENT ON COLUMN public.base_fabric_orders.purchased_cost_per_m_zar IS 'Cost per metre (ZAR) when is_outsourced = true.';
