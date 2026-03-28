import { buildReceivableReminderRecipients } from './paymentReminderService';

describe('buildReceivableReminderRecipients', () => {
  it('groups multiple learners under one parent and deduplicates repeated links', () => {
    const recipients = buildReceivableReminderRecipients(
      [
        {
          studentId: 'student-1',
          studentName: 'Koketso Baloyi',
          outstandingAmount: 720,
          pendingCount: 0,
          overdueCount: 1,
          dueDate: '2026-03-05',
          studentFeeId: 'fee-1',
          parentIds: ['parent-1', 'parent-1'],
        },
        {
          studentId: 'student-2',
          studentName: 'Mbalenhle Makhubela',
          outstandingAmount: 680,
          pendingCount: 1,
          overdueCount: 0,
          dueDate: '2026-03-10',
          studentFeeId: 'fee-2',
          parentIds: ['parent-1'],
        },
        {
          studentId: 'student-3',
          studentName: 'Thabo Molefe',
          outstandingAmount: 450,
          pendingCount: 1,
          overdueCount: 0,
          dueDate: '2026-03-12',
          studentFeeId: 'fee-3',
          parentIds: ['parent-2'],
        },
      ],
      [
        { id: 'parent-1', first_name: 'Naledi', last_name: 'Baloyi', email: 'naledi@example.com' },
        { id: 'parent-2', first_name: 'Sipho', last_name: 'Molefe', email: null },
      ],
    );

    expect(recipients).toHaveLength(2);
    expect(recipients[0]).toMatchObject({
      parentId: 'parent-1',
      parentName: 'Naledi Baloyi',
      email: 'naledi@example.com',
      totalOutstanding: 1400,
      overdueCount: 1,
      pendingCount: 1,
    });
    expect(recipients[0].students.map((student) => student.studentId)).toEqual(['student-1', 'student-2']);

    expect(recipients[1]).toMatchObject({
      parentId: 'parent-2',
      parentName: 'Sipho Molefe',
      email: null,
      totalOutstanding: 450,
      overdueCount: 0,
      pendingCount: 1,
    });
    expect(recipients[1].students.map((student) => student.studentId)).toEqual(['student-3']);
  });
});
