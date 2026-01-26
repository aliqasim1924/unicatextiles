-- ============================================================================
-- COMPLETE DATABASE CLEAR SCRIPT
-- Clears all transactional data while preserving master items. Restarts numbering.
-- Run this in Supabase SQL Editor, or use the migration:
--   clear_transactional_data_keep_masters_reset_sequences
-- ============================================================================
-- MASTER ITEMS PRESERVED: yarn_items, dye_items, base_fabric_items, customers,
--   suppliers, fabric_types, fabric_type_gsm_options, fabric_type_color_options,
--   fabric_type_width_options
-- ============================================================================

-- 1. Truncate transactional tables (order respects FKs)
TRUNCATE TABLE public.finished_fabric_store_issue_items CASCADE;
TRUNCATE TABLE public.finished_fabric_store_issues CASCADE;
TRUNCATE TABLE public.finished_fabric_store_receipt_items CASCADE;
TRUNCATE TABLE public.finished_fabric_store_receipts CASCADE;
TRUNCATE TABLE public.coating_batch_chemicals CASCADE;
TRUNCATE TABLE public.coating_batch_base_rolls CASCADE;
TRUNCATE TABLE public.finished_fabric_rolls CASCADE;
TRUNCATE TABLE public.coating_batches CASCADE;
TRUNCATE TABLE public.base_fabric_issue_lines CASCADE;
TRUNCATE TABLE public.base_fabric_issue_slips CASCADE;
TRUNCATE TABLE public.base_fabric_coating_receipt_lines CASCADE;
TRUNCATE TABLE public.base_fabric_coating_receipts CASCADE;
TRUNCATE TABLE public.yarn_transactions CASCADE;
TRUNCATE TABLE public.base_fabric_rolls CASCADE;
TRUNCATE TABLE public.base_fabric_orders CASCADE;
TRUNCATE TABLE public.dye_issue_lines CASCADE;
TRUNCATE TABLE public.dye_issue_slips CASCADE;
TRUNCATE TABLE public.dye_transactions CASCADE;
TRUNCATE TABLE public.customer_order_lines CASCADE;
TRUNCATE TABLE public.customer_orders CASCADE;

-- 2. Restart all sequences
ALTER SEQUENCE public.base_fabric_coating_receipt_seq RESTART WITH 1;
ALTER SEQUENCE public.base_fabric_issue_slip_seq RESTART WITH 1;
ALTER SEQUENCE public.base_fabric_order_seq RESTART WITH 1;
ALTER SEQUENCE public.base_fabric_roll_seq RESTART WITH 1;
ALTER SEQUENCE public.coating_batch_seq RESTART WITH 1;
ALTER SEQUENCE public.dye_issue_slip_seq RESTART WITH 1;
ALTER SEQUENCE public.finished_fabric_roll_seq RESTART WITH 1;
ALTER SEQUENCE public.finished_fabric_store_issue_no_seq RESTART WITH 1;
ALTER SEQUENCE public.finished_fabric_store_receipt_no_seq RESTART WITH 1;
ALTER SEQUENCE public.yarn_issue_slip_seq RESTART WITH 1;

SELECT 'Database cleared. Master items preserved. Sequences restarted from 1.' AS status;
