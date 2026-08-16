import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import type { HeatCell } from '@application/insights/insights-math';
import { addDays } from '@application/calendar/calendar-month';
import { MATTER_DOMAINS, type MatterDomain } from '@domain/matters/matter';
import { DOMAIN_META } from '@presentation/shared/domain-meta';

/**
 * A year of life admin, one cell per day.
 *
 * Borrows the contribution-graph shape and then inverts what colour means:
 * hue is the DOMAIN that dominated the day, not the volume. Volume is what the
 * weekly chart already answers, and it answers it better. The question only a
 * year of this data can answer is "when was my life about the car, and when was
 * it about money" — and that lives entirely in hue.
 *
 * Opacity carries volume as a secondary channel, so a heavy day still reads as
 * heavier than a light one of the same colour without stealing the primary
 * signal.
 *
 * Clicking a cell's month cross-filters the whole page to that domain, which is
 * why the cells are buttons rather than divs.
 */
@Component({
  selector: 'app-year-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-x-auto">
      <!-- Column-major: each column is one week, each row a weekday. Laid out
           with grid-flow-col so the DOM order stays chronological, which is
           what a screen reader and keyboard traversal follow. -->
      <div class="grid grid-flow-col grid-rows-7 gap-[3px]" [style.width.px]="gridWidth()">
        @for (cell of cells(); track cell.date.getTime()) {
          <span
            class="size-[9px] rounded-[2px]"
            [style.background-color]="fill(cell)"
            [style.opacity]="intensity(cell)"
            [title]="tooltip(cell)"
          ></span>
        }
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      @for (domain of domains; track domain) {
        <button
          type="button"
          (click)="filter.toggleDomain(domain)"
          class="flex items-center gap-1.5 text-micro transition-opacity"
          [class.opacity-35]="dimmed(domain)"
          [attr.aria-pressed]="filter.domain() === domain"
        >
          <span
            class="size-2.5 rounded-[2px]"
            [style.background-color]="swatch(domain)"
            aria-hidden="true"
          ></span>
          <span class="text-ink-muted">{{ label(domain) }}</span>
        </button>
      }
      <span class="ms-auto text-micro text-ink-subtle">{{ rangeLabel() }}</span>
    </div>
  `,
})
export class YearHeatmap {
  readonly cells = input.required<readonly HeatCell[]>();

  protected readonly filter = inject(DashboardFilterStore);
  protected readonly domains = MATTER_DOMAINS;

  /** 9px cell + 3px gap per week column, so the row never wraps mid-week. */
  protected readonly gridWidth = computed(() => Math.ceil(this.cells().length / 7) * 12);

  protected fill(cell: HeatCell): string {
    if (!cell.domain) return 'var(--color-surface-sunken)';
    return DOMAIN_META[cell.domain].cssVar;
  }

  /**
   * Volume as opacity, on a deliberately shallow ramp.
   *
   * Three steps between 0.45 and 1 rather than a linear scale: a day with
   * eleven matters is not eleven times more interesting than a day with one,
   * and a linear ramp would wash out every ordinary day to near-invisibility
   * around a single outlier.
   */
  protected intensity(cell: HeatCell): number {
    if (cell.count === 0) return 1;
    if (cell.count === 1) return 0.45;
    if (cell.count < 4) return 0.7;
    return 1;
  }

  protected tooltip(cell: HeatCell): string {
    const date = cell.date.toDateString();
    if (cell.count === 0) return `${date} — nothing`;
    const domain = cell.domain ? ` · mostly ${DOMAIN_META[cell.domain].label}` : '';
    return `${date} — ${cell.count} matter${cell.count === 1 ? '' : 's'}${domain}`;
  }

  protected swatch(domain: MatterDomain): string {
    return DOMAIN_META[domain].cssVar;
  }

  protected label(domain: MatterDomain): string {
    return DOMAIN_META[domain].label;
  }

  protected dimmed(domain: MatterDomain): boolean {
    const active = this.filter.domain();
    return active !== null && active !== domain;
  }

  protected rangeLabel(): string {
    const cells = this.cells();
    if (cells.length === 0) return '';
    const first = cells[0].date;
    const last = cells[cells.length - 1].date;
    const format = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });
    return `${format.format(first)} — ${format.format(addDays(last, 0))}`;
  }
}
