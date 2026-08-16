import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import type { WeekBucket } from '@application/insights/insights-math';
import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';

/**
 * Completions per week, and the page's primary time control.
 *
 * Drag across it and everything else on the dashboard narrows to that span.
 * That is the difference between a chart and an instrument: a printed chart
 * shows you a spike and leaves you to go find it, whereas this one lets you
 * grab the spike and ask what it was made of.
 *
 * CSS bars rather than SVG. They inherit the theme tokens directly, mirror
 * correctly in Arabic without any axis arithmetic, and remain real elements for
 * a screen reader — none of which comes free in a `<svg>`.
 */
@Component({
  selector: 'app-completion-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointerup)': 'endBrush()',
    '(pointerleave)': 'endBrush()',
  },
  template: `
    <div class="flex h-40 items-end gap-1.5 select-none">
      @for (week of weeks(); track week.start.getTime(); let i = $index) {
        <button
          type="button"
          class="flex flex-1 cursor-pointer flex-col items-center gap-1.5"
          (pointerdown)="startBrush(i)"
          (pointerenter)="extendBrush(i)"
          [attr.aria-label]="ariaFor(week)"
        >
          <span class="tabular text-micro" [class.text-ink-muted]="!inBrush(i)" [class.text-accent]="inBrush(i)">
            {{ week.completed }}
          </span>
          <div
            class="w-full rounded-t-md transition-[height,background-color]"
            [class.bg-accent]="inBrush(i)"
            [class.bg-ink-subtle]="!inBrush(i)"
            [style.height.%]="barHeight(week.completed)"
          ></div>
          <span class="text-micro text-ink-subtle">{{ label(week.start) }}</span>
        </button>
      }
    </div>

    <p class="mt-2 text-micro text-ink-subtle">
      @if (filter.range(); as range) {
        Filtered to {{ range.label }}.
        <button type="button" (click)="filter.setRange(null)" class="text-accent hover:underline">
          Clear
        </button>
      } @else {
        Drag across the chart to filter the dashboard to a span.
      }
    </p>
  `,
})
export class CompletionTrend {
  readonly weeks = input.required<readonly WeekBucket[]>();

  protected readonly filter = inject(DashboardFilterStore);

  private readonly anchor = signal<number | null>(null);
  private readonly head = signal<number | null>(null);

  private readonly peak = computed(() =>
    this.weeks().reduce((max, week) => Math.max(max, week.completed), 0),
  );

  /**
   * A floor of 2% on any non-zero count.
   *
   * A bar rounded to invisibility reads as zero, which is a different claim
   * entirely — and on a completion chart it is the difference between "a quiet
   * week" and "a week you did nothing".
   */
  protected barHeight(count: number): number {
    const peak = this.peak();
    if (peak === 0 || count === 0) return 0;
    return Math.max(2, (count / peak) * 100);
  }

  protected startBrush(index: number): void {
    this.anchor.set(index);
    this.head.set(index);
  }

  /** Only extends while a drag is in progress, so a hover does nothing. */
  protected extendBrush(index: number): void {
    if (this.anchor() === null) return;
    this.head.set(index);
  }

  /**
   * Commit on release.
   *
   * The range is published once, at the end of the gesture, rather than on
   * every pointer move. Each publish re-derives every panel on the page, and
   * doing that on mousemove would spend a whole drag recomputing spans nobody
   * asked to see.
   */
  protected endBrush(): void {
    const anchor = this.anchor();
    const head = this.head();
    this.anchor.set(null);

    if (anchor === null || head === null) return;

    const weeks = this.weeks();
    const from = weeks[Math.min(anchor, head)];
    const to = weeks[Math.max(anchor, head)];
    if (!from || !to) return;

    this.filter.setRange({
      after: from.start.toISOString(),
      before: to.end.toISOString(),
      label: `${this.label(from.start)} – ${this.label(to.end)}`,
    });
  }

  protected inBrush(index: number): boolean {
    const anchor = this.anchor();
    const head = this.head();
    if (anchor !== null && head !== null) {
      return index >= Math.min(anchor, head) && index <= Math.max(anchor, head);
    }

    // Not dragging: light the bars covered by the committed range, so the chart
    // keeps showing what the rest of the page is filtered to.
    const range = this.filter.range();
    if (!range) return false;
    const week = this.weeks()[index];
    return (
      week.start.getTime() >= new Date(range.after).getTime() &&
      week.start.getTime() < new Date(range.before).getTime()
    );
  }

  protected label(date: Date): string {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date);
  }

  protected ariaFor(week: WeekBucket): string {
    return `Week of ${this.label(week.start)}: ${week.completed} completed`;
  }
}
