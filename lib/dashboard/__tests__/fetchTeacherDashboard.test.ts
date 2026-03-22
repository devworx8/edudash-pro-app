import { fetchTeacherDashboardData } from '../fetchTeacherDashboard';
import { assertSupabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  assertSupabase: jest.fn(),
}));

jest.mock('@/lib/debug', () => ({
  log: jest.fn(),
  logError: jest.fn(),
}));

type QueryResponse = {
  data: any;
  error: any;
};

function buildSupabaseMock(
  responses: Record<string, QueryResponse[]>,
  options?: {
    getUser?: () => Promise<any>;
  }
) {
  const counters: Record<string, number> = {};

  const nextResponse = (table: string): QueryResponse => {
    const idx = counters[table] || 0;
    counters[table] = idx + 1;
    return responses[table]?.[idx] || { data: null, error: null };
  };

  const makeBuilder = (table: string) => {
    const builder: any = {
      select: jest.fn(() => builder),
      or: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      in: jest.fn(() => builder),
      gte: jest.fn(() => builder),
      order: jest.fn(() => builder),
      limit: jest.fn(() => builder),
      maybeSingle: jest.fn(async () => nextResponse(table)),
      single: jest.fn(async () => nextResponse(table)),
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve(nextResponse(table)).then(onFulfilled, onRejected),
    };
    return builder;
  };

  return {
    auth: {
      getUser:
        options?.getUser ||
        jest.fn(async () => ({
          data: { user: { id: 'auth-user' } },
        })),
    },
    from: jest.fn((table: string) => makeBuilder(table)),
  };
}

