import {
  getStudentFeeMonthInfo,
  isStudentFeeInMonth,
  shouldExcludeStudentFeeFromMonthScopedViews,
} from '@/lib/utils/studentFeeMonth';

describe('studentFeeMonth helpers', () => {
  it('allows the normal prior-month due date window for the same billing cycle', () => {
    const info = getStudentFeeMonthInfo({
      billing_month: '2026-03-01',
      due_date: '2026-02-28',
    });

    expect(info.billingMonthIso).toBe('2026-03-01');
    expect(info.dueMonthIso).toBe('2026-02-01');
    expect(info.hasBillingMonthDrift).toBe(false);
    expect(info.effectiveMonthIso).toBe('2026-03-01');
    expect(isStudentFeeInMonth({ billing_month: '2026-03-01', due_date: '2026-02-28' }, '2026-03-01')).toBe(true);
  });

  it('flags inconsistent due dates that drift into the wrong billing month', () => {
    const info = getStudentFeeMonthInfo({
      billing_month: '2026-03-01',
      due_date: '2026-01-31',
    });

    expect(info.billingMonthIso).toBe('2026-03-01');
    expect(info.dueMonthIso).toBe('2026-01-01');
    expect(info.hasBillingMonthDrift).toBe(true);
    expect(info.effectiveMonthIso).toBe('2026-03-01');
    expect(isStudentFeeInMonth({ billing_month: '2026-03-01', due_date: '2026-01-31' }, '2026-03-01')).toBe(false);
  });

  it('excludes drifted or pre-enrollment rows from month-scoped views', () => {
    expect(
      shouldExcludeStudentFeeFromMonthScopedViews(
        { billing_month: '2026-03-01', due_date: '2026-01-31' },
        '2026-03-02',
      ),
    ).toBe(true);

    expect(
      shouldExcludeStudentFeeFromMonthScopedViews(
        { billing_month: '2026-02-01', due_date: '2026-02-01' },
        '2026-03-02',
      ),
    ).toBe(true);

    expect(
      shouldExcludeStudentFeeFromMonthScopedViews(
        { billing_month: '2026-03-01', due_date: '2026-02-28' },
        '2026-03-02',
      ),
    ).toBe(false);
  });
});
