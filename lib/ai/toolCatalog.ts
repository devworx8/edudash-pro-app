import { normalizeRole } from '@/lib/rbac';

export type DashToolShortcut = {
  name: string;
  label: string;
  description: string;
  roles?: Array<'parent' | 'student' | 'teacher' | 'principal' | 'principal_admin' | 'super_admin'>;
  category?: 'caps' | 'data' | 'communication' | 'navigation';
  params?: Record<string, any>;
};

export const DASH_TOOL_SHORTCUTS: DashToolShortcut[] = [
  {
    name: 'get_schedule',
    label: 'Upcoming Schedule',
    description: 'Fetch upcoming events for the next week.',
    roles: ['parent', 'student', 'teacher', 'principal', 'principal_admin', 'super_admin'],
    category: 'data',
    params: { start_date: 'today', days: 7 },
  },
  {
    name: 'get_assignments',
    label: 'Assignments Due',
    description: 'List upcoming assignments and due dates.',
    roles: ['parent', 'student', 'teacher', 'principal', 'principal_admin', 'super_admin'],
    category: 'data',
    params: { status: 'pending', days_ahead: 30 },
  },
  {
    name: 'search_caps_curriculum',
    label: 'Search CAPS',
    description: 'Search CAPS curriculum by topic or keyword.',
    roles: ['parent', 'student', 'teacher', 'principal', 'principal_admin', 'super_admin'],
    category: 'caps',
    params: { query: '' },
  },
  {
    name: 'get_caps_documents',
    label: 'CAPS Documents',
    description: 'Retrieve CAPS documents for a grade + subject.',
    roles: ['parent', 'student', 'teacher', 'principal', 'principal_admin', 'super_admin'],
    category: 'caps',
    params: { grade: '', subject: '' },
  },
  {
    name: 'get_caps_subjects',
    label: 'CAPS Subjects',
    description: 'List CAPS subjects for a grade level.',
    roles: ['parent', 'student', 'teacher', 'principal', 'principal_admin', 'super_admin'],
    category: 'caps',
    params: { grade: '' },
  },
  {
    name: 'get_member_list',
    label: 'Students List',
    description: 'List active students (staff only).',
    roles: ['teacher', 'principal', 'principal_admin', 'super_admin'],
    category: 'data',
    params: { limit: 20 },
  },
  {
    name: 'get_organization_stats',
    label: 'School Stats',
    description: 'Summarize student/teacher/class counts.',
    roles: ['principal', 'principal_admin', 'super_admin'],
    category: 'data',
  },
  {
    name: 'compose_message',
    label: 'Compose Message',
    description: 'Draft a message to parents or teachers.',
    roles: ['teacher', 'principal', 'principal_admin', 'super_admin'],
    category: 'communication',
    params: { subject: '', body: '', recipient: 'parent' },
  },
  {
    name: 'generate_pdf_from_prompt',
    label: 'Create PDF',
    description: 'Generate a printable PDF from a natural-language request.',
    roles: ['parent', 'student', 'teacher', 'principal', 'principal_admin', 'super_admin'],
    category: 'communication',
    params: { prompt: '', document_type: 'general' },
  },
  {
    name: 'open_document',
    label: 'Open Link',
    description: 'Open a URL, document ID, or screen route.',
    roles: ['parent', 'student', 'teacher', 'principal', 'principal_admin', 'super_admin'],
    category: 'navigation',
    params: { url: '' },
  },
];

export function getDashToolShortcutsForRole(role?: string | null): DashToolShortcut[] {
  const normalized = role ? normalizeRole(role) : null;
  if (!normalized) return DASH_TOOL_SHORTCUTS;
  return DASH_TOOL_SHORTCUTS.filter((tool) => {
    if (!tool.roles || tool.roles.length === 0) return true;
    return tool.roles.includes(normalized);
  });
}
