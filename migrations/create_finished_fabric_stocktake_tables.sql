-- Finished fabric stocktake tables
-- Sessions: header for each stocktake run
-- Lines: one per finished fabric roll counted in the session

CREATE TABLE IF NOT EXISTS public.finished_fabric_stocktake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stocktake_date DATE NOT NULL,
  performed_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finished_fabric_stocktake_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.finished_fabric_stocktake_sessions(id) ON DELETE CASCADE,
  finished_fabric_roll_id UUID NOT NULL REFERENCES public.finished_fabric_rolls(id),
  system_qty NUMERIC NOT NULL,
  counted_qty NUMERIC,
  variance_qty NUMERIC,
  reason TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_finished_fabric_stocktake_lines_session
  ON public.finished_fabric_stocktake_lines(session_id);

CREATE INDEX IF NOT EXISTS idx_finished_fabric_stocktake_lines_roll
  ON public.finished_fabric_stocktake_lines(finished_fabric_roll_id);

