export type CleaningShiftSlot = 'morning' | 'midday' | 'afternoon' | 'closing';

export interface CleaningShiftSlotOption {
  id: CleaningShiftSlot;
  label: string;
}

export const CLEANING_SHIFT_SLOTS: CleaningShiftSlotOption[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'midday', label: 'Midday' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'closing', label: 'Closing' },
];

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function slotSortValue(slot: CleaningShiftSlot): number {
  switch (slot) {
    case 'morning':
      return 0;
    case 'midday':
      return 1;
    case 'afternoon':
      return 2;
    case 'closing':
      return 3;
    default:
      return 9;
  }
}
