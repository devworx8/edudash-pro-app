/**
 * South African School Calendar Data
 * Official term dates and public holidays for year plan generation
 * Source: Department of Basic Education, National Education Policy Act
 */

export interface SAPublicHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

export interface SATermDates {
  term: number;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

/** SA Public Holidays 2025 */
export const SA_PUBLIC_HOLIDAYS_2025: SAPublicHoliday[] = [
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-03-21', name: 'Human Rights Day' },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-04-21', name: 'Family Day' },
  { date: '2025-04-27', name: 'Freedom Day' },
  { date: '2025-05-01', name: "Workers' Day" },
  { date: '2025-06-16', name: 'Youth Day' },
  { date: '2025-08-09', name: "National Women's Day" },
  { date: '2025-09-24', name: 'Heritage Day' },
  { date: '2025-12-16', name: 'Day of Reconciliation' },
  { date: '2025-12-25', name: 'Christmas Day' },
  { date: '2025-12-26', name: 'Day of Goodwill' },
];

/** SA Public Schools Term Dates 2025 */
export const SA_TERM_DATES_2025: SATermDates[] = [
  { term: 1, start: '2025-01-15', end: '2025-03-28' },
  { term: 2, start: '2025-04-08', end: '2025-06-27' },
  { term: 3, start: '2025-07-22', end: '2025-10-03' },
  { term: 4, start: '2025-10-13', end: '2025-12-10' },
];

/** SA Public Holidays 2026 */
export const SA_PUBLIC_HOLIDAYS_2026: SAPublicHoliday[] = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-03-21', name: 'Human Rights Day' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Family Day' },
  { date: '2026-04-27', name: 'Freedom Day' },
  { date: '2026-05-01', name: "Workers' Day" },
  { date: '2026-06-15', name: 'Special School Holiday' },
  { date: '2026-06-16', name: 'Youth Day' },
  { date: '2026-08-09', name: "National Women's Day" },
  { date: '2026-08-10', name: 'Public Holiday' },
  { date: '2026-09-24', name: 'Heritage Day' },
  { date: '2026-12-16', name: 'Day of Reconciliation' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Day of Goodwill' },
];

/** SA Public Schools Term Dates 2026 */
export const SA_TERM_DATES_2026: SATermDates[] = [
  { term: 1, start: '2026-01-14', end: '2026-03-27' },
  { term: 2, start: '2026-04-08', end: '2026-06-26' },
  { term: 3, start: '2026-07-21', end: '2026-09-23' },
  { term: 4, start: '2026-10-06', end: '2026-12-09' },
];

/** Get holidays and term dates for a given academic year */
export function getSACalendarForYear(year: number): {
  holidays: SAPublicHoliday[];
  termDates: SATermDates[];
} {
  if (year === 2025) {
    return { holidays: SA_PUBLIC_HOLIDAYS_2025, termDates: SA_TERM_DATES_2025 };
  }
  if (year === 2026) {
    return { holidays: SA_PUBLIC_HOLIDAYS_2026, termDates: SA_TERM_DATES_2026 };
  }
  // Fallback: use 2026 as template for future years
  const template = year >= 2026 ? SA_TERM_DATES_2026 : SA_TERM_DATES_2025;
  const holidayTemplate = year >= 2026 ? SA_PUBLIC_HOLIDAYS_2026 : SA_PUBLIC_HOLIDAYS_2025;
  return {
    holidays: holidayTemplate.map((h) => ({
      ...h,
      date: h.date.replace(/\d{4}/, String(year)),
    })),
    termDates: template.map((t) => ({
      ...t,
      start: t.start.replace(/\d{4}/, String(year)),
      end: t.end.replace(/\d{4}/, String(year)),
    })),
  };
}

/** Format calendar data for AI prompt injection */
export function formatSACalendarForPrompt(year: number): string {
  const { holidays, termDates } = getSACalendarForYear(year);
  const holidayLines = holidays.map((h) => `  - ${h.date}: ${h.name}`).join('\n');
  const termLines = termDates.map((t) => `  - Term ${t.term}: ${t.start} to ${t.end}`).join('\n');
  return `South African School Calendar for ${year}:

TERM DATES (use these exact boundaries):
${termLines}

PUBLIC HOLIDAYS (include in monthlyEntries with bucket "holidays_closures", subtype "holiday"):
${holidayLines}

IMPORTANT: Use these exact dates. Do not invent or approximate term or holiday dates.`;
}
