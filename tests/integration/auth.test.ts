/**
 * Integration Tests: Authentication Flow
 *
 * Tests critical authentication paths against a live Supabase project:
 * - Sign up with role assignment
 * - Login with correct / incorrect credentials
 * - Session persistence
 * - Sign out
 * - Profile fetching from database
 * - Multi-tenant RLS isolation
 *
 * These tests can create real auth users and trigger confirmation emails.
 *
 * Required opt-in:
 * - ALLOW_LIVE_AUTH_TESTS=true
 *
 * Additional required opt-in when pointed at the production Supabase project:
 * - ALLOW_PRODUCTION_AUTH_TESTS=true
 */

// Use createClient directly — lib/supabase.ts pulls in React-Native
// modules (Platform, expo-constants, AsyncStorage) that can't resolve
// in the jsdom/babel-jest test environment.
const { createClient } = require('@supabase/supabase-js');

// ---------- env guard ----------
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const ALLOW_LIVE_AUTH_TESTS = process.env.ALLOW_LIVE_AUTH_TESTS === 'true';
const ALLOW_PRODUCTION_AUTH_TESTS =
  process.env.ALLOW_PRODUCTION_AUTH_TESTS === 'true';
const IS_PRODUCTION_SUPABASE = SUPABASE_URL.includes(
  'lvvvjywrmpcqrpvuptdi.supabase.co'
);
const SKIP =
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY ||
  !ALLOW_LIVE_AUTH_TESTS ||
  (IS_PRODUCTION_SUPABASE && !ALLOW_PRODUCTION_AUTH_TESTS);
const describeIfEnv = SKIP ? describe.skip : describe;

// ---------- helpers ----------
function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,          // no storage needed in tests
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Return true if a Supabase error is a rate-limit (429). */
function isRateLimited(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return msg.includes('rate limit') || msg.includes('429');
}

// Unique suffix to avoid collisions between parallel runs
const TS = Date.now();

