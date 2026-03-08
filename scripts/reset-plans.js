require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const s = createClient(url, key);

  // Tier names MUST match the canonical TierNameAligned type in lib/tiers/index.ts
  const plans = [
    { name: 'Free',              tier: 'free',              price_monthly: 0,    price_annual: 0,     max_teachers: 2,   max_students: 50,   is_active: true },
    { name: 'Parent Starter',    tier: 'parent_starter',    price_monthly: 99,   price_annual: 950,   max_teachers: 0,   max_students: 0,    is_active: true },
    { name: 'Parent Plus',       tier: 'parent_plus',       price_monthly: 199,  price_annual: 1910,  max_teachers: 0,   max_students: 0,    is_active: true },
    { name: 'Learner Starter',   tier: 'learner_starter',   price_monthly: 99,   price_annual: 950,   max_teachers: 0,   max_students: 0,    is_active: true },
    { name: 'Learner Pro',       tier: 'learner_pro',       price_monthly: 199,  price_annual: 1910,  max_teachers: 0,   max_students: 0,    is_active: true },
    { name: 'School Starter',    tier: 'school_starter',    price_monthly: 399,  price_annual: 3990,  max_teachers: 5,   max_students: 150,  is_active: true },
    { name: 'School Premium',    tier: 'school_premium',    price_monthly: 599,  price_annual: 5990,  max_teachers: 15,  max_students: 500,  is_active: true },
    { name: 'School Pro',        tier: 'school_pro',        price_monthly: 999,  price_annual: 9990,  max_teachers: 30,  max_students: 1000, is_active: true },
    { name: 'School Enterprise', tier: 'school_enterprise', price_monthly: 1999, price_annual: 19990, max_teachers: 100, max_students: 2000, is_active: true },
  ];

  try {
    console.log('Archiving existing subscription_plans (is_active=false)...');
    const { error: updErr } = await s.from('subscription_plans').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000');
    if (updErr) throw updErr;

    console.log('Inserting new plans...');
    const { data, error } = await s.from('subscription_plans').insert(plans).select('id, name, tier, price_monthly, max_teachers');
    if (error) throw error;

    console.log('Seeded plans:');
    (data || []).forEach((p, i) => console.log(`${i + 1}. ${p.name} (${p.tier}) R${p.price_monthly}/mo, seats ${p.max_teachers}`));

    // Verify via RPC
    const { data: rpcPlans, error: rpcErr } = await s.rpc('public_list_plans');
    if (rpcErr) throw rpcErr;
    console.log(`RPC visible plans: ${rpcPlans?.length}`);
  } catch (e) {
    console.error('Seeding failed:', e.message || e);
    process.exit(1);
  }
})();
