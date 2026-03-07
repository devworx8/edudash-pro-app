// Business logic for learner-registration screen
// Extracted to keep screen under 500 non-SS lines

import { logger } from '@/lib/logger';
import { assertSupabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { buildEduDashWebUrl } from '@/lib/config/urls';

const TAG = 'LearnerReg';

type ShowAlertFn = (config: {
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  buttons?: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }>;
}) => void;

/**
 * Verify a program code against the database.
 * Returns the program info or null if invalid.
 */
export async function verifyProgramCode(
  programCode: string,
  showAlert: ShowAlertFn
): Promise<any | null> {
  if (!programCode.trim()) {
    showAlert({ title: 'Error', message: 'Please enter a program code', type: 'warning' });
    return null;
  }

  const supabase = assertSupabase();
  let program: any | null = null;

  // Preferred: public RPC (works even when unauthenticated)
  try {
    const { data, error } = await supabase.rpc('validate_program_code', { p_code: programCode.trim() });
    if (!error && data && typeof data === 'object' && (data as any).valid) {
      const course = (data as any).course;
      const org = (data as any).organization;
      program = {
        id: String(course?.id ?? ''),
        title: String(course?.title ?? ''),
        description: course?.description ?? null,
        course_code: String(course?.course_code ?? ''),
        organizations: org?.id ? { id: String(org.id), name: String(org.name ?? ''), slug: org.slug ?? null } : null,
      };
    }
  } catch {
    // ignore – fall back to direct query
  }

  // Fallback: direct query (authenticated users with RLS access)
  if (!program?.id) {
    const { data, error } = await supabase
      .from('courses')
      .select('id, title, description, course_code, organizations ( id, name, slug )')
      .or(`course_code.eq.${programCode.trim()},id.eq.${programCode.trim()}`)
      .eq('is_active', true)
      .maybeSingle();
    if (!error && data) program = data;
  }

  if (!program?.id) {
    showAlert({ title: 'Invalid Code', message: 'The program code you entered is invalid or the program is no longer active.', type: 'error' });
    return null;
  }

  return program;
}

/**
 * Register a new learner account and optionally enroll in a program.
 */
export async function registerLearner(
  opts: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    password: string;
    confirmPassword: string;
    programInfo: any | null;
    withProgram: boolean;
  },
  showAlert: ShowAlertFn
): Promise<boolean> {
  const { email, firstName, lastName, phone, password, confirmPassword, programInfo, withProgram } = opts;

  // Validation
  if (!email || !firstName || !lastName || !password) {
    showAlert({ title: 'Error', message: 'Please fill in all required fields', type: 'warning' });
    return false;
  }
  if (password !== confirmPassword) {
    showAlert({ title: 'Error', message: 'Passwords do not match', type: 'warning' });
    return false;
  }
  if (password.length < 8) {
    showAlert({ title: 'Error', message: 'Password must be at least 8 characters', type: 'warning' });
    return false;
  }
  if (withProgram && !programInfo) {
    showAlert({ title: 'Error', message: 'Please enter a valid program code first', type: 'warning' });
    return false;
  }

  const supabase = assertSupabase();

  // Double-check if email exists using RPC
  const { data: emailExists } = await supabase.rpc('check_email_exists', {
    p_email: email.trim().toLowerCase(),
  });

  if (emailExists) {
    showAlert({
      title: 'Email Already Registered',
      message: 'This email is already registered. Would you like to sign in instead?',
      type: 'warning',
      buttons: [
        { text: 'Use Different Email', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.replace('/(auth)/sign-in') },
      ],
    });
    return false;
  }

  // Sign up user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        role: 'student',
        organization_id: withProgram ? programInfo?.organizations?.id : null,
      },
      emailRedirectTo: buildEduDashWebUrl('/landing?flow=email-confirm'),
    },
  });

  if (authError) {
    if (authError.message?.includes('already registered') ||
        authError.message?.includes('email already') ||
        authError.message?.includes('User already registered')) {
      showAlert({
        title: 'Email Already Registered',
        message: 'This email is already registered. Would you like to sign in instead?',
        type: 'warning',
        buttons: [
          { text: 'Use Different Email', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.replace('/(auth)/sign-in') },
        ],
      });
      return false;
    }
    throw authError;
  }

  // Email confirmation required
  if (!authData.session) {
    router.replace({
      pathname: '/screens/verify-your-email',
      params: { email: email.trim() },
    } as any);
    return true;
  }

  // Auto-enroll in program if applicable
  if (authData.user && withProgram && programInfo) {
    const { error: enrollError } = await supabase
      .from('enrollments')
      .insert({
        student_id: authData.user.id,
        course_id: programInfo.id,
        enrollment_method: 'join_code',
        is_active: true,
        enrolled_at: new Date().toISOString(),
      });

    if (enrollError) {
      logger.error(TAG, 'Enrollment error:', enrollError);
    }
  }

  showAlert({
    title: 'Registration Successful!',
    message: 'Your account has been created successfully. You can now sign in.',
    type: 'success',
    buttons: [{ text: 'Go to Sign In', onPress: () => router.replace('/(auth)/sign-in') }],
  });
  return true;
}
