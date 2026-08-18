import { describe, expect, it } from 'vitest';

import {
  averageCompleteMonthMinor,
  completedMonths,
  filedTotalMinor,
  hasAnyMoney,
  monthOverMonth,
  outstandingMinor,
  peakMonthMinor,
  type FinanceCurrencyBlock,
  type FinanceMonth,
} from './finance';

function block(overrides: Partial<FinanceCurrencyBlock> = {}): FinanceCurrencyBlock {
  return {
    currency: 'EGP',
    spentThisMonthMinor: 0,
    spentLastMonthMinor: 0,
    spentWindowMinor: 0,
    receivedWindowMinor: 0,
    overdueMinor: 0,
    overdueCount: 0,
    upcomingMinor: 0,
    upcomingCount: 0,
    byMonth: [],
    byDomain: [],
    largest: [],
    upcoming: [],
    ...overrides,
  };
}

function month(key: string, spentMinor: number, count = 1): FinanceMonth {
  return { month: key, spentMinor, count };
}

describe('monthOverMonth', () => {
  it('refuses to compare against a month with no spending', () => {
    // "Up 100% on last month" derived from zero is arithmetic, not information.
    expect(monthOverMonth(block({ spentThisMonthMinor: 5000 }))).toBeNull();
  });

  it('reports a rise and a fall with a positive percentage and a direction', () => {
    const up = monthOverMonth(block({ spentThisMonthMinor: 15_000, spentLastMonthMinor: 10_000 }));
    expect(up).toEqual({ percent: 50, direction: 'up', previousMinor: 10_000 });

    const down = monthOverMonth(block({ spentThisMonthMinor: 8_000, spentLastMonthMinor: 10_000 }));
    expect(down).toEqual({ percent: 20, direction: 'down', previousMinor: 10_000 });
  });

  it('says nothing when the change rounds away', () => {
    // "Up 0%" is a comparison that reads as informative and is not.
    expect(
      monthOverMonth(block({ spentThisMonthMinor: 10_020, spentLastMonthMinor: 10_000 })),
    ).toBeNull();
  });
});

describe('the running month', () => {
  const subject = block({
    byMonth: [month('2026-06', 30_000), month('2026-07', 10_000), month('2026-08', 2_000)],
  });

  it('is excluded from the completed set', () => {
    expect(completedMonths(subject).map((entry) => entry.month)).toEqual(['2026-06', '2026-07']);
  });

  it('is excluded from the average, so a part-month cannot drag the line down', () => {
    expect(averageCompleteMonthMinor(subject)).toBe(20_000);
  });

  it('still counts toward the peak the chart scales against', () => {
    expect(peakMonthMinor(subject)).toBe(30_000);
  });

  it('leaves the average at zero when no month has finished yet', () => {
    expect(averageCompleteMonthMinor(block({ byMonth: [month('2026-08', 2_000)] }))).toBe(0);
  });
});

describe('filedTotalMinor', () => {
  it('sums only what carries an area, so a ring never claims the window total', () => {
    const subject = block({
      spentWindowMinor: 50_000,
      byDomain: [
        { domain: 'car', spentMinor: 30_000, count: 2 },
        { domain: 'home', spentMinor: 12_000, count: 3 },
      ],
    });
    expect(filedTotalMinor(subject)).toBe(42_000);
    expect(filedTotalMinor(subject)).toBeLessThan(subject.spentWindowMinor);
  });
});

describe('outstandingMinor', () => {
  it('adds what is late to what is merely due', () => {
    expect(outstandingMinor(block({ overdueMinor: 4_000, upcomingMinor: 6_000 }))).toBe(10_000);
  });
});

describe('hasAnyMoney', () => {
  it('separates "no summary yet" from "a summary with nothing in it"', () => {
    expect(hasAnyMoney(undefined)).toBe(false);
    expect(
      hasAnyMoney({
        months: 6,
        timezone: 'Africa/Cairo',
        generatedAt: '2026-08-18T00:00:00Z',
        currencies: [],
        // Forty scans, no readable figure in any of them — a real state, and a
        // different sentence on screen from "you have no documents".
        coverage: { documentsTotal: 40, documentsWithAmount: 0, mattersWithAmount: 0 },
      }),
    ).toBe(false);
    expect(
      hasAnyMoney({
        months: 6,
        timezone: 'Africa/Cairo',
        generatedAt: '2026-08-18T00:00:00Z',
        currencies: [block()],
        coverage: { documentsTotal: 1, documentsWithAmount: 1, mattersWithAmount: 0 },
      }),
    ).toBe(true);
  });
});
