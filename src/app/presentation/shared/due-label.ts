const MS_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export interface DueLabel {
  readonly text: string;
  /** True when the date has passed — the caller decides how loudly to say so. */
  readonly overdue: boolean;
}

/**
 * A short, human due label.
 *
 * Relative near today and absolute beyond it, on purpose: "in 3 days" is harder
 * to act on than "Fri 12 Sep" once you are actually planning, and "today" is
 * far easier to act on than the date.
 *
 * `Intl.RelativeTimeFormat` with `numeric: 'auto'` is what buys the named forms
 * — "tomorrow", "yesterday", "غدًا" — rather than "in 1 day". Those read better
 * in every language, and in Arabic they are the only forms that get the dual
 * right, which no hand-written `n === 1 ? …` can reach.
 */
export function dueLabel(iso: string | undefined, tag: string, now = new Date()): DueLabel {
  if (!iso) return { text: 'No date', overdue: false };

  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return { text: 'No date', overdue: false };

  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / MS_DAY);
  const overdue = due.getTime() < now.getTime();

  if (Math.abs(days) <= 1) {
    return {
      text: new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(days, 'day'),
      overdue,
    };
  }

  const sameYear = due.getFullYear() === now.getFullYear();
  return {
    text: new Intl.DateTimeFormat(tag, {
      weekday: Math.abs(days) < 7 ? 'short' : undefined,
      day: 'numeric',
      month: 'short',
      year: sameYear ? undefined : 'numeric',
    }).format(due),
    overdue,
  };
}
