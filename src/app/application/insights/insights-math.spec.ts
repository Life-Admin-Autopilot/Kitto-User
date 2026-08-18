import { describe, expect, it } from 'vitest';

import type { Matter } from '@domain/matters/matter';
import {
  bucketByWeek,
  buildGravity,
  buildPipeline,
  estimatedMinutes,
  outcomeOf,
  projectInaction,
} from './insights-math';

/** A matter with sane defaults; override only what a test is about. */
function matter(overrides: Partial<Matter> = {}): Matter {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'A matter',
    domain: 'home',
    kind: 'reminder',
    status: 'open',
    priority: 'normal',
    priorityRank: 1,
    tags: [],
    subtasks: [],
    reminders: [],
    rescheduleCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Local midnight, so tests read in the same frame the code computes in. */
function localDay(year: number, month: number, day: number, hour = 0): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

describe('bucketByWeek', () => {
  const now = localDay(2026, 8, 16);

  it('puts a completion from today in the last bucket', () => {
    const buckets = bucketByWeek(
      [matter({ status: 'done', completedAt: localDay(2026, 8, 16, 10).toISOString() })],
      now,
      4,
    );
    expect(buckets).toHaveLength(4);
    expect(buckets.at(-1)!.completed).toBe(1);
    expect(buckets.slice(0, 3).every((b) => b.completed === 0)).toBe(true);
  });

  it('makes every bucket exactly seven days, so the last is comparable', () => {
    const buckets = bucketByWeek([], now, 6);
    for (const bucket of buckets) {
      const span = bucket.end.getTime() - bucket.start.getTime();
      expect(Math.round(span / 86_400_000)).toBe(7);
    }
  });

  it('excludes a completion one second before the window opens', () => {
    const buckets = bucketByWeek([], now, 2);
    const justBefore = new Date(buckets[0].start.getTime() - 1000);
    const result = bucketByWeek(
      [matter({ status: 'done', completedAt: justBefore.toISOString() })],
      now,
      2,
    );
    expect(result.reduce((sum, b) => sum + b.completed, 0)).toBe(0);
  });
});

describe('buildGravity', () => {
  const now = localDay(2026, 8, 16);
  const instant = localDay(2026, 8, 16, 14);

  it('includes a matter overdue by hours, not just by whole days', () => {
    const points = buildGravity(
      [matter({ dueAt: localDay(2026, 8, 16, 9).toISOString() })],
      now,
      instant,
    );
    expect(points).toHaveLength(1);
  });

  it('includes an undated matter that has been pushed', () => {
    const points = buildGravity([matter({ rescheduleCount: 3 })], now, instant);
    expect(points).toHaveLength(1);
    expect(points[0].pushes).toBe(3);
  });

  it('excludes a future matter that has never been pushed', () => {
    const points = buildGravity(
      [matter({ dueAt: localDay(2026, 9, 1).toISOString() })],
      now,
      instant,
    );
    expect(points).toHaveLength(0);
  });

  it('excludes completed matters entirely', () => {
    const points = buildGravity(
      [matter({ status: 'done', dueAt: localDay(2026, 1, 1).toISOString(), rescheduleCount: 9 })],
      now,
      instant,
    );
    expect(points).toHaveLength(0);
  });
});

describe('projectInaction', () => {
  const now = localDay(2026, 8, 16, 12);

  it('starts from what is already overdue rather than from zero', () => {
    const days = projectInaction(
      [matter({ dueAt: localDay(2026, 8, 1).toISOString() })],
      now,
      5,
    );
    expect(days[0].cumulative).toBe(1);
  });

  it('accumulates and never decreases', () => {
    const days = projectInaction(
      [
        matter({ dueAt: localDay(2026, 8, 17, 9).toISOString() }),
        matter({ dueAt: localDay(2026, 8, 19, 9).toISOString() }),
      ],
      now,
      5,
    );
    for (let i = 1; i < days.length; i++) {
      expect(days[i].cumulative).toBeGreaterThanOrEqual(days[i - 1].cumulative);
    }
    expect(days.at(-1)!.cumulative).toBe(2);
  });

  it('ignores completed matters', () => {
    const days = projectInaction(
      [matter({ status: 'done', dueAt: localDay(2026, 8, 1).toISOString() })],
      now,
      3,
    );
    expect(days.at(-1)!.cumulative).toBe(0);
  });
});

describe('estimatedMinutes', () => {
  it('sums the midpoint of each estimate', () => {
    const total = estimatedMinutes([
      matter({ estimate: { minMinutes: 10, maxMinutes: 30, source: 'ai' } }),
      matter({ estimate: { minMinutes: 60, maxMinutes: 60, source: 'user' } }),
    ]);
    expect(total).toBe(20 + 60);
  });

  it('contributes nothing for a matter with no estimate', () => {
    expect(estimatedMinutes([matter()])).toBe(0);
  });

  it('excludes completed work, so clearing a day lightens it', () => {
    const done = matter({ status: 'done', estimate: { minMinutes: 60, maxMinutes: 60, source: 'ai' } });
    expect(estimatedMinutes([done])).toBe(0);
  });
});

describe('outcomeOf', () => {
  const now = localDay(2026, 8, 16, 12);

  it('ranks pushed above overdue, because avoidance is the louder story', () => {
    const subject = matter({ dueAt: localDay(2026, 8, 1).toISOString(), rescheduleCount: 4 });
    expect(outcomeOf(subject, now)).toBe('pushed');
  });

  it('reports done regardless of dates', () => {
    const subject = matter({ status: 'done', dueAt: localDay(2026, 1, 1).toISOString() });
    expect(outcomeOf(subject, now)).toBe('done');
  });
});

describe('buildPipeline', () => {
  const now = localDay(2026, 8, 16, 12);

  it('conserves matters: every column totals the same', () => {
    const matters = [
      matter({ sourceVoiceNoteId: 'v1', domain: 'car' }),
      matter({ sourceDocumentId: 'd1', domain: 'finance', status: 'done' }),
      matter({ externalSource: 'google_calendar', domain: 'family' }),
      matter({ domain: 'home', rescheduleCount: 2 }),
    ];
    const pipeline = buildPipeline(matters, now);

    const sum = (entries: readonly { count: number }[]) =>
      entries.reduce((total, entry) => total + entry.count, 0);

    expect(pipeline.total).toBe(4);
    expect(sum(pipeline.channels)).toBe(4);
    expect(sum(pipeline.domains)).toBe(4);
    expect(sum(pipeline.outcomes)).toBe(4);
    expect(sum(pipeline.arrivals)).toBe(4);
    expect(sum(pipeline.departures)).toBe(4);
  });
});
