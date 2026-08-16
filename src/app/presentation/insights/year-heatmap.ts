import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import type { HeatCell, HeatmapGrid, HeatmapMode } from '@application/insights/insights-math';
import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import { MATTER_DOMAINS, type MatterDomain } from '@domain/matters/matter';
import { DOMAIN_META } from '@presentation/shared/domain-meta';

/** Cell and gap, in px. Kept here because the month-label offsets depend on them. */
const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;

/**
 * A year of life admin, as real weeks.
 *
 * Every column is a genuine week starting on the locale's first weekday, every
 * row is a genuine weekday, and both are labelled — so the grid can actually be
 * read rather than merely recognised as "one of those GitHub squares".
 *
 * Colour is the DOMAIN that dominated the day. Opacity is volume, on a
 * deliberately shallow ramp: a day with eleven matters is not eleven times more
 * interesting than a day with one, and a linear scale washes every ordinary day
 * out around a single outlier.
 *
 * Dark mode is why empty cells are drawn with an explicit border-strong tint
 * rather than surface-sunken. On the dark card those two differ by 4/255 — the
 * grid simply vanished, leaving scattered coloured dots floating on black with
 * no structure to read them against.
 */
@Component({
  selector: 'app-year-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <div class="flex rounded-pill bg-surface-sunken p-0.5">
        @for (option of modes; track option.value) {
          <button
            type="button"
            (click)="modeChange.emit(option.value)"
            [attr.aria-pressed]="mode() === option.value"
            class="rounded-pill px-2.5 py-1 text-micro transition-colors"
            [class.bg-surface]="mode() === option.value"
            [class.text-ink]="mode() === option.value"
            [class.text-ink-muted]="mode() !== option.value"
            [class.shadow-card]="mode() === option.value"
          >
            {{ option.label }}
          </button>
        }
      </div>
      <p class="text-caption text-ink-muted">{{ explanation() }}</p>
    </div>

    <div class="overflow-x-auto pb-1">
      <div class="inline-block min-w-full">
        <!-- Month labels, positioned against the same step the grid uses. -->
        <div class="relative mb-1 h-3.5" [style.margin-inline-start.px]="gutter">
          @for (label of grid().monthLabels; track label.column) {
            <span
              class="absolute top-0 text-micro text-ink-muted"
              [style.inset-inline-start.px]="label.column * step"
            >
              {{ label.label }}
            </span>
          }
        </div>

        <div class="flex gap-[3px]">
          <!-- Weekday gutter. Alternate rows only: seven stacked 11px labels
               collide, and Mon/Wed/Fri is enough to orient a reader. -->
          <div class="flex flex-col gap-[3px]" [style.width.px]="gutter - 4">
            @for (day of grid().weekdays; track $index; let i = $index) {
              <span
                class="text-micro leading-none text-ink-subtle"
                [style.height.px]="cell"
                [style.line-height.px]="cell"
              >
                {{ i % 2 === 1 ? day : '' }}
              </span>
            }
          </div>

          @for (column of grid().columns; track $index) {
            <div class="flex flex-col gap-[3px]">
              @for (cellData of column; track cellData.date.getTime()) {
                <span
                  class="rounded-[2px]"
                  [style.width.px]="cell"
                  [style.height.px]="cell"
                  [style.background-color]="fill(cellData)"
                  [style.opacity]="intensity(cellData)"
                  [title]="tooltip(cellData)"
                ></span>
              }
            </div>
          }
        </div>
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
      <span class="ms-auto text-micro text-ink-subtle">Click a colour to filter.</span>
    </div>
  `,
})
export class YearHeatmap {
  readonly grid = input.required<HeatmapGrid>();
  readonly mode = input.required<HeatmapMode>();
  readonly locale = input('en-GB');
  readonly modeChange = output<HeatmapMode>();

  private readonly fullDate = computed(
    () => new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' }),
  );

  protected readonly filter = inject(DashboardFilterStore);
  protected readonly domains = MATTER_DOMAINS;

  protected readonly cell = CELL;
  protected readonly step = STEP;
  /** Room for the weekday labels beside the grid. */
  protected readonly gutter = 30;

  protected readonly modes = [
    { value: 'due' as const, label: 'Fell due' },
    { value: 'completed' as const, label: 'Completed' },
  ];

  protected readonly explanation = computed(() =>
    this.mode() === 'due'
      ? 'One square per day, coloured by the part of your life that day belonged to.'
      : 'One square per day you cleared something, coloured by what you cleared.',
  );

  /**
   * Empty and future cells get explicit, DIFFERENT neutrals.
   *
   * An empty past day and a future day are not the same statement — one says
   * "nothing happened", the other says "not yet" — and drawing them alike is
   * what makes the right-hand edge of the grid read as a sudden quiet spell.
   */
  protected fill(cell: HeatCell): string {
    if (!cell.inRange) return 'transparent';
    if (!cell.domain) return 'var(--color-border-strong)';
    return DOMAIN_META[cell.domain].cssVar;
  }

  protected intensity(cell: HeatCell): number {
    if (!cell.inRange) return 0;
    // An empty day is a faint ghost of the grid, not a solid block: the
    // structure has to be visible without competing with the days that carry
    // data.
    if (cell.count === 0) return 0.35;
    if (cell.count === 1) return 0.6;
    if (cell.count < 4) return 0.8;
    return 1;
  }

  protected tooltip(cell: HeatCell): string {
    // `toDateString()` is hardcoded English regardless of locale.
    const date = this.fullDate().format(cell.date);
    if (!cell.inRange) return date;
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
}
