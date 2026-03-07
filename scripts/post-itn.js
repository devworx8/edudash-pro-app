// scripts/post-itn.js
// Usage:
//   PAYFAST_MERCHANT_ID=... PAYFAST_MERCHANT_KEY=... PAYFAST_PASSPHRASE=... 
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/post-itn.js --scope=user
//   node scripts/post-itn.js --scope=school --school_id=<UUID>

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://lvvvjywrmpcqrpvuptdi.supabase.co';
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/payfast-webhook`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function parseArgs() {
  return Object.fromEntries(process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }));
}

function encodeRFC1738(v) {
  return encodeURIComponent(v).replace(/%20/g, '+').replace(/%[0-9a-f]{2}/g, m => m.toUpperCase());
}

(async () => {
  const args = parseArgs();
  const scope = (args.scope === 'school' || args.scope === 'user') ? args.scope : 'user';
  const billing = (args.billing === 'annual') ? 'annual' : 'monthly';

  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const merchantId = requireEnv('PAYFAST_MERCHANT_ID');
  const merchantKey = requireEnv('PAYFAST_MERCHANT_KEY');
  const passphrase = requireEnv('PAYFAST_PASSPHRASE');

  const s = createClient(SUPABASE_URL, supabaseServiceRoleKey);

  // Get plan
  const { data: plan } = await s.from('subscription_plans').select('id').eq('tier', 'premium').maybeSingle();
  if (!plan) { console.error('Plan not found'); process.exit(1); }

  // Resolve school id if needed
  let schoolId = null;
  if (scope === 'school') {
    schoolId = args.school_id || process.env.TEST_SCHOOL_ID || null;
    if (!schoolId) {
      const { data: sch } = await s.from('preschools').select('id').limit(1).maybeSingle();
      schoolId = sch?.id || null;
    }
    if (!schoolId) { console.error('No school_id available'); process.exit(1); }
  }

  const txId = `TEST_${Date.now()}`;
  await s.from('payment_transactions').insert({
    id: txId,
    school_id: scope === 'school' ? schoolId : null,
    subscription_plan_id: plan.id,
    amount: 150.00,
    currency: 'ZAR',
    status: 'pending',
    payment_method: 'payfast',
    metadata: { scope, billing, seats: 1 },
  });

  const data = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    m_payment_id: txId,
    pf_payment_id: `PF_${Date.now()}`,
    payment_status: 'COMPLETE',
    amount_gross: '150.00',
    item_name: 'Premium Plan',
    custom_str1: 'premium',
    custom_str2: scope,
    custom_str3: scope === 'school' ? schoolId : 'test-user-id',
    custom_str4: JSON.stringify({ billing, seats: 1 }),
  };

  const orderedQs = Object.keys(data).map(k => `${k}=${encodeRFC1738(String(data[k]))}`).join('&');
  const signature = crypto.createHash('md5').update(`${orderedQs}&passphrase=${encodeRFC1738(passphrase)}`).digest('hex');
  data.signature = signature;

  const body = Object.keys(data).map(k => `${k}=${encodeURIComponent(String(data[k]))}`).join('&');

  const res = await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await res.text();
  console.log(`\nPOST ${WEBHOOK_URL} status=${res.status}`);
  console.log(text);

  process.exit(res.ok ? 0 : 1);
})();
