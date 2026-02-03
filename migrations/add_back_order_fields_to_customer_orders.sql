-- Back orders: link child order to parent and mark back order
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS parent_order_id UUID NULL REFERENCES public.customer_orders(id) ON DELETE SET NULL;
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS is_back_order BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customer_orders.parent_order_id IS 'When set, this order is a back order for the parent (shortfall from partial fulfillment).';
COMMENT ON COLUMN public.customer_orders.is_back_order IS 'True when this order was auto-created as a back order for remaining quantity.';

CREATE INDEX IF NOT EXISTS idx_customer_orders_parent_order_id
  ON public.customer_orders(parent_order_id)
  WHERE parent_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_orders_is_back_order
  ON public.customer_orders(is_back_order)
  WHERE is_back_order = true;
