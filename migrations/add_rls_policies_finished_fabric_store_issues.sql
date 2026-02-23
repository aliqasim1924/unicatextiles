-- RLS policies for finished fabric store issues and issue items
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) for project aliqasim@unica.co.za
-- so that the Cleanup Duplicate Issues button can delete rows (and so the app can insert/update/delete).

-- finished_fabric_store_issues
ALTER TABLE public.finished_fabric_store_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access store issues" ON public.finished_fabric_store_issues;
CREATE POLICY "Allow authenticated full access store issues"
  ON public.finished_fabric_store_issues
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anon as well (browser client may use anon key; auth.getUser() still identifies the user)
DROP POLICY IF EXISTS "Allow anon full access store issues" ON public.finished_fabric_store_issues;
CREATE POLICY "Allow anon full access store issues"
  ON public.finished_fabric_store_issues
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);


-- finished_fabric_store_issue_items
ALTER TABLE public.finished_fabric_store_issue_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access store issue items" ON public.finished_fabric_store_issue_items;
CREATE POLICY "Allow authenticated full access store issue items"
  ON public.finished_fabric_store_issue_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access store issue items" ON public.finished_fabric_store_issue_items;
CREATE POLICY "Allow anon full access store issue items"
  ON public.finished_fabric_store_issue_items
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
