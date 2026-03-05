-- One-off fix: Change roll FFR-000380 from A Grade to C Grade (data entry error)
-- Run once in Supabase SQL Editor.

UPDATE public.finished_fabric_rolls
SET grade = 'C'
WHERE roll_no = 'FFR-000380'
  AND (grade IS NULL OR grade = 'A');

-- Optional: show the updated row
-- SELECT id, roll_no, length_m, grade, notes FROM public.finished_fabric_rolls WHERE roll_no = 'FFR-000380';
