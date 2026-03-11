#!/usr/bin/env tsx
/**
 * Test Teacher Invite Flow
 * 
 * Tests the complete teacher invitation and acceptance process:
 * 1. Create invite as principal
 * 2. Simulate teacher acceptance
 * 3. Verify organization_members entry
 * 4. Verify AI capability access
 * 
 * Usage: npx tsx scripts/test-teacher-invite-flow.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey =
  process.env.SERVER_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';
const allowLiveAuthTests = process.env.ALLOW_LIVE_AUTH_TESTS === 'true';
const allowProductionAuthTests =
  process.env.ALLOW_PRODUCTION_AUTH_TESTS === 'true';
const isProductionSupabase = supabaseUrl.includes(
  'lvvvjywrmpcqrpvuptdi.supabase.co'
);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

if (!allowLiveAuthTests) {
  console.error(
    '❌ Refusing to run live teacher invite flow without ALLOW_LIVE_AUTH_TESTS=true'
  );
  process.exit(1);
}

if (isProductionSupabase && !allowProductionAuthTests) {
  console.error(
    '❌ Refusing to run against production Supabase without ALLOW_PRODUCTION_AUTH_TESTS=true'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

interface TestResult {
  step: string;
  status: 'pass' | 'fail';
  details?: any;
  error?: string;
}

const results: TestResult[] = [];

function logResult(step: string, status: 'pass' | 'fail', details?: any, error?: string) {
  results.push({ step, status, details, error });
  const icon = status === 'pass' ? '✅' : '❌';
  console.log(`${icon} ${step}`);
  if (details) console.log('   Details:', JSON.stringify(details, null, 2));
  if (error) console.error('   Error:', error);
}

async function testInviteFlow() {
  console.log('🧪 Testing Teacher Invite Flow\n');

  // Step 1: Find test organization (Young Eagles)
  console.log('📋 Step 1: Finding test organization...');
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, subscription_plan')
    .eq('name', 'Young Eagles')
    .maybeSingle();

  if (orgError || !org) {
    logResult('Find test organization', 'fail', null, orgError?.message || 'Organization not found');
    return;
  }
  logResult('Find test organization', 'pass', { org_id: org.id, plan: org.subscription_plan });

  // Step 2: Find principal user for this org
  console.log('\n📋 Step 2: Finding principal user...');
  const { data: principal, error: principalError } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('organization_id', org.id)
    .eq('role', 'principal')
    .maybeSingle();

  if (principalError || !principal) {
    logResult('Find principal', 'fail', null, principalError?.message || 'Principal not found');
    return;
  }
  logResult('Find principal', 'pass', { principal_id: principal.id, email: principal.email });

  // Step 3: Create test invite
  console.log('\n📋 Step 3: Creating test invite...');
  const testEmail = `test-teacher-${Date.now()}@example.com`;
  const token = generateToken(48);
  
  const { data: invite, error: inviteError } = await supabase
    .from('teacher_invites')
    .insert({
      school_id: org.id,
      email: testEmail,
      invited_by: principal.id,
      token,
      status: 'pending'
    })
    .select('*')
    .single();

  if (inviteError || !invite) {
    logResult('Create invite', 'fail', null, inviteError?.message);
    return;
  }
  logResult('Create invite', 'pass', { invite_id: invite.id, email: testEmail, token });

  // Step 4: Simulate teacher registration/signup
  console.log('\n📋 Step 4: Simulating teacher signup...');
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: testEmail,
    password: 'TestPassword123!',
  });

  if (authError || !authData.user) {
    logResult('Teacher signup', 'fail', null, authError?.message);
    return;
  }
  logResult('Teacher signup', 'pass', { user_id: authData.user.id });

  // Step 5: Accept invite (simulate TeacherInviteService.accept logic)
  console.log('\n📋 Step 5: Accepting invite...');
  
  // 5a. Verify invite
  const { data: verifiedInvite, error: verifyError } = await supabase
    .from('teacher_invites')
    .select('*')
    .eq('token', token)
    .eq('email', testEmail)
    .eq('status', 'pending')
    .maybeSingle();

  if (verifyError || !verifiedInvite) {
    logResult('Verify invite', 'fail', null, verifyError?.message || 'Invite not found');
    return;
  }

  // 5b. Mark invite as accepted
  const { error: updateError } = await supabase
    .from('teacher_invites')
    .update({
      status: 'accepted',
      accepted_by: authData.user.id,
      accepted_at: new Date().toISOString()
    })
    .eq('id', invite.id);

  if (updateError) {
    logResult('Mark invite accepted', 'fail', null, updateError.message);
    return;
  }
  logResult('Mark invite accepted', 'pass');

  // 5c. Create profile
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: authData.user.id,
      role: 'teacher',
      organization_id: org.id,
      email: testEmail
    });

  if (profileError) {
    logResult('Create teacher profile', 'fail', null, profileError.message);
  } else {
    logResult('Create teacher profile', 'pass');
  }

  // 5d. Create organization membership
  const { error: memberError } = await supabase
    .from('organization_members')
    .upsert({
      organization_id: org.id,
      user_id: authData.user.id,
      role: 'teacher',
      seat_status: 'active',
      invited_by: principal.id,
    }, { onConflict: 'organization_id,user_id' });

  if (memberError) {
    logResult('Create organization membership', 'fail', null, memberError.message);
    return;
  }
  logResult('Create organization membership', 'pass');

  // Step 6: Verify membership was created
  console.log('\n📋 Step 6: Verifying membership...');
  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', org.id)
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    logResult('Verify membership', 'fail', null, membershipError?.message || 'Membership not found');
    return;
  }
  logResult('Verify membership', 'pass', {
    role: membership.role,
    seat_status: membership.seat_status
  });

  // Step 7: Test AI capability access (using rbac logic)
  console.log('\n📋 Step 7: Testing AI capability access...');
  
  // Check if org has paid plan
  const hasPaidPlan = ['premium', 'pro', 'enterprise'].includes(org.subscription_plan || '');
  const hasActiveSeat = membership.seat_status === 'active';
  const hasAICapability = hasPaidPlan && hasActiveSeat;

  logResult('Check AI capability', hasAICapability ? 'pass' : 'fail', {
    org_plan: org.subscription_plan,
    has_paid_plan: hasPaidPlan,
    seat_status: membership.seat_status,
    has_active_seat: hasActiveSeat,
    ai_capability_granted: hasAICapability
  });

  // Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await supabase.from('organization_members').delete().eq('user_id', authData.user.id);
  await supabase.from('profiles').delete().eq('id', authData.user.id);
  await supabase.from('teacher_invites').delete().eq('id', invite.id);
  if (supabaseAdmin) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  } else {
    console.warn(
      '⚠️ Skipping auth user cleanup because no service-role key was provided'
    );
  }
  console.log('✅ Cleanup complete');

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${results.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Invite flow is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Review errors above.');
  }
}

function generateToken(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

testInviteFlow().catch(console.error);
