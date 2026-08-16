import { Injectable, computed, signal } from '@angular/core';

import type { MatterDomain } from '@domain/matters/matter';

export interface DateRange {
  /** ISO instant, inclusive. */
  readonly after: string;
  /** ISO instant, exclusive. */
  readonly before: string;
  /** What to call this range in the filter chip. */
  readonly label: string;
}

/**
 * Cross-filter state, shared by every surface on the dashboard.
 *
 * This is what makes clicking a domain slice on Insights filter the chart
 * beside it, the calendar behind it and the table on the next route — rather
 * than each screen owning a private filter that silently disagrees with its
 * neighbour.
 *
 * Root-scoped on purpose, unlike MattersStore and InsightsStore which are
 * provided per page. A cross-filter that reset when you navigated would not be
 * a cross-filter; the whole value is that it survives the trip from Insights to
 * Matters, so "why is Finance so busy" and "show me those" are the same
 * gesture.
 *
 * Deliberately narrow: one domain and one date range. A general filter bus that
 * accepted anything would drift into being a second, competing query model
 * beside MatterQuery — this holds only the two dimensions every screen shares.
 */
@Injectable({ providedIn: 'root' })
export class DashboardFilterStore {
  private readonly domainSignal = signal<MatterDomain | null>(null);
  private readonly rangeSignal = signal<DateRange | null>(null);

  readonly domain = this.domainSignal.asReadonly();
  readonly range = this.rangeSignal.asReadonly();

  readonly isActive = computed(() => this.domainSignal() !== null || this.rangeSignal() !== null);

  /** Click the same domain twice to clear it — the chart doubles as the toggle. */
  toggleDomain(domain: MatterDomain): void {
    this.domainSignal.update((current) => (current === domain ? null : domain));
  }

  setDomain(domain: MatterDomain | null): void {
    this.domainSignal.set(domain);
  }

  setRange(range: DateRange | null): void {
    this.rangeSignal.set(range);
  }

  clear(): void {
    this.domainSignal.set(null);
    this.rangeSignal.set(null);
  }
}
