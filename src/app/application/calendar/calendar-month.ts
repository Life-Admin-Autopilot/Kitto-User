/**
 * Month-grid arithmetic. Pure functions, no framework, no I/O.
 *
 * Everything here works in LOCAL time deliberately. A calendar cell is a
 * calendar day as the person looking at it experiences it, so the boundaries
 * have to be local midnights — computing them in UTC puts a 01:00 Cairo matter
 * on the previous day for a third of the year.
 */

export const DAYS_IN_WEEK = 7;

/** Six rows always. A month can span six, and a grid that changes height
 *  between months makes everything below it jump on every navigation. */
export const WEEKS_IN_GRID = 6;

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addMonths(date: Date, months: number): Date {
  const copy = startOfDay(date);
  // Land on the 1st before shifting: adding a month to the 31st gives you a
  // date in the month after next, because JavaScript overflows rather than
  // clamping. Navigating forward from 31 August would skip September entirely.
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function startOfMonth(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(1);
  return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Which weekday a week starts on, for this locale.
 *
 * Not a constant, because the answer is genuinely regional and the product
 * ships in Egypt and the UK: `getWeekInfo()` reports Saturday for `ar-EG` and
 * Monday for `en-GB`, and a grid that always starts on Monday is simply wrong
 * for half the users. Falls back to Monday where the API is missing.
 *
 * Returns 0–6 with Sunday as 0, matching `Date.prototype.getDay()`. The
 * standard reports 1–7 with Monday as 1, so Sunday arrives as 7 and has to be
 * folded back to 0.
 */
export function firstDayOfWeek(locale: string): number {
  interface WeekInfo {
    firstDay: number;
  }
  type LocaleWithWeekInfo = Intl.Locale & {
    getWeekInfo?: () => WeekInfo;
    weekInfo?: WeekInfo;
  };

  try {
    const resolved = new Intl.Locale(locale) as LocaleWithWeekInfo;
    const info = resolved.getWeekInfo?.() ?? resolved.weekInfo;
    if (!info) return 1;
    return info.firstDay % DAYS_IN_WEEK;
  } catch {
    return 1;
  }
}

export interface MonthGrid {
  /** The month this grid is centred on, at local midnight on the 1st. */
  readonly month: Date;
  /** First cell — on or before the 1st, aligned to the locale's week start. */
  readonly gridStart: Date;
  /** Exclusive end of the last cell. */
  readonly gridEnd: Date;
  /** Six rows of seven days. */
  readonly weeks: readonly (readonly Date[])[];
}

export function buildMonthGrid(anchor: Date, weekStart: number): MonthGrid {
  const month = startOfMonth(anchor);

  // How far back to reach for the first cell. The modulo keeps it in 0–6 even
  // when the week starts later in the week than the 1st falls.
  const lead = (month.getDay() - weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const gridStart = addDays(month, -lead);

  const weeks: Date[][] = [];
  for (let week = 0; week < WEEKS_IN_GRID; week++) {
    const row: Date[] = [];
    for (let day = 0; day < DAYS_IN_WEEK; day++) {
      row.push(addDays(gridStart, week * DAYS_IN_WEEK + day));
    }
    weeks.push(row);
  }

  return {
    month,
    gridStart,
    gridEnd: addDays(gridStart, WEEKS_IN_GRID * DAYS_IN_WEEK),
    weeks,
  };
}

/** A local-midnight key for bucketing matters by day. Sorts lexicographically. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
