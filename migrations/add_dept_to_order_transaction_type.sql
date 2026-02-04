-- Add DEPT_TO_ORDER to yarn_transactions.transaction_type enum
-- Used when allocating department-held yarn to a base fabric order (no store issue).

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'DEPT_TO_ORDER';
