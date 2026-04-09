-- Allow authenticated users to unselect/remove base roll links from coating batches.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coating_batch_base_rolls'
      AND policyname = 'coating_batch_base_rolls_delete_authenticated'
  ) THEN
    CREATE POLICY coating_batch_base_rolls_delete_authenticated
      ON public.coating_batch_base_rolls
      FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;
