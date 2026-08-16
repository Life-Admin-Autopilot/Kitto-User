import { describe, expect, it } from 'vitest';

import { wallClockFromNow } from './zoned-time';

/** What hour does this instant read as, in that zone? */
function hourIn(iso: string, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(
      new Date(iso),
    ),
  ) % 24;
}

function dayIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

describe('wallClockFromNow', () => {
  it('lands on the requested hour in the target zone, not the runner’s', () => {
    const now = new Date('2026-08-16T22:30:00.000Z');
    for (const zone of ['Africa/Cairo', 'Europe/London', 'America/New_York', 'Asia/Tokyo']) {
      const result = wallClockFromNow(1, 9, zone, now);
      expect(hourIn(result, zone), `hour in ${zone}`).toBe(9);
    }
  });

  it('lands on the NEXT calendar day in the target zone', () => {
    const now = new Date('2026-08-16T22:30:00.000Z');
    // 22:30 UTC is already the 17th in Tokyo, so "tomorrow" there is the 18th.
    expect(dayIn(wallClockFromNow(1, 9, 'Asia/Tokyo', now), 'Asia/Tokyo')).toBe('2026-08-18');
    // ...and still the 16th in New York, so "tomorrow" there is the 17th.
    expect(dayIn(wallClockFromNow(1, 9, 'America/New_York', now), 'America/New_York')).toBe(
      '2026-08-17',
    );
  });

  it('holds the wall-clock hour across a spring-forward boundary', () => {
    // Europe/London moves to BST on 29 March 2026. A naive offset taken "now"
    // would land this an hour out.
    const now = new Date('2026-03-28T12:00:00.000Z');
    const result = wallClockFromNow(1, 9, 'Europe/London', now);
    expect(hourIn(result, 'Europe/London')).toBe(9);
    expect(dayIn(result, 'Europe/London')).toBe('2026-03-29');
  });

  it('holds the wall-clock hour across an autumn fall-back boundary', () => {
    // Europe/London returns to GMT on 25 October 2026.
    const now = new Date('2026-10-24T12:00:00.000Z');
    const result = wallClockFromNow(1, 9, 'Europe/London', now);
    expect(hourIn(result, 'Europe/London')).toBe(9);
    expect(dayIn(result, 'Europe/London')).toBe('2026-10-25');
  });

  it('returns a real ISO instant', () => {
    const result = wallClockFromNow(1, 9, 'Africa/Cairo', new Date('2026-08-16T22:30:00.000Z'));
    expect(Number.isNaN(new Date(result).getTime())).toBe(false);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
