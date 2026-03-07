import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const preschoolId = searchParams.get('preschoolId');

    if (!preschoolId) {
      return NextResponse.json({ error: 'Missing preschoolId' }, { status: 400 });
    }

    // Get session from cookies
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Handle errors from set operations
          }
        },
      },
      auth: {
        storageKey: 'edudash-auth-session', // Match client storage key
        flowType: 'pkce',
      },
    });

    // Verify user is authenticated and is a principal
    const allCookies = cookieStore.getAll();
    console.log('[Teachers API] Cookies received:', allCookies.map(c => c.name));
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('[Teachers API] Session error:', sessionError);
      return NextResponse.json({ 
        error: 'Authentication error', 
        details: sessionError.message 
      }, { status: 401 });
    }

    if (!session) {
      console.error('[Teachers API] No session found');
      console.error('[Teachers API] Available cookies:', allCookies.map(c => c.name).join(', '));
      return NextResponse.json({ 
        error: 'Unauthorized', 
        details: 'No session found in cookies',
        cookies: allCookies.map(c => c.name)
      }, { status: 401 });
    }
    
    console.log('[Teachers API] Session found for user:', session.user.id);

    // Fetch teachers from profiles table (profiles-first architecture)
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, preschool_id, role')
      .eq('preschool_id', preschoolId)
      .eq('role', 'teacher');

    if (profilesError) {
      console.error('[Teachers API] Error fetching profiles:', profilesError);
      return NextResponse.json({ error: profilesError.message }, { status: 400 });
    }

    if (!profilesData || profilesData.length === 0) {
      return NextResponse.json({ teachers: [] });
    }

    // Map profile data to teachers list
    const teachersList = profilesData.map((p: any) => ({
      id: p.id,
      first_name: p.first_name || 'Unknown',
      last_name: p.last_name || '',
      email: p.email || '',
      phone_number: '', // Not stored in profiles
      status: 'active',
    }));

    const teacherIds = teachersList.map((t: any) => t.id);

    // Fetch class counts
    const { data: classData } = await supabase
      .from('classes')
      .select('teacher_id')
      .eq('preschool_id', preschoolId)
      .in('teacher_id', teacherIds);

    const classCountMap = new Map<string, number>();
    classData?.forEach(c => {
      classCountMap.set(c.teacher_id, (classCountMap.get(c.teacher_id) || 0) + 1);
    });

    // Fetch student counts
    const { data: studentData } = await supabase
      .from('students')
      .select('id, class_id')
      .eq('preschool_id', preschoolId);

    // Get class to teacher mapping
    const { data: classTeacherMap } = await supabase
      .from('classes')
      .select('id, teacher_id')
      .eq('preschool_id', preschoolId)
      .in('teacher_id', teacherIds);

    const classToTeacher = new Map<string, string>();
    classTeacherMap?.forEach(c => {
      classToTeacher.set(c.id, c.teacher_id);
    });

    // Count students per teacher
    const studentCountMap = new Map<string, number>();
    studentData?.forEach(s => {
      const teacherId = classToTeacher.get(s.class_id);
      if (teacherId) {
        studentCountMap.set(teacherId, (studentCountMap.get(teacherId) || 0) + 1);
      }
    });

    // Combine data
    const teachersWithCounts = teachersList.map((t: any) => ({
      ...t,
      class_count: classCountMap.get(t.id) || 0,
      student_count: studentCountMap.get(t.id) || 0,
    }));

    return NextResponse.json({ teachers: teachersWithCounts });
  } catch (error: any) {
    console.error('Error in teachers API:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      details: error.toString()
    }, { status: 500 });
  }
}
