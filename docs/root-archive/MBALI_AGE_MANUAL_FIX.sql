-- MANUAL FIX REQUIRED: Mbali's Age Update
-- The students table has complex triggers that prevent direct UPDATE
-- Please run this SQL directly in Supabase Dashboard SQL Editor as a superuser

-- Option 1: Try with different transaction isolation
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;

SET CONSTRAINTS ALL DEFERRED;

UPDATE students
SET date_of_birth = '2021-01-15',
    grade = 'Grade R',  -- Also fix the grade
    updated_at = NOW()
WHERE id = '074692f3-f5a3-4fea-977a-b726828e5067';

COMMIT;

-- Option 2: If above fails, contact the user to manually update via Supabase Dashboard
-- Navigate to: Supabase Dashboard > Table Editor > students table
-- Find: Mbali Skosana (ID: 074692f3-f5a3-4fea-977a-b726828e5067)
-- Edit: date_of_birth to '2021-01-15' and grade to 'Grade R'