describe('fetchTeacherDashboardData', () => {
  const mockAssertSupabase = assertSupabase as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('returns an empty model when no teacher profile exists', async () => {
    const supabaseMock = buildSupabaseMock({
      profiles: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });
    mockAssertSupabase.mockReturnValue(supabaseMock);

    const result = await fetchTeacherDashboardData('teacher-1');

    expect(result.schoolName).toBe('No School Assigned');
    expect(result.totalStudents).toBe(0);
    expect(result.totalClasses).toBe(0);
    expect(result.pendingGrading).toBe(0);
    expect(result.myClasses).toEqual([]);
  });

  it('prefers active subscription tier over fallback columns', async () => {
    const supabaseMock = buildSupabaseMock({
      profiles: [
        {
          data: {
            id: 'teacher-1',
            preschool_id: 'school-1',
            organization_id: null,
            first_name: 'Ava',
            last_name: 'Teacher',
            role: 'teacher',
          },
          error: null,
        },
      ],
      preschools: [
        {
          data: { id: 'school-1', name: 'Alpha School' },
          error: null,
        },
      ],
      subscriptions: [
        {
          data: {
            id: 'sub-1',
            subscription_plans: { tier: 'enterprise' },
          },
          error: null,
        },
      ],
      classes: [{ data: [], error: null }],
      homework_assignments: [{ data: [], error: null }],
      events: [{ data: [], error: null }],
    });

    mockAssertSupabase.mockReturnValue(supabaseMock);

    const result = await fetchTeacherDashboardData('teacher-1');

    expect(result.schoolName).toBe('Alpha School');
    expect(result.schoolTier).toBe('enterprise');
  });

  it('falls back to preschool tier, then organization tier when needed', async () => {
    const preschoolFallbackMock = buildSupabaseMock({
      profiles: [
        {
          data: {
            id: 'teacher-1',
            preschool_id: 'school-2',
            organization_id: null,
            first_name: 'Mila',
            last_name: 'Teacher',
            role: 'teacher',
          },
          error: null,
        },
      ],
      preschools: [
        { data: { id: 'school-2', name: 'Beta School' }, error: null },
        { data: { subscription_tier: 'premium' }, error: null },
      ],
      subscriptions: [{ data: null, error: null }],
      classes: [{ data: [], error: null }],
      homework_assignments: [{ data: [], error: null }],
      events: [{ data: [], error: null }],
    });
    mockAssertSupabase.mockReturnValue(preschoolFallbackMock);

    const preschoolResult = await fetchTeacherDashboardData('teacher-1');
    expect(preschoolResult.schoolTier).toBe('premium');

    const orgFallbackMock = buildSupabaseMock({
      profiles: [
        {
          data: {
            id: 'teacher-2',
            preschool_id: 'org-1',
            organization_id: 'org-1',
            first_name: 'Noah',
            last_name: 'Teacher',
            role: 'teacher',
          },
          error: null,
        },
      ],
      preschools: [{ data: null, error: null }],
      organizations: [
        {
          data: { id: 'org-1', name: 'Org Campus', plan_tier: 'starter' },
          error: null,
        },
      ],
      classes: [{ data: [], error: null }],
      homework_assignments: [{ data: [], error: null }],
      events: [{ data: [], error: null }],
    });
    mockAssertSupabase.mockReturnValue(orgFallbackMock);

    const orgResult = await fetchTeacherDashboardData('teacher-2');
    expect(orgResult.schoolName).toBe('Org Campus');
    expect(orgResult.schoolTier).toBe('starter');
  });

  it('deduplicates attendance/student identities and computes assignment statuses correctly', async () => {
    const now = Date.now();
    const future = new Date(now + 86_400_000).toISOString();
    const past = new Date(now - 86_400_000).toISOString();

    const supabaseMock = buildSupabaseMock({
      profiles: [
        {
          data: {
            id: 'teacher-3',
            preschool_id: 'school-3',
            organization_id: null,
            first_name: 'Liam',
            last_name: 'Teacher',
            role: 'teacher',
          },
          error: null,
        },
      ],
      preschools: [
        { data: { id: 'school-3', name: 'Gamma School' }, error: null },
        { data: { subscription_tier: 'free' }, error: null },
      ],
      subscriptions: [{ data: null, error: null }],
      class_teachers: [
        {
          data: [{ class_id: 'class-1' }, { class_id: 'class-2' }],
          error: null,
        },
      ],
      classes: [
        // First call: legacy teacher_id lookup (returns IDs only)
        { data: [], error: null },
        // Second call: full class details with students
        {
          data: [
            {
              id: 'class-1',
              name: 'Class A',
              grade_level: 'Grade R',
              room_number: 'R1',
              students: [
                { id: 's1', is_active: true },
                { id: 's2', is_active: true },
                { id: 's2', is_active: true },
              ],
            },
            {
              id: 'class-2',
              name: 'Class B',
              grade_level: 'Grade 1',
              room_number: 'R2',
              students: [
                { id: 's2', is_active: true },
                { id: 's3', is_active: false },
                { id: 's4', is_active: true },
              ],
            },
          ],
          error: null,
        },
      ],
      attendance: [
        {
          data: [
            { student_id: 's1', status: 'present' },
            { student_id: 's2', status: 'present' },
            { student_id: 's4', status: 'absent' },
          ],
          error: null,
        },
      ],
      homework_assignments: [
        {
          data: [
            {
              id: 'hw-1',
              title: 'Counting',
              due_date: future,
              homework_submissions: [
                { status: 'submitted' },
                { status: 'submitted' },
              ],
            },
            {
              id: 'hw-2',
              title: 'Past Task',
              due_date: past,
              homework_submissions: [],
            },
            {
              id: 'hw-3',
              title: 'Reviewed Task',
              due_date: future,
              homework_submissions: [{ status: 'graded' }],
            },
          ],
          error: null,
        },
      ],
      events: [{ data: [], error: null }],
    });

    mockAssertSupabase.mockReturnValue(supabaseMock);

    const result = await fetchTeacherDashboardData('teacher-3');

    expect(result.totalStudents).toBe(3);
    expect(result.myClasses).toHaveLength(2);
    expect(result.myClasses[0].studentCount).toBe(2);
    expect(result.myClasses[1].studentCount).toBe(2);
    expect(result.myClasses[0].presentToday).toBe(2);
    expect(result.myClasses[1].presentToday).toBe(1);

    expect(result.recentAssignments.map((item) => item.status)).toEqual([
      'pending',
      'overdue',
      'graded',
    ]);
    expect(result.pendingGrading).toBe(2);
  });

  it('continues with userId when auth.getUser times out', async () => {
    jest.useFakeTimers();

    const supabaseMock = buildSupabaseMock(
      {
        profiles: [
          {
            data: {
              id: 'teacher-timeout',
              preschool_id: 'school-timeout',
              organization_id: null,
              first_name: 'Tina',
              last_name: 'Timeout',
              role: 'teacher',
            },
            error: null,
          },
        ],
        preschools: [
          { data: { id: 'school-timeout', name: 'Timeout School' }, error: null },
          { data: { subscription_tier: 'free' }, error: null },
        ],
        subscriptions: [{ data: null, error: null }],
        classes: [{ data: [], error: null }],
        homework_assignments: [{ data: [], error: null }],
        events: [{ data: [], error: null }],
      },
      {
        getUser: () => new Promise(() => {}),
      }
    );

    mockAssertSupabase.mockReturnValue(supabaseMock);

    const promise = fetchTeacherDashboardData('teacher-timeout');
    jest.advanceTimersByTime(2600);

    const result = await promise;
    expect(result.schoolName).toBe('Timeout School');
    expect(result.totalClasses).toBe(0);
  });
});
