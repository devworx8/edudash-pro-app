import { createClient } from '@supabase/supabase-js';

const edudashUrl = 'https://lvvvjywrmpcqrpvuptdi.supabase.co';
const edudashServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

const client = createClient(edudashUrl, edudashServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function triggerPasswordReset(email) {
  console.log(`Triggering password reset for: ${email}`);
  
  const { data, error } = await client.auth.admin.generateLink({
    type: 'recovery',
    email: email,
    options: {
      redirectTo: 'https://www.edudashpro.org.za/landing?flow=recovery',
    },
  });

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log('✅ Password reset email sent!');
  console.log('📧 Email:', email);
  console.log('🔗 Reset link:', data.properties?.action_link);
  console.log('\nCheck the inbox for the password reset email.');
}

// Run it
triggerPasswordReset('dipsroboticsgm@gmail.com');
