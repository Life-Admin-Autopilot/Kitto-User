import { Injectable, computed, inject, resource, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import {
  DEFAULT_FINANCE_WINDOW,
  averageCompleteMonthMinor,
  filedTotalMinor,
  hasAnyMoney,
  monthOverMonth,
  outstandingMinor,
  peakMonthMinor,
  type FinanceCurrencyBlock,
  type FinanceEntry,
  type FinanceWindow,
} from '@domain/finance/finance';
import { FinanceRepository } from '@domain/finance/finance.repository';
import type { MatterDomain } from '@domain/matters/matter';
import { formatMoney, formatMoneyCompact, formatMoneyRounded } from './money-format';

/** One bar on the trend chart, sized and labelled. */
export interface MonthColumn {
  /** `YYYY-MM` — the server's own key, kept as the track-by identity. */
  readonly key: string;
  /** Short month name in the ACCOUNT's language. */
  readonly label: string;
  readonly spentMinor: number;
  readonly count: number;
  /** Percentage of the tallest month, floored so a non-zero month is visible. */
  readonly height: number;
  /** The tallest month in the window. */
  readonly peak: boolean;
  /** The month we are standing in — a part-month, and drawn as one. */
  readonly running: boolean;
}

/** One arc segment, and its legend row. */
export interface DomainSlice {
  readonly domain: MatterDomain;
  readonly spentMinor: number;
  readonly count: number;
  /** Share of the FILED total — what the arc actually draws. */
  readonly share: number;
}

/**
 * Money, as application state.
 *
 * One request feeds every panel. The window control changes its parameter and
 * the resource refetches; everything else on screen is a `computed` over the
 * answer already in memory, so switching currency or hovering a bar costs
 * nothing and no two panels can disagree about a figure.
 *
 * Provided by the money panel rather than root-scoped: it is the only consumer,
 * and a summary held past the visit is a stale figure waiting to be believed.
 */
@Injectable()
export class FinanceStore {
  private readonly repository = inject(FinanceRepository);
  private readonly session = inject(SessionStore);

  private readonly windowSignal = signal<FinanceWindow>(DEFAULT_FINANCE_WINDOW);
  readonly window = this.windowSignal.asReadonly();

  setWindow(months: FinanceWindow): void {
    this.windowSignal.set(months);
  }

  private readonly summaryResource = resource({
    params: () => ({ months: this.windowSignal() }),
    loader: ({ params, abortSignal }) => this.repository.summary(params.months, abortSignal),
  });

  readonly isLoading = computed(() => this.summaryResource.isLoading());
  readonly error = computed(() => this.summaryResource.error());

  /**
   * Every read goes through this guard.
   *
   * `resource.value()` RETHROWS while the resource is in an error state, so an
   * unguarded read inside a template expression takes the page down instead of
   * rendering the error branch written for exactly that case. Same rule the
   * InsightsStore follows, and for the same reason.
   */
  private readonly summary = computed(() =>
    this.summaryResource.error() ? undefined : this.summaryResource.value(),
  );

  reload(): void {
    this.summaryResource.reload();
  }

  /** The Intl tag every figure is formatted with — the ACCOUNT's, not the browser's. */
  readonly intlTag = computed(() => this.session.account()?.locale ?? 'en-GB');

  readonly hasMoney = computed(() => hasAnyMoney(this.summary()));
  readonly coverage = computed(() => this.summary()?.coverage);
  readonly currencies = computed(() => this.summary()?.currencies ?? []);

  /**
   * Held by CODE rather than by index.
   *
   * A refetch can reorder the list — it arrives busiest-first, and busiest
   * changes — so an index would silently switch which currency is on screen
   * while the label above it stayed put.
   */
  private readonly selected = signal<string | null>(null);

  selectCurrency(code: string): void {
    this.selected.set(code);
  }

  /** The block on screen: the chosen currency, or the busiest one. */
  readonly block = computed<FinanceCurrencyBlock | undefined>(() => {
    const list = this.currencies();
    const code = this.selected();
    return list.find((entry) => entry.currency === code) ?? list[0];
  });

  readonly currency = computed(() => this.block()?.currency ?? '');

  // ---- Headline ------------------------------------------------------------

  readonly spentThisMonthMinor = computed(() => this.block()?.spentThisMonthMinor ?? 0);
  readonly overdueMinor = computed(() => this.block()?.overdueMinor ?? 0);
  readonly overdueCount = computed(() => this.block()?.overdueCount ?? 0);
  readonly upcomingMinor = computed(() => this.block()?.upcomingMinor ?? 0);
  readonly upcomingCount = computed(() => this.block()?.upcomingCount ?? 0);
  readonly receivedWindowMinor = computed(() => this.block()?.receivedWindowMinor ?? 0);
  readonly spentWindowMinor = computed(() => this.block()?.spentWindowMinor ?? 0);

  readonly delta = computed(() => {
    const block = this.block();
    return block ? monthOverMonth(block) : null;
  });

  readonly outstandingMinor = computed(() => {
    const block = this.block();
    return block ? outstandingMinor(block) : 0;
  });

  // ---- The trend -----------------------------------------------------------

  private readonly monthFormatter = computed(
    // The keys are `YYYY-MM` bucketed server-side in the account's zone. Day 1
    // at noon UTC is far enough from either boundary that no zone can shift it
    // into a neighbouring month on the way to a label — and pinning the format
    // to UTC keeps the browser's own zone out of it entirely.
    () => new Intl.DateTimeFormat(this.intlTag(), { month: 'short', timeZone: 'UTC' }),
  );

  readonly averageMonthMinor = computed(() => {
    const block = this.block();
    return block ? averageCompleteMonthMinor(block) : 0;
  });

  readonly months = computed<readonly MonthColumn[]>(() => {
    const block = this.block();
    if (!block) return [];

    const peak = peakMonthMinor(block);
    const last = block.byMonth.length - 1;

    return block.byMonth.map((month, index) => ({
      key: month.month,
      label: this.labelFor(month.month),
      spentMinor: month.spentMinor,
      count: month.count,
      // A floor of 2% on any non-zero month. A bar rounded to invisibility
      // reads as "nothing happened", which is a different claim from "a quiet
      // month" — and on a spending chart those two are not close.
      height:
        peak === 0 || month.spentMinor === 0 ? 0 : Math.max(2, (month.spentMinor / peak) * 100),
      peak: peak > 0 && month.spentMinor === peak,
      running: index === last,
    }));
  });

  /** Where the average line sits, as a percentage of the tallest bar. */
  readonly averageHeight = computed(() => {
    const block = this.block();
    if (!block) return 0;
    const peak = peakMonthMinor(block);
    return peak === 0 ? 0 : Math.min(100, (this.averageMonthMinor() / peak) * 100);
  });

  private labelFor(key: string): string {
    const [year, month] = key.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return key;
    return this.monthFormatter().format(new Date(Date.UTC(year, month - 1, 1, 12)));
  }

  // ---- The domain arc ------------------------------------------------------

  /** The total the arc actually draws — see `filedTotalMinor` for why not the window total. */
  readonly filedMinor = computed(() => {
    const block = this.block();
    return block ? filedTotalMinor(block) : 0;
  });

  readonly slices = computed<readonly DomainSlice[]>(() => {
    const block = this.block();
    const total = this.filedMinor();
    if (!block || total === 0) return [];

    return block.byDomain.map((row) => ({
      domain: row.domain,
      spentMinor: row.spentMinor,
      count: row.count,
      share: row.spentMinor / total,
    }));
  });

  /**
   * Window spending that no area claims — a scanned receipt never filed under
   * one. Floored at zero: the two totals come from the same set, so this cannot
   * go negative, and a negative would be a nonsense sentence on screen if it did.
   */
  readonly unfiledMinor = computed(() => Math.max(0, this.spentWindowMinor() - this.filedMinor()));

  readonly hasUnfiledSpend = computed(() => this.unfiledMinor() > 0);

  // ---- The lists -----------------------------------------------------------

  readonly largest = computed<readonly FinanceEntry[]>(() => this.block()?.largest ?? []);
  readonly upcoming = computed<readonly FinanceEntry[]>(() => this.block()?.upcoming ?? []);

  // ---- Formatting ----------------------------------------------------------
  //
  // Exposed from the store because it is the only place that holds both the
  // active currency and the account's language. A component formatting on its
  // own would need both passed in, and the first one to be given only the tag
  // would render the wrong currency without failing.

  money(minor: number): string {
    return formatMoney(minor, this.currency(), this.intlTag());
  }

  moneyRounded(minor: number): string {
    return formatMoneyRounded(minor, this.currency(), this.intlTag());
  }

  moneyCompact(minor: number): string {
    return formatMoneyCompact(minor, this.currency(), this.intlTag());
  }
}
