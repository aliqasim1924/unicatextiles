-- Customer returns (finished fabric): credit, refund, or exchange
CREATE TABLE IF NOT EXISTS public.customer_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  original_issue_id UUID REFERENCES public.finished_fabric_store_issues(id) ON DELETE SET NULL,
  original_order_id UUID REFERENCES public.customer_orders(id) ON DELETE SET NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('CREDIT', 'EXCHANGE', 'REFUND')),
  pastel_credit_note_no TEXT,
  reason TEXT,
  notes TEXT,
  exchange_slip_no TEXT
);

COMMENT ON TABLE public.customer_returns IS 'Finished fabric returns from customers (credit, refund, or exchange).';
COMMENT ON COLUMN public.customer_returns.pastel_credit_note_no IS 'Pastel credit note number when disposition is CREDIT or REFUND.';
COMMENT ON COLUMN public.customer_returns.exchange_slip_no IS 'Exchange slip number when disposition is EXCHANGE (e.g. FEX-000001).';

CREATE TABLE IF NOT EXISTS public.customer_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.customer_returns(id) ON DELETE CASCADE,
  roll_id UUID NOT NULL REFERENCES public.finished_fabric_rolls(id) ON DELETE CASCADE,
  length_m NUMERIC,
  grade TEXT,
  notes TEXT
);

COMMENT ON TABLE public.customer_return_lines IS 'Rolls returned per customer return.';

CREATE INDEX IF NOT EXISTS idx_customer_returns_customer_id ON public.customer_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_returns_created_at ON public.customer_returns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_return_lines_return_id ON public.customer_return_lines(return_id);

-- RLS: enable and allow authenticated users (adjust policies per your auth rules)
ALTER TABLE public.customer_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.customer_returns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON public.customer_return_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
