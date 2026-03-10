import { getMonthStartISO } from '@/lib/utils/dateUtils';

type FeeMonthLike = {
  billing_month?: string | null;
  due_date?: string | null;
};

export type StudentFeeMonthInfo = {
  billingMonthIso: string | null;
  dueMonthIso: string | null;
  effectiveMonthIso: string | null;
  hasBillingMonthDrift: boolean;
};

function parseMonthIso(value: string | null): { year: number; month: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-01$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

function getCalendarMonthDistance(a: string | null, b: string | null): number | null {
  const parsedA = parseMonthIso(a);
  const parsedB = parseMonthIso(b);
  if (!parsedA || !parsedB) return null;
  return Math.abs((parsedA.year - parsedB.year) * 12 + (parsedA.month - parsedB.month));
}

export function getStudentFeeMonthInfo(fee: FeeMonthLike | null | undefined): StudentFeeMonthInfo {
  const billingMonthIso = fee?.billing_month
    ? getMonthStartISO(fee.billing_month)
    : null;
  const dueMonthIso = fee?.due_date
    ? getMonthStartISO(fee.due_date)
    : null;
  const monthDistance = getCalendarMonthDistance(billingMonthIso, dueMonthIso);
  const hasBillingMonthDrift = typeof monthDistance === 'number' ? monthDistance > 1 : false;

  return {
    billingMonthIso,
    dueMonthIso,
    effectiveMonthIso: billingMonthIso || dueMonthIso,
    hasBillingMonthDrift,
  };
}

export function shouldExcludeStudentFeeFromMonthScopedViews(
  fee: FeeMonthLike | null | undefined,
  enrollmentDate?: string | null,
): boolean {
  const { effectiveMonthIso, hasBillingMonthDrift } = getStudentFeeMonthInfo(fee);
  if (hasBillingMonthDrift) return true;
  if (!effectiveMonthIso || !enrollmentDate) return false;

  const enrollmentMonthIso = getMonthStartISO(enrollmentDate);

  if (!enrollmentMonthIso) return false;
  return effectiveMonthIso < enrollmentMonthIso;
}

export function isStudentFeeInMonth(
  fee: FeeMonthLike | null | undefined,
  targetMonthIso?: string | null,
): boolean {
  if (!targetMonthIso) return true;
  const normalizedTargetMonthIso = getMonthStartISO(targetMonthIso);
  const { effectiveMonthIso, hasBillingMonthDrift } = getStudentFeeMonthInfo(fee);

  if (hasBillingMonthDrift || !effectiveMonthIso || !normalizedTargetMonthIso) {
    return false;
  }

  return effectiveMonthIso === normalizedTargetMonthIso;
}
