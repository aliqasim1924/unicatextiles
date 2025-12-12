-- ============================================================================
-- COMPLETE DATABASE CLEAR SCRIPT
-- Clears all transactional data while preserving master items
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Clear all transactional tables (handles missing tables gracefully)
-- ============================================================================

-- Helper function to truncate if table exists
DO $$
DECLARE
  tables_to_clear TEXT[] := ARRAY[
    -- Finished Fabric Store
    'finished_fabric_store_issue_items',
    'finished_fabric_store_issues',
    'finished_fabric_store_receipt_items',
    'finished_fabric_store_receipts',
    'finished_fabric_rolls',
    -- Coating Batches
    'coating_batch_chemicals',
    'coating_batch_base_rolls',
    'coating_batches',
    -- Base Fabric Issues
    'base_fabric_issue_lines',
    'base_fabric_issue_slips',
    -- Base Fabric Coating Receipts
    'base_fabric_coating_receipt_lines',
    'base_fabric_coating_receipts',
    -- Base Fabric
    'base_fabric_rolls',
    'base_fabric_orders',
    -- Yarn Transactions (Toolbox)
    'yarn_receipt_lines',
    'yarn_receipt_slips',
    'yarn_issue_lines',
    'yarn_issue_slips',
    'yarn_transactions',
    -- Dyes & Chemicals Transactions (Toolbox)
    'dyes_chem_receipt_lines',
    'dyes_chem_receipt_slips',
    'dyes_chem_issue_lines',
    'dyes_chem_issue_slips',
    'dyes_chem_transactions',
    -- Production System
    'fabric_rolls',
    'wastage_records',
    'production_completion_details',
    'loom_rolls',
    'loom_production_details',
    'coating_roll_inputs',
    'production_batches',
    'production_orders',
    -- Customer Orders
    'shipment_items',
    'shipments',
    'customer_order_item_audit',
    'customer_order_items',
    'customer_order_audit',
    'customer_orders',
    -- Stock and Movements
    'stock_movements',
    'barcode_scans',
    -- Audit Logs
    'production_order_audit',
    'audit_log'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_to_clear
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 2: Reset stock quantities to 0 (keep master items, clear quantities)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='yarn_stock') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='yarn_stock' AND column_name='stock_quantity_kg') THEN
      UPDATE public.yarn_stock SET stock_quantity_kg = 0 WHERE stock_quantity_kg > 0;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='chemical_stock') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chemical_stock' AND column_name='stock_quantity_liters') THEN
      UPDATE public.chemical_stock SET stock_quantity_liters = 0 WHERE stock_quantity_liters > 0;
    END IF;
  END IF;
END $$;

-- Note: total_value is a generated column and will auto-update to 0 when quantities are reset

-- ============================================================================
-- STEP 3: Reset sequences (restart slip numbers from 1)
-- ============================================================================

DO $$
DECLARE
  seqs TEXT[] := ARRAY[
    'yarn_receipt_slip_seq',
    'yarn_issue_slip_seq',
    'dyes_chem_receipt_slip_seq',
    'dyes_chem_issue_slip_seq',
    'base_fabric_issue_slip_seq',
    'base_fabric_coating_receipt_seq',
    'finished_fabric_store_receipt_no_seq',
    'finished_fabric_store_issue_no_seq',
    'finished_fabric_roll_no_seq'
  ];
  seq TEXT;
BEGIN
  FOREACH seq IN ARRAY seqs
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_schema='public' AND sequence_name=seq) THEN
      EXECUTE format('ALTER SEQUENCE public.%I RESTART WITH 1', seq);
      RAISE NOTICE 'Reset sequence: %', seq;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION: Check that everything is cleared
-- ============================================================================

-- Verification using dynamic SQL to handle missing tables
DO $$
DECLARE
  tables_to_check TEXT[] := ARRAY[
    'fabric_rolls',
    'finished_fabric_rolls',
    'production_orders',
    'production_batches',
    'customer_orders',
    'loom_rolls',
    'stock_movements'
  ];
  tbl TEXT;
  rec_count INTEGER;
BEGIN
  FOREACH tbl IN ARRAY tables_to_check
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', tbl) INTO rec_count;
      RAISE NOTICE '%: % records', tbl, rec_count;
    END IF;
  END LOOP;
  
  -- Check stock quantities
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='yarn_stock') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='yarn_stock' AND column_name='stock_quantity_kg') THEN
    SELECT COUNT(*) INTO rec_count FROM public.yarn_stock WHERE stock_quantity_kg > 0;
    RAISE NOTICE 'yarn_stock items with quantity > 0: %', rec_count;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='chemical_stock') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chemical_stock' AND column_name='stock_quantity_liters') THEN
    SELECT COUNT(*) INTO rec_count FROM public.chemical_stock WHERE stock_quantity_liters > 0;
    RAISE NOTICE 'chemical_stock items with quantity > 0: %', rec_count;
  END IF;
  
  RAISE NOTICE '✅ Database cleared successfully! Master items preserved.';
END $$;

SELECT '✅ Database cleared successfully! Master items preserved.' as status;
