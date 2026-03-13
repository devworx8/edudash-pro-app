-- MANUAL FIX: Update Mbalenhle Makhubela DOB to 2024 and ensure registration fee is R200.00
-- Run this in Supabase SQL editor as a superuser if not already fixed by app logic

BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET CONSTRAINTS ALL DEFERRED;

UPDATE students
SET date_of_birth = '2024-01-15',
    updated_at = NOW()
WHERE (first_name ILIKE 'Mbalenhle' AND last_name ILIKE 'Makhubela')
   OR id = (
     SELECT id FROM students WHERE first_name ILIKE 'Mbalenhle' AND last_name ILIKE 'Makhubela' LIMIT 1
   );

-- Optionally, ensure registration fee is set to R200.00 for this student
UPDATE students
SET registration_fee_amount = 200.00
WHERE (first_name ILIKE 'Mbalenhle' AND last_name ILIKE 'Makhubela')
   OR id = (
     SELECT id FROM students WHERE first_name ILIKE 'Mbalenhle' AND last_name ILIKE 'Makhubela' LIMIT 1
   );

COMMIT;