import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { FinanceStore, type MonthColumn } from '@application/finance/finance.store';

/**
 * Where the money went, month by month.
 *
 * Three things this chart does that a bar chart usually does not, each because
 * a money chart that gets them wrong tells a confident lie:
 *
 * 1. The CURRENT month is drawn as unfinished — hatched, and labelled "so far".
 *    It is a part-month sitting next to complete ones, and drawn solid it reads
 *    as a collapse in spending that is really just the calendar.
 * 2. The average line is the mean of the COMPLETE months only, for the same
 *    reason. Including the running month drags the line down every time.
 * 3. Empty months are drawn as empty, never skipped. A trend that omits its
 *    zeroes puts two non-adjacent months side by side and reads as continuity
 *    that did not happen.
 *
 * CSS bars rather than SVG: they inherit the theme tokens directly, mirror
 * correctly in Arabic without any axis arithmetic, and the readout above the
 * chart carries the exact figure so nothing has to be labelled in-place.
 */
@Component({
  selector: 'app-spend-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(pointerleave)': 'hovered.set(null)' },
  template: `
    <!--
      A fixed readout row above the chart, not a floating tooltip. A tooltip
      that follows the pointer covers the very bars it is describing, and at
      twelve columns it spends most of its life obscuring the neighbour you were
      trying to compare against. The height is reserved so nothing below moves
      as the pointer travels.
    -->
    <div class="mb-3 flex min-h-12 flex-col justify-center">
      @if (active(); as month) {
        <p class="flex flex-wrap items-baseline gap-x-2.5">
          <span class="tabular font-display text-heading-xl text-ink">{{
            store.money(month.spentMinor)
          }}</span>
          <span class="text-caption text-ink-muted">{{ month.label }}</span>
          <span class="text-caption text-ink-muted">{{ payments(month.count) }}</span>
          @if (month.running) {
            <span class="rounded-pill bg-accent-soft px-2 py-0.5 text-micro text-accent"
              >so far</span
            >
          }
        </p>
      } @else {
        <p class="flex flex-wrap items-baseline gap-x-2.5">
          <span class="tabular font-display text-heading-xl text-ink">{{
            store.moneyRounded(store.spentWindowMinor())
          }}</span>
          <span class="text-caption text-ink-muted"
            >over {{ store.window() }} months · hover a month for its total</span
          >
        </p>
      }
    </div>

    <div class="relative">
      <!-- The plot. aria-hidden because the table below carries the same figures
           in a form a screen reader can actually walk. -->
      <div class="relative h-40" aria-hidden="true">
        <span class="absolute inset-x-0 bottom-0 h-px bg-hairline"></span>

        @if (store.averageHeight() > 0) {
          <div
            class="pointer-events-none absolute inset-x-0 z-10 flex items-center"
            [style.bottom.%]="store.averageHeight()"
          >
            <span class="h-0 flex-1 border-t border-dashed border-ink-subtle"></span>
            <!-- bg-surface, so the chip masks whatever bar it lands on rather
                 than printing grey text over coral. -->
            <span class="ms-1.5 rounded-pill bg-surface px-1.5 py-0.5 text-micro text-ink-muted">
              avg {{ store.moneyCompact(store.averageMonthMinor()) }}
            </span>
          </div>
        }

        <div class="flex h-full items-stretch gap-2">
          @for (month of store.months(); track month.key) {
            <div class="relative flex-1" (pointerenter)="hovered.set(month.key)">
              <span
                class="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-lg transition-[height,opacity] duration-200"
                [style.height.%]="month.height"
                [style.opacity]="dimmed(month) ? 0.55 : 1"
                [style.background]="fill"
              >
                <!-- The unfinished month wears its own hatching rather than a
                     different colour: colour on this chart already means
                     "spending", and a second hue would read as a category. -->
                @if (month.running) {
                  <span class="absolute inset-0" [style.background]="hatch"></span>
                }
              </span>
            </div>
          }
        </div>
      </div>

      <div class="mt-2 flex gap-2" aria-hidden="true">
        @for (month of store.months(); track month.key) {
          <span
            class="flex-1 text-center text-micro"
            [class.text-accent]="hovered() === month.key"
            [class.font-semibold]="month.peak"
            [class.text-ink-subtle]="hovered() !== month.key"
            (pointerenter)="hovered.set(month.key)"
            >{{ month.label }}</span
          >
        }
      </div>
    </div>

    <table class="sr-only">
      <caption>
        Spending per month, oldest first.
      </caption>
      <tbody>
        @for (month of store.months(); track month.key) {
          <tr>
            <th scope="row">{{ month.label }}{{ month.running ? ' (so far)' : '' }}</th>
            <td>{{ store.money(month.spentMinor) }}</td>
            <td>{{ payments(month.count) }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class SpendTrend {
  protected readonly store = inject(FinanceStore);

  /** Keyed by month, not by index — the array is replaced on every refetch. */
  protected readonly hovered = signal<string | null>(null);

  protected readonly active = computed(() => {
    const key = this.hovered();
    return key === null ? null : (this.store.months().find((month) => month.key === key) ?? null);
  });

  /**
   * Coral, with a little depth. Written as a gradient over the two accent tokens
   * rather than a Tailwind gradient utility so it resolves through the same
   * custom properties in both themes — the dark palette redefines both, and a
   * hard-coded stop would keep the light coral on a near-black card.
   */
  protected readonly fill =
    'linear-gradient(to top, var(--color-accent-pressed), var(--color-accent))';

  protected readonly hatch =
    'repeating-linear-gradient(135deg, transparent 0 5px, var(--color-surface) 5px 7px)';

  /** Everything that is not the peak or the pointer recedes, so one bar leads. */
  protected dimmed(month: MonthColumn): boolean {
    const hovered = this.hovered();
    if (hovered !== null) return hovered !== month.key;
    return !month.peak;
  }

  protected payments(count: number): string {
    return count === 1 ? '1 payment' : `${count} payments`;
  }
}
