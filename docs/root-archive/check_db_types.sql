-- Check what organization types actually exist in the database
SELECT 
    t.typname as enum_name,
    e.enumlabel as enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname = 'organization_type'
ORDER BY e.enumsortorder;

-- Check what types are in the organizations table
SELECT DISTINCT type, COUNT(*) 
FROM organizations 
GROUP BY type;

-- Check what the create_organization function accepts
SELECT prosrc 
FROM pg_proc 
WHERE proname = 'create_organization';
