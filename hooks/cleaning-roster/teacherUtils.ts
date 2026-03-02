import type { CleaningTeacher } from './types';

export function mapTeacherRows(rows: any[]): CleaningTeacher[] {
  return rows
    .map((teacher) => {
      const teacherUserId = teacher.auth_user_id || teacher.user_id;
      if (!teacherUserId) return null;
      const displayName =
        [teacher.first_name, teacher.last_name].filter(Boolean).join(' ').trim()
        || String(teacher.full_name || '').trim()
        || String(teacher.email || '').split('@')[0]
        || 'Teacher';
      return {
        id: teacher.id as string,
        teacherUserId,
        displayName,
        email: teacher.email || null,
      } satisfies CleaningTeacher;
    })
    .filter((teacher): teacher is CleaningTeacher => Boolean(teacher));
}

export function mapMemberRows(rows: any[]): CleaningTeacher[] {
  return rows
    .map((member) => {
      if (!member.user_id) return null;
      const displayName =
        [member.first_name, member.last_name].filter(Boolean).join(' ').trim()
        || String(member.email || '').split('@')[0]
        || 'Teacher';
      return {
        id: member.user_id as string,
        teacherUserId: member.user_id as string,
        displayName,
        email: member.email || null,
      } satisfies CleaningTeacher;
    })
    .filter((teacher): teacher is CleaningTeacher => Boolean(teacher));
}
