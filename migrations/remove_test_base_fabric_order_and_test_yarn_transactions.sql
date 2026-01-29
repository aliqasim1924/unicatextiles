-- ============================================================================
-- Remove test base fabric production order and all issuing/receiving for test yarn.
-- Keeps: test beam (weaving_beams), test yarn items (yarn_items).
-- Run in Supabase SQL Editor.
-- ============================================================================

-- 1) Remove base fabric order BFO-000003 and its dependent data

-- 1a) Delete yarn transactions (issues) linked to the test order
DELETE FROM public.yarn_transactions
WHERE base_fabric_order_id IN (
  SELECT id FROM public.base_fabric_orders
  WHERE order_no = 'BFO-000003'
);

-- 1b) Delete rolls for the test order
DELETE FROM public.base_fabric_rolls
WHERE base_fabric_order_id IN (
  SELECT id FROM public.base_fabric_orders
  WHERE order_no = 'BFO-000003'
);

-- 1c) Delete the test order (CASCADE removes base_fabric_order_beams and base_fabric_order_weft)
DELETE FROM public.base_fabric_orders
WHERE order_no = 'BFO-000003';

-- 2) Remove all issuing and receiving (yarn_transactions) for test yarn items only.
--    Test yarn items are identified by name containing 'test'. Master yarn_items are kept.
DELETE FROM public.yarn_transactions
WHERE yarn_item_id IN (
  SELECT id FROM public.yarn_items
  WHERE name ILIKE '%test%'
);

SELECT 'Test base fabric order(s) and test yarn transactions removed. Test beam and test yarn items kept.' AS status;
