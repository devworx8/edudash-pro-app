export const parseDateOnly = (value: string): Date | null => {
  if (!value) return null;
  const datePart = value.split('T')[0];
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const calculateAgeOnDate = (dateOfBirth: string, onDate: Date): number => {
  const dob = parseDateOnly(dateOfBirth);
  if (!dob) return 0;
  let age = onDate.getFullYear() - dob.getFullYear();
  const monthDiff = onDate.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && onDate.getDate() < dob.getDate())) {
    age -= 1;
  }
  return Math.max(age, 0);
};

export const getNextBirthdayDate = (dateOfBirth: string, today: Date): Date | null => {
  const dob = parseDateOnly(dateOfBirth);
  if (!dob) return null;
  const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < today) {
    next.setFullYear(today.getFullYear() + 1);
  }
  return next;
};

export const getDaysUntilDate = (target: Date, today: Date): number => {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(target);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};
