import type { MatterDomain } from '../matters/matter';

/**
 * Money, as the product understands it.
 *
 * Everything here is a figure the system READ — off a scanned bill, or off a
 * matter someone typed an amount onto. Nothing is inferred, nothing is
 * predicted, and nothing is converted between currencies. That last rule is why
 * this file has a `FinanceCurrencyBlock` rather than a single total: there is no
 * exchange-rate source in this product, so one number spanning EGP and USD could
 * only be invented, and an invented number at the top of a money page poisons
 * every true number under it.
 *
 * Amounts are whole MINOR units — piastres, cents, fils — exactly as stored, and
 * they are never divided here. How many minor units make a major one depends on
 * the currency (JPY has none, KWD has three), so that division belongs with the
 * formatter that already holds Intl's ISO 4217 table, not scattered through
 * arithmetic that would quietly assume 100.
 *
 * Imports nothing but a sibling domain type, per the layer rule.
 */

/**
 * Where a figure came from. `ai` earns a provenance mark on screen — and the
 * trust lens — because nobody confirmed it; `user` does not, because a person
 * typed it themselves.
 */
export type MoneySource = 'ai' | 'user';

/** Which surface an entry belongs to: a matter, or the document it was read off. */
export type FinanceEntryKind = 'matter' | 'document';

export interface FinanceMonth {
  /**
   * `YYYY-MM`, already bucketed server-side in the account's timezone.
   *
   * A LABEL, not a timestamp. Re-parsing it into a local Date and re-deriving
   * the month is how a client ends up disagreeing with the server about which
   * days belong to August — the whole reason the API echoes its timezone back.
   */
  readonly month: string;
  readonly spentMinor: number;
  /** How many payments made up the figure. */
  readonly count: number;
}

export interface FinanceDomainSpend {
  readonly domain: MatterDomain;
  readonly spentMinor: number;
  readonly count: number;
}

export interface FinanceEntry {
  readonly id: string;
  readonly kind: FinanceEntryKind;
  readonly title: string;
  /** Absent on a document that was never filed under an area. */
  readonly domain?: MatterDomain;
  readonly amountMinor: number;
  readonly source: MoneySource;
  /** When it happened, or falls due. Absent on an undated obligation. */
  readonly at?: string;
  readonly overdue: boolean;
}

/**
 * One currency's whole picture. A user with EGP and USD documents gets two of
 * these and no total across them — see the note at the top of this file.
 */
export interface FinanceCurrencyBlock {
  /** ISO 4217. */
  readonly currency: string;
  readonly spentThisMonthMinor: number;
  readonly spentLastMonthMinor: number;
  readonly spentWindowMinor: number;
  /** Refunds and rebates. Reported alongside spending, never subtracted from it. */
  readonly receivedWindowMinor: number;
  readonly overdueMinor: number;
  readonly overdueCount: number;
  readonly upcomingMinor: number;
  readonly upcomingCount: number;
  /**
   * Oldest first, dense — every month in the window, zeroes included. The LAST
   * entry is the month we are standing in and is therefore still running.
   */
  readonly byMonth: readonly FinanceMonth[];
  /** Only spending filed under an area, largest first. */
  readonly byDomain: readonly FinanceDomainSpend[];
  readonly largest: readonly FinanceEntry[];
  readonly upcoming: readonly FinanceEntry[];
}

/**
 * What the summary could NOT see.
 *
 * The most important object here. Every total is built from documents a vision
 * pass happened to find a figure on; rendering them without this states "your
 * spending" about money the system never saw. Surfaces are required to say it in
 * words, not hide it behind a tooltip.
 */
export interface FinanceCoverage {
  readonly documentsTotal: number;
  readonly documentsWithAmount: number;
  readonly mattersWithAmount: number;
}

export interface FinanceSummary {
  /** Months of history this covers, echoed by the server rather than assumed. */
  readonly months: number;
  /** The IANA zone the months were bucketed in. Echoed so this side never re-buckets. */
  readonly timezone: string;
  readonly generatedAt: string;
  /** Busiest currency first, so the default block is the one the user lives in. */
  readonly currencies: readonly FinanceCurrencyBlock[];
  readonly coverage: FinanceCoverage;
}

/** The history lengths the window control offers. */
export const FINANCE_WINDOWS = [3, 6, 12] as const;
export type FinanceWindow = (typeof FINANCE_WINDOWS)[number];

export const DEFAULT_FINANCE_WINDOW: FinanceWindow = 6;

/**
 * Whether there is anything to draw at all.
 *
 * Not the same question as "are there documents": an account can hold forty
 * scans and still have no readable figure in any of them, and those two states
 * want different words on screen.
 */
export function hasAnyMoney(summary: FinanceSummary | undefined): boolean {
  return (summary?.currencies.length ?? 0) > 0;
}

export interface MonthDelta {
  /** Always positive; `direction` carries the sign. */
  readonly percent: number;
  readonly direction: 'up' | 'down';
  readonly previousMinor: number;
}

/**
 * This month against last, or `null` when there is nothing honest to compare.
 *
 * A month with no recorded spending is not a baseline. "Up 100% on last month"
 * derived from zero is arithmetic rather than information, and it is exactly the
 * shape of claim that makes someone stop believing the rest of the page.
 */
export function monthOverMonth(block: FinanceCurrencyBlock): MonthDelta | null {
  const previous = block.spentLastMonthMinor;
  if (previous <= 0) return null;

  const change = ((block.spentThisMonthMinor - previous) / previous) * 100;
  const percent = Math.round(Math.abs(change));
  // A rounded zero is "about the same", which the sentence below would render
  // as "up 0%" — a comparison that says nothing while looking like it does.
  if (percent === 0) return null;

  return { percent, direction: change >= 0 ? 'up' : 'down', previousMinor: previous };
}

/**
 * The months that have actually finished.
 *
 * The last bucket is the month we are standing in, so it is a part-month by
 * definition. Averaging it in with complete months drags the mean down every
 * time, and then comparing today's running total against that mean reports a
 * fall that is nothing but the calendar.
 */
export function completedMonths(block: FinanceCurrencyBlock): readonly FinanceMonth[] {
  return block.byMonth.slice(0, -1);
}

/** Mean spend across the COMPLETE months only. Zero when none have finished. */
export function averageCompleteMonthMinor(block: FinanceCurrencyBlock): number {
  const months = completedMonths(block);
  if (months.length === 0) return 0;
  return months.reduce((sum, month) => sum + month.spentMinor, 0) / months.length;
}

/** The tallest month in the window — what the trend chart scales against. */
export function peakMonthMinor(block: FinanceCurrencyBlock): number {
  return block.byMonth.reduce((max, month) => Math.max(max, month.spentMinor), 0);
}

/**
 * Spending that carries an area, summed.
 *
 * Deliberately NOT `spentWindowMinor`. A scanned receipt nobody filed under a
 * domain is real money and is inside the window total, but it has no segment on
 * a domain chart — so the chart's own centre has to state the total it actually
 * drew, or its segments visibly fail to add up to the headline beside them.
 */
export function filedTotalMinor(block: FinanceCurrencyBlock): number {
  return block.byDomain.reduce((sum, row) => sum + row.spentMinor, 0);
}

/** Everything owed, late or not — the half of the picture still actionable. */
export function outstandingMinor(block: FinanceCurrencyBlock): number {
  return block.overdueMinor + block.upcomingMinor;
}
