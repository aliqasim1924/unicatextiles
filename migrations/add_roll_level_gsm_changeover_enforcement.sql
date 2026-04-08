-- Adds roll-level GSM override support and enforces manager reason on changeovers.
ALTER TABLE public.base_fabric_rolls
ADD COLUMN IF NOT EXISTS actual_gsm numeric(10,2);

ALTER TABLE public.base_fabric_rolls
ADD COLUMN IF NOT EXISTS gsm_change_reason text;

CREATE OR REPLACE FUNCTION public.enforce_base_fabric_roll_gsm_change_reason()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  planned_gsm numeric;
BEGIN
  -- Only enforce when an actual GSM value is provided.
  IF NEW.actual_gsm IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT bfi.gsm
    INTO planned_gsm
  FROM public.base_fabric_orders bfo
  LEFT JOIN public.base_fabric_items bfi ON bfi.id = bfo.base_fabric_item_id
  WHERE bfo.id = NEW.base_fabric_order_id;

  -- Require manager reason when actual GSM differs from planned GSM,
  -- or when planned GSM is not available.
  IF planned_gsm IS NULL OR ABS(NEW.actual_gsm - planned_gsm) > 0.001 THEN
    IF NEW.gsm_change_reason IS NULL OR BTRIM(NEW.gsm_change_reason) = '' THEN
      RAISE EXCEPTION USING
        errcode = '23514',
        message = 'Production manager reason is required when actual GSM differs from planned GSM.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_base_fabric_roll_gsm_change_reason ON public.base_fabric_rolls;

CREATE TRIGGER trg_enforce_base_fabric_roll_gsm_change_reason
BEFORE INSERT OR UPDATE OF actual_gsm, gsm_change_reason, base_fabric_order_id
ON public.base_fabric_rolls
FOR EACH ROW
EXECUTE FUNCTION public.enforce_base_fabric_roll_gsm_change_reason();
