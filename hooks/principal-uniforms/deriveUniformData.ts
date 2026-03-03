import type { DisplayRow, UniformRow, StudentRow } from './types';
import { formatName, resolveParentProfile } from './types';
import { hasAssignedBackNumber, normalizeBackNumber } from './numbering';

export interface DerivedUniformData {
  submittedRows: DisplayRow[];
  missingRows: DisplayRow[];
  submittedCount: number;
  missingCount: number;
  missingContactableCount: number;
  unpaidContactableCount: number;
  sizeSummary: Record<string, number>;
  missingByClass: { name: string; count: number }[];
}

export function deriveUniformData(
  rows: UniformRow[],
  students: StudentRow[],
  paymentStatusByStudent: Map<string, 'paid' | 'pending' | 'unpaid'>,
  assignedBackNumberByStudent: Map<string, string>,
  parentProfilesById: Record<string, { id?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }> = {},
): DerivedUniformData {
  const studentLookup = new Map<string, StudentRow>();
  students.forEach((s) => studentLookup.set(s.id, s));

  const submittedStudentIds = new Set(rows.map((r) => r.student_id));
  const missingStudents = students.filter((s) => !submittedStudentIds.has(s.id));

  const submittedRows: DisplayRow[] = rows.map((row) => {
    const student = studentLookup.get(row.student_id);
    const relationParentProfile = resolveParentProfile(student, row.parent || null);
    const candidateParentIds = [
      relationParentProfile?.id || null,
      row.parent_id || null,
      student?.parent_id || null,
      student?.guardian_id || null,
      student?.parent?.id || null,
      student?.guardian?.id || null,
    ].filter(Boolean) as string[];
    const fallbackParentId = candidateParentIds.find((id) => Boolean(parentProfilesById[id])) || candidateParentIds[0] || '';
    const fallbackParentProfile = fallbackParentId ? parentProfilesById[fallbackParentId] : null;
    const parentProfile = relationParentProfile || fallbackParentProfile || null;
    const childName = row.child_name
      || formatName(row.student?.first_name, row.student?.last_name)
      || formatName(student?.first_name, student?.last_name);
    const parentName = formatName(parentProfile?.first_name, parentProfile?.last_name) || parentProfile?.email || '';
    const rowBackNumber = normalizeBackNumber(row.tshirt_number);
    const assignedBackNumber = normalizeBackNumber(assignedBackNumberByStudent.get(row.student_id));
    const resolvedBackNumber = hasAssignedBackNumber(rowBackNumber)
      ? rowBackNumber
      : hasAssignedBackNumber(assignedBackNumber)
        ? assignedBackNumber
        : '';

    return {
      id: row.id, studentId: row.student_id,
      childName: childName || 'Unnamed Child',
      ageYears: row.age_years,
      tshirtSize: row.tshirt_size,
      tshirtQuantity: row.tshirt_quantity ?? 0,
      shortsQuantity: row.shorts_quantity ?? 0,
      tshirtNumber: resolvedBackNumber,
      isReturning: Boolean(row.is_returning),
      sampleSupplied: Boolean(row.sample_supplied),
      studentCode: row.student?.student_id || student?.student_id || '',
      parentId: (parentProfile?.id || fallbackParentId || ''),
      parentName, parentEmail: parentProfile?.email || '',
      parentPhone: parentProfile?.phone || '',
      submittedAt: row.created_at, updatedAt: row.updated_at || null,
      status: 'submitted' as const,
      className: student?.classroom?.name || 'Unassigned',
      paymentStatus: paymentStatusByStudent.get(row.student_id) || 'unpaid',
    };
  });

  const missingRows: DisplayRow[] = missingStudents.map((student) => {
    const relationParentProfile = resolveParentProfile(student, null);
    const candidateParentIds = [
      relationParentProfile?.id || null,
      student.parent_id || null,
      student.guardian_id || null,
      student.parent?.id || null,
      student.guardian?.id || null,
    ].filter(Boolean) as string[];
    const fallbackParentId = candidateParentIds.find((id) => Boolean(parentProfilesById[id])) || candidateParentIds[0] || '';
    const fallbackParentProfile = fallbackParentId ? parentProfilesById[fallbackParentId] : null;
    const parentProfile = relationParentProfile || fallbackParentProfile || null;
    const parentName = formatName(parentProfile?.first_name, parentProfile?.last_name) || parentProfile?.email || '';
    const assignedBackNumber = normalizeBackNumber(assignedBackNumberByStudent.get(student.id));
    return {
      id: student.id, studentId: student.id,
      childName: formatName(student.first_name, student.last_name) || 'Unnamed Child',
      ageYears: null, tshirtSize: '', tshirtQuantity: null, shortsQuantity: null,
      tshirtNumber: hasAssignedBackNumber(assignedBackNumber) ? assignedBackNumber : '', isReturning: false, sampleSupplied: false,
      studentCode: student.student_id || '',
      parentId: (parentProfile?.id || fallbackParentId || ''),
      parentName, parentEmail: parentProfile?.email || '',
      parentPhone: parentProfile?.phone || '',
      submittedAt: null, updatedAt: null,
      status: 'missing' as const,
      className: student.classroom?.name || 'Unassigned',
      paymentStatus: paymentStatusByStudent.get(student.id) || 'unpaid',
    };
  });

  const sizeSummary: Record<string, number> = {};
  rows.forEach((row) => {
    if (!row.tshirt_size) return;
    sizeSummary[row.tshirt_size] = (sizeSummary[row.tshirt_size] || 0) + 1;
  });

  const classMap: Record<string, number> = {};
  missingStudents.forEach((s) => {
    const cn = s.classroom?.name || 'Unassigned';
    classMap[cn] = (classMap[cn] || 0) + 1;
  });
  const missingByClass = Object.entries(classMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    submittedRows, missingRows,
    submittedCount: submittedRows.length,
    missingCount: missingRows.length,
    missingContactableCount: missingRows.filter((r) => r.parentId).length,
    unpaidContactableCount: submittedRows.filter((r) => r.paymentStatus === 'unpaid' && r.parentId).length,
    sizeSummary, missingByClass,
  };
}
