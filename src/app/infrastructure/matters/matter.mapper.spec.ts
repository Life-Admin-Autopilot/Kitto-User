import { describe, expect, it } from 'vitest';

import { toMatter, type TaskDto } from './matter.mapper';

/**
 * The mapper is the only place the wire's `task` becomes the domain's `matter`,
 * which makes it the only place a field can go missing without anything failing.
 *
 * That is not hypothetical. The server's own locale overlay rebuilt a task from
 * a hand-written property list and quietly dropped `amount`, so a priced matter
 * came back from `GET /me/tasks` with none — no error, no wrong value, one
 * absent field. A mapper that forgets a field looks exactly the same from here,
 * so the fields worth having are worth pinning.
 */
function dto(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 't1',
    title: 'Pay the internet bill',
    domain: 'finance',
    kind: 'reminder',
    status: 'open',
    priority: 'normal',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toMatter', () => {
  it('carries the amount through', () => {
    const matter = toMatter(
      dto({ amount: { amountMinor: 73_000, currency: 'EGP', source: 'user', direction: 'out' } }),
    );

    expect(matter.amount).toEqual({
      amountMinor: 73_000,
      currency: 'EGP',
      source: 'user',
      direction: 'out',
    });
  });

  it('leaves the amount undefined when the matter has none', () => {
    // The common case by a wide margin, and the reason every surface has to
    // render without it rather than defaulting to a zero. A matter that cost
    // nothing and a matter nobody priced are different facts.
    expect(toMatter(dto()).amount).toBeUndefined();
  });

  it('keeps minor units unscaled', () => {
    // The exponent belongs to the currency and the division belongs to the
    // formatter. A mapper that divided here would be a second, disagreeing
    // opinion about what 73000 EGP means.
    const matter = toMatter(
      dto({ amount: { amountMinor: 73_000, currency: 'EGP', source: 'ai', direction: 'out' } }),
    );

    expect(matter.amount?.amountMinor).toBe(73_000);
  });

  it('preserves direction, so a refund cannot read as a payment', () => {
    const matter = toMatter(
      dto({ amount: { amountMinor: 5_000, currency: 'EGP', source: 'user', direction: 'in' } }),
    );

    expect(matter.amount?.direction).toBe('in');
  });
});
