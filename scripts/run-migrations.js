#!/usr/bin/env node
/**
 * Migration runner script
 * Runs the organization_id and tier standardization migrations
 */

const fs = require('fs');
const path = require('path');

const { createClient } = require('@supabase/supabase-js');

// Supabase connection details
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lvvvjywrmpcqrpvuptdi.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('Please set it in your .env file or export it:');
  console.log('export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration(migrationFile) {
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationFile}`);
    return false;
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log(`\n📝 Running migration: ${migrationFile}`);
  console.log(`   Size: ${(sql.length / 1024).toFixed(2)} KB`);
  
  try {
    // Execute the migration using Supabase's SQL execution
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(() => {
      // If exec_sql doesn't exist, try direct query
      return supabase.from('_migrations').select('*').limit(0); // This will fail but that's ok
    });
    
    // Since we can't directly execute raw SQL with service role,
    // we'll use the postgres REST API approach
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql_query: sql })
    });

    if (!response.ok) {
      // RPC might not exist, provide manual instructions
      console.log(`\n⚠️  Cannot execute migration automatically.`);
      console.log(`\n📋 Please run this migration manually in Supabase SQL Editor:`);
      console.log(`\n--- Copy the SQL below ---\n`);
      console.log(sql);
      console.log(`\n--- End of SQL ---\n`);
      return false;
    }

    const result = await response.json();
    console.log(`✅ Migration completed: ${migrationFile}`);
    return true;
  } catch (error) {
    console.error(`❌ Migration failed: ${migrationFile}`);
    console.error(`   Error: ${error.message}`);
    console.log(`\n📋 Please run this migration manually in Supabase SQL Editor:`);
    console.log(`\nFile: supabase/migrations/${migrationFile}\n`);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting migration process...\n');
  
  const migrations = [
    '20251211090511_standardize_organization_id.sql',
    '20251211090512_standardize_tier_fields.sql',
  ];

  let allSuccess = true;

  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (!success) {
      allSuccess = false;
    }
  }

  if (allSuccess) {
    console.log('\n✅ All migrations completed successfully!');
  } else {
    console.log('\n⚠️  Some migrations need to be run manually.');
    console.log('\nTo run them manually:');
    console.log('1. Go to Supabase Dashboard > SQL Editor');
    console.log('2. Copy the SQL from each migration file');
    console.log('3. Paste and run in the SQL Editor');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


