-- Outsourced (purchased) finished fabric: invoice header, line items, roll linkage

CREATE TABLE IF NOT EXISTS public.finished_fabric_outsource_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT NULL,
  invoice_date DATE NULL,
  purchased_from TEXT NULL,
  notes TEXT NULL,
  created_by UUID NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finished_fabric_outsource_purchases IS
  'Invoice header when finished fabric is purchased from an external supplier (outsourced).';

CREATE TABLE IF NOT EXISTS public.finished_fabric_outsource_purchase_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.finished_fabric_outsource_purchases(id) ON DELETE CASCADE,
  fabric_type_id UUID NULL REFERENCES public.fabric_types(id),
  color_option_id UUID NULL REFERENCES public.fabric_type_color_options(id),
  gsm_option_id UUID NULL REFERENCES public.fabric_type_gsm_options(id),
  width_option_id UUID NULL REFERENCES public.fabric_type_width_options(id),
  cost_per_m_zar NUMERIC(12, 4) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finished_fabric_outsource_purchase_lines IS
  'Line item on an outsourced finished fabric purchase (fabric spec + cost per metre).';

ALTER TABLE public.finished_fabric_rolls
  ADD COLUMN IF NOT EXISTS is_outsourced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.finished_fabric_rolls
  ADD COLUMN IF NOT EXISTS outsource_purchase_line_id UUID NULL
    REFERENCES public.finished_fabric_outsource_purchase_lines(id) ON DELETE SET NULL;

ALTER TABLE public.finished_fabric_rolls
  ADD COLUMN IF NOT EXISTS purchased_cost_per_m_zar NUMERIC(12, 4) NULL;

COMMENT ON COLUMN public.finished_fabric_rolls.is_outsourced IS
  'True when roll was purchased from an external supplier, not produced in-house.';
COMMENT ON COLUMN public.finished_fabric_rolls.outsource_purchase_line_id IS
  'Purchase line this roll was recorded under when is_outsourced = true.';
COMMENT ON COLUMN public.finished_fabric_rolls.purchased_cost_per_m_zar IS
  'Cost per metre (ZAR) when is_outsourced = true.';

CREATE INDEX IF NOT EXISTS idx_ff_outsource_purchase_lines_purchase_id
  ON public.finished_fabric_outsource_purchase_lines(purchase_id);

CREATE INDEX IF NOT EXISTS idx_finished_fabric_rolls_outsource_line
  ON public.finished_fabric_rolls(outsource_purchase_line_id)
  WHERE outsource_purchase_line_id IS NOT NULL;

-- RLS (match other finished fabric tables)
ALTER TABLE public.finished_fabric_outsource_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finished_fabric_outsource_purchase_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access ff outsource purchases"
  ON public.finished_fabric_outsource_purchases;
CREATE POLICY "Allow authenticated full access ff outsource purchases"
  ON public.finished_fabric_outsource_purchases FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access ff outsource purchases"
  ON public.finished_fabric_outsource_purchases;
CREATE POLICY "Allow anon full access ff outsource purchases"
  ON public.finished_fabric_outsource_purchases FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access ff outsource purchase lines"
  ON public.finished_fabric_outsource_purchase_lines;
CREATE POLICY "Allow authenticated full access ff outsource purchase lines"
  ON public.finished_fabric_outsource_purchase_lines FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access ff outsource purchase lines"
  ON public.finished_fabric_outsource_purchase_lines;
CREATE POLICY "Allow anon full access ff outsource purchase lines"
  ON public.finished_fabric_outsource_purchase_lines FOR ALL TO anon
  USING (true) WITH CHECK (true);
