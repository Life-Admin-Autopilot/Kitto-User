import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FinanceStore } from '@application/finance/finance.store';
import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import { FINANCE_WINDOWS, type FinanceWindow } from '@domain/finance/finance';
import { MoneyEntries } from './money-entries';
import { SpendArc } from './spend-arc';
import { SpendTrend } from './spend-trend';

/**
 * Money on the dashboard — what left, what is still owed, and what the system
 * could not see.
 *
 * The third statement is the one that makes the first two safe to print. Every
 * figure here was read off a scanned document or typed onto a matter, which
 * means the panel describes what Kitto happened to see, not what the user spent.
 * The coverage sentence at the bottom says so in plain body copy rather than
 * behind an icon: a caveat nobody opens is a caveat nobody was given.
 *
 * It owns its store. The summary is one request that every block below is a
 * `computed` over, and holding it past the visit would leave a stale figure on
 * screen at exactly the moment a scan lands and changes it.
 *
 * Deliberately NOT cross-filtered. The summary is aggregated server-side over
 * the whole account, and there is no honest way to narrow it to a brushed week
 * from here — so when the page filter is on, the panel says it does not apply
 * rather than quietly answering a different question from its neighbours.
 */
@Component({
  selector: 'app-money-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FinanceStore],
  imports: [MoneyEntries, SpendArc, SpendTrend],
  template: `
    <section class="rounded-2xl bg-surface p-5 shadow-card">
      <header class="mb-4 flex flex-wrap items-start gap-3">
        <div class="min-w-0">
          <h2 class="text-heading-sm text-ink">Money</h2>
          <p class="text-caption text-ink-muted">
            Read off your bills, receipts and priced matters. Nothing here is estimated.
          </p>
        </div>

        <div class="ms-auto flex flex-wrap items-center gap-2">
          <!--
            The selected pill is accent-soft, not surface. On the dark card,
            surface-sunken and surface differ by 4/255 — a track filled with
            either has no visible edge, and the selected option becomes the same
            colour as the card behind it. The hairline border and the accent fill
            both exist to survive that theme.
          -->
          <div
            class="flex rounded-pill border border-hairline bg-surface-sunken p-0.5"
            role="group"
            aria-label="History length"
          >
            @for (months of windows; track months) {
              <button
                type="button"
                (click)="store.setWindow(months)"
                [attr.aria-pressed]="store.window() === months"
                class="rounded-pill px-2.5 py-1 text-micro transition-colors"
                [class.bg-accent-soft]="store.window() === months"
                [class.text-accent]="store.window() === months"
                [class.font-semibold]="store.window() === months"
                [class.text-ink-muted]="store.window() !== months"
              >
                {{ months }}M
              </button>
            }
          </div>

          <!-- Only when there is a choice to make. A one-option control is
               chrome that teaches the reader nothing. -->
          @if (store.currencies().length > 1) {
            <div
              class="flex rounded-pill border border-hairline bg-surface-sunken p-0.5"
              role="group"
              aria-label="Currency"
            >
              @for (block of store.currencies(); track block.currency) {
                <button
                  type="button"
                  (click)="store.selectCurrency(block.currency)"
                  [attr.aria-pressed]="store.currency() === block.currency"
                  class="rounded-pill px-2.5 py-1 text-micro transition-colors"
                  [class.bg-accent-soft]="store.currency() === block.currency"
                  [class.text-accent]="store.currency() === block.currency"
                  [class.font-semibold]="store.currency() === block.currency"
                  [class.text-ink-muted]="store.currency() !== block.currency"
                >
                  {{ block.currency }}
                </button>
              }
            </div>
          }
        </div>
      </header>

      @if (store.error()) {
        <div class="rounded-xl bg-danger-soft px-4 py-3 text-body-sm text-danger">
          <p>Could not load your money summary.</p>
          <button type="button" (click)="store.reload()" class="mt-1 underline">Retry</button>
        </div>
      } @else if (store.isLoading()) {
        <!-- Shaped like the real thing — hero, chart, ring, lists — rather than a
             spinner, so the layout does not jump when the figures arrive. -->
        <div class="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Loading">
          <div class="grid grid-cols-3 gap-4">
            <span class="h-44 rounded-xl bg-surface-sunken"></span>
            <span class="col-span-2 h-44 rounded-xl bg-surface-sunken"></span>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <span class="col-span-2 h-48 rounded-xl bg-surface-sunken"></span>
            <span class="h-48 rounded-xl bg-surface-sunken"></span>
          </div>
        </div>
      } @else if (!store.hasMoney()) {
        <div class="rounded-xl border border-hairline bg-surface-sunken px-4 py-8 text-center">
          <p class="font-display text-heading-md text-ink">No amounts yet</p>
          <p class="mt-1 text-body-sm text-ink-muted">
            Scan a bill, an invoice or a receipt in the Kitto app, or type an amount onto a matter,
            and it appears here.
          </p>
          @if (store.coverage(); as coverage) {
            @if (coverage.documentsTotal > 0) {
              <p class="mt-2 text-caption text-ink-subtle">
                No amount was found in any of your {{ coverage.documentsTotal }} documents.
              </p>
            }
          }
        </div>
      } @else {
        <div class="flex flex-col gap-4">
          <div class="grid grid-cols-3 gap-4">
            <!-- ---- The headline ---- -->
            <div
              class="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-sunken p-4"
            >
              <div class="flex flex-col gap-1">
                <span class="text-micro uppercase tracking-[0.08em] text-ink-muted"
                  >Spent this month</span
                >
                <span class="tabular font-display text-display-md leading-none text-ink">{{
                  store.moneyRounded(store.spentThisMonthMinor())
                }}</span>
                @if (store.delta(); as delta) {
                  <span class="text-caption text-ink-muted">
                    {{ delta.direction === 'up' ? 'Up' : 'Down' }} {{ delta.percent }}% on last
                    month ({{ store.money(delta.previousMinor) }}).
                  </span>
                } @else {
                  <span class="text-caption text-ink-muted">
                    No comparable spending last month.
                  </span>
                }
              </div>

              <!--
                Two obligations, and only the late one is loud. Coral is reserved
                for what is actually overdue; a strip where every figure shouts
                tells the reader nothing about which to open first.
              -->
              <div class="mt-auto flex flex-col gap-2">
                <div
                  class="flex items-baseline justify-between gap-2 rounded-lg px-3 py-2"
                  [class.bg-accent-soft]="store.overdueMinor() > 0"
                  [class.bg-surface-field]="store.overdueMinor() === 0"
                >
                  <span class="flex flex-col">
                    <span
                      class="tabular font-display text-heading-sm leading-tight"
                      [class.text-accent]="store.overdueMinor() > 0"
                      [class.text-ink]="store.overdueMinor() === 0"
                      >{{ store.moneyRounded(store.overdueMinor()) }}</span
                    >
                    <span class="text-micro uppercase tracking-[0.08em] text-ink-muted"
                      >Overdue</span
                    >
                  </span>
                  <span class="tabular text-caption text-ink-muted">{{
                    items(store.overdueCount())
                  }}</span>
                </div>

                <div
                  class="flex items-baseline justify-between gap-2 rounded-lg bg-surface-field px-3 py-2"
                >
                  <span class="flex flex-col">
                    <span class="tabular font-display text-heading-sm leading-tight text-ink">{{
                      store.moneyRounded(store.upcomingMinor())
                    }}</span>
                    <span class="text-micro uppercase tracking-[0.08em] text-ink-muted"
                      >Still to pay</span
                    >
                  </span>
                  <span class="tabular text-caption text-ink-muted">{{
                    items(store.upcomingCount())
                  }}</span>
                </div>
              </div>
            </div>

            <!-- ---- The trend ---- -->
            <div
              class="col-span-2 flex flex-col rounded-xl border border-hairline bg-surface-sunken p-4"
            >
              <h3 class="mb-1 text-body-sm font-semibold text-ink">Where it went</h3>
              <app-spend-trend />
              @if (store.receivedWindowMinor() > 0) {
                <!-- Refunds are reported, never netted off the bars above:
                     subtracting them would make the headline disagree with the
                     rows the reader can see. -->
                <p class="mt-2 text-caption text-ink-muted">
                  {{ store.money(store.receivedWindowMinor()) }} came back over the same period —
                  refunds and rebates, not deducted above.
                </p>
              }
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <!-- ---- By area ---- -->
            <div class="col-span-2 rounded-xl border border-hairline bg-surface-sunken p-4">
              <h3 class="mb-1 text-body-sm font-semibold text-ink">By area</h3>
              <p class="mb-3 text-caption text-ink-muted">
                Spending over {{ store.window() }} months. Click an area to filter the rest of the
                dashboard.
              </p>
              <app-spend-arc />
            </div>

            <!-- ---- Obligations ---- -->
            <div class="rounded-xl border border-hairline bg-surface-sunken p-4">
              <h3 class="mb-1 text-body-sm font-semibold text-ink">Still to pay</h3>
              <p class="mb-3 text-caption text-ink-muted">Overdue first, then soonest.</p>
              <app-money-entries [entries]="store.upcoming()" emptyLabel="Nothing is due." />
            </div>
          </div>

          <!-- ---- The five biggest ---- -->
          <div class="rounded-xl border border-hairline bg-surface-sunken p-4">
            <h3 class="mb-1 text-body-sm font-semibold text-ink">Largest</h3>
            <p class="mb-3 text-caption text-ink-muted">
              The biggest single payments in the window.
            </p>
            <app-money-entries
              [entries]="store.largest()"
              layout="cards"
              emptyLabel="No spending recorded in this period."
            />
          </div>

          <!-- ---- What this could not see ---- -->
          <div class="flex flex-col gap-1">
            @if (coverageSentence(); as sentence) {
              <p class="text-caption text-ink-muted">{{ sentence }}</p>
            }
            @if (store.coverage(); as coverage) {
              @if (coverage.mattersWithAmount > 0) {
                <p class="text-caption text-ink-muted">
                  {{
                    coverage.mattersWithAmount === 1
                      ? '1 matter carries'
                      : coverage.mattersWithAmount + ' matters carry'
                  }}
                  an amount.
                </p>
              }
            }
            @if (store.currencies().length > 1) {
              <p class="text-caption text-ink-muted">
                Currencies are reported separately. No exchange rate is applied.
              </p>
            }
            @if (filter.isActive()) {
              <p class="text-caption text-ink-muted">
                These figures cover your whole account — the page filter above does not narrow them.
              </p>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class MoneyPanel {
  protected readonly store = inject(FinanceStore);
  protected readonly filter = inject(DashboardFilterStore);

  protected readonly windows: readonly FinanceWindow[] = FINANCE_WINDOWS;

  protected items(count: number): string {
    return count === 1 ? '1 item' : `${count} items`;
  }

  /**
   * How much of the document pile these totals actually saw.
   *
   * Silent when there are no documents at all: the sentence exists to state a
   * proportion, and with an empty pile every phrasing of it — "no amount was
   * found in any of your 0 documents" — reads as a fault report about nothing.
   */
  protected readonly coverageSentence = computed(() => {
    const coverage = this.store.coverage();
    if (!coverage || coverage.documentsTotal === 0) return null;

    return coverage.documentsWithAmount === 0
      ? `No amount was found in any of your ${coverage.documentsTotal} documents.`
      : `Read from ${coverage.documentsWithAmount} of ${coverage.documentsTotal} documents. Anything paid outside Kitto is not counted.`;
  });
}