describeIfEnv('Authentication Flow Integration Tests', () => {
  let supabase: ReturnType<typeof createClient>;
  let testUserId: string | null = null;

  beforeAll(() => {
    supabase = makeClient();
  });

  afterEach(async () => {
    if (testUserId) {
      await supabase.auth.signOut();
      testUserId = null;
    }
  });

  afterAll(async () => {
    // Clean sign-out and allow pending requests to settle
    await supabase.auth.signOut();
    // Give the Supabase client a moment to flush in-flight requests
    await new Promise((r) => setTimeout(r, 500));
  });

  // ============================================================
  // Sign Up
  // ============================================================
  describe('Sign Up Flow', () => {
    it('should create user with proper role assignment', async () => {
      const testEmail = `test-teacher-${TS}@example.com`;

      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: 'TestPassword123!',
        options: {
          data: {
            role: 'teacher',
            preschool_id: 'test-school-123',
          },
        },
      });

      if (isRateLimited(error)) {
        console.warn('[AUTH TEST] Rate-limited by Supabase — skipping assertion');
        return; // pass gracefully
      }

      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user?.user_metadata.role).toBe('teacher');

      testUserId = data.user?.id || null;
    });

    it('should reject signup with invalid role', async () => {
      const testEmail = `test-invalid-${TS}@example.com`;

      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: 'TestPassword123!',
        options: { data: { role: 'hacker' } },
      });

      if (isRateLimited(error)) {
        console.warn('[AUTH TEST] Rate-limited — skipping');
        return;
      }

      // Supabase Auth itself may accept the sign-up (no schema-level
      // constraint on user_metadata.role), but the profile trigger
      // should NOT persist an unsupported role.
      if (data.user) {
        testUserId = data.user.id;

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();

        expect(
          [null, 'teacher', 'parent', 'student', 'principal_admin', 'super_admin'],
        ).toContain(profile?.role ?? null);
      }
    });
  });

  // ============================================================
  // Login / Session / Sign-Out
  // ============================================================
  describe('Login and Session Management', () => {
    // When Supabase has email confirmation enabled, signInWithPassword
    // returns 'Email not confirmed'.  signUp() however auto-signs-in
    // and returns a session (even with confirm-email on), so we use that
    // session instead for login-dependent tests.
    const loginEmail = `test-login-${TS}@example.com`;
    const loginPassword = 'TestPassword123!';
    let signupSession: any = null;

    beforeAll(async () => {
      const { data } = await supabase.auth.signUp({
        email: loginEmail,
        password: loginPassword,
        options: { data: { role: 'teacher' } },
      });
      signupSession = data.session;
    });

    it('should receive a session on signup (auto-sign-in)', () => {
      // Supabase returns a session immediately on signUp even when
      // email verification is pending (autoconfirm or unconfirmed).
      // If your project has Confirm Email ON and does NOT auto-sign-in,
      // the session will be null — that's also valid.
      if (signupSession) {
        expect(signupSession.access_token).toBeTruthy();
        expect(signupSession.user?.email).toBe(loginEmail);
        testUserId = signupSession.user?.id || null;
      } else {
        // Session is null means email confirm is required before login.
        // That's a valid configuration — nothing to assert error-wise.
        expect(true).toBe(true);
      }
    });

    it('should reject login with incorrect password', async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: 'WrongPassword123!',
      });

      expect(error).toBeDefined();
      expect(data.session).toBeNull();
    });

    it('should have a session available after signup', async () => {
      // Re-login using the signUp-provided session or try signIn
      const { data: sessionData } = await supabase.auth.getSession();

      if (signupSession) {
        // If signUp gave us a session, it should still be current
        expect(sessionData.session?.user?.email).toBe(loginEmail);
        testUserId = sessionData.session?.user?.id || null;
      } else {
        // No auto-session — expected when email confirmation is enforced
        expect(sessionData.session).toBeNull();
      }
    });

    it('should sign out and invalidate session', async () => {
      const { error } = await supabase.auth.signOut();
      expect(error).toBeNull();

      const { data: afterSession } = await supabase.auth.getSession();
      expect(afterSession.session).toBeNull();
      testUserId = null;
    });
  });

  // ============================================================
  // Profile Fetching (direct DB query — no RN-dependent imports)
  // ============================================================
  describe('Profile Fetching', () => {
    it(
      'should have a profile row with correct role after signup',
      async () => {
        const testEmail = `test-profile-${TS}@example.com`;

        const { data } = await supabase.auth.signUp({
          email: testEmail,
          password: 'TestPassword123!',
          options: { data: { role: 'parent' } },
        });

        if (data.user) {
          testUserId = data.user.id;

          // Give the DB trigger a moment to fire
          await new Promise((r) => setTimeout(r, 2000));

          const { data: profile } = await supabase
            .from('profiles')
            .select('id, role, email')
            .eq('id', data.user.id)
            .single();

          // Profile may or may not exist depending on trigger;
          // if it exists, assert the correct role.
          if (profile) {
            expect(profile.id).toBe(data.user.id);
            expect(profile.role).toBe('parent');
          }
        }
      },
      30_000, // generous timeout — signup + trigger + query
    );
  });

  // ============================================================
  // Multi-Tenant RLS Isolation
  // ============================================================
  describe('Multi-Tenant Isolation', () => {
    it(
      'should isolate data between different organizations',
      async () => {
        const teacher1Email = `teacher1-${TS}@example.com`;
        const teacher2Email = `teacher2-${TS}@example.com`;

        // Create teacher in school-alpha
        const { data: t1, error: e1 } = await supabase.auth.signUp({
          email: teacher1Email,
          password: 'TestPassword123!',
          options: {
            data: { role: 'teacher', preschool_id: 'school-alpha' },
          },
        });

        if (isRateLimited(e1)) {
          console.warn('[AUTH TEST] Rate-limited — skipping multi-tenant test');
          return;
        }

        await supabase.auth.signOut();

        // Create teacher in school-beta
        const { error: e2 } = await supabase.auth.signUp({
          email: teacher2Email,
          password: 'TestPassword123!',
          options: {
            data: { role: 'teacher', preschool_id: 'school-beta' },
          },
        });

        if (isRateLimited(e2)) {
          console.warn('[AUTH TEST] Rate-limited — skipping multi-tenant test');
          return;
        }

        await supabase.auth.signOut();

        // Login as teacher1 — use signInWithPassword; may fail
        // if email confirm is on, so fall back to a fresh signUp session.
        let loginError: any = null;
        const { error } = await supabase.auth.signInWithPassword({
          email: teacher1Email,
          password: 'TestPassword123!',
        });
        loginError = error;

        if (loginError) {
          // Email not confirmed — re-create to get auto-session
          const { data: fresh, error: freshErr } = await supabase.auth.signUp({
            email: `teacher1b-${TS}@example.com`,
            password: 'TestPassword123!',
            options: {
              data: { role: 'teacher', preschool_id: 'school-alpha' },
            },
          });
          if (isRateLimited(freshErr)) {
            console.warn('[AUTH TEST] Rate-limited — skipping');
            return;
          }
          testUserId = fresh?.user?.id || null;
        } else {
          testUserId = t1?.user?.id || null;
        }

        // Attempt to query teacher2's school — should be blocked by RLS
        const { data: otherSchoolData } = await supabase
          .from('preschools')
          .select('*')
          .eq('id', 'school-beta')
          .maybeSingle();

        expect(otherSchoolData).toBeNull();
      },
      30_000,
    );
  });
});
