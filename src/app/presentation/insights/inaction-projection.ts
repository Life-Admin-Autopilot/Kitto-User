import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { ProjectionDay } from '@application/insights/insights-math';

/**
 * "What if I did nothing?"
 *
 * Pure `dueAt` arithmetic — no model, no estimate, nothing that could be wrong.
 * That is the point: every other panel on this page reports something the
 * system inferred, and this one reports an arithmetic certainty. If you touch
 * nothing for a fortnight, this is precisely what will be overdue.
 *
 * It starts from what is ALREADY overdue rather than from zero. A projection
 * that opens at zero implies a clean slate the person does not have, and would
 * make the fortnight look far cheaper than it is.
 */
@Component({
  selector: 'app-inaction-projection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-28 items-end gap-1">
      @for (day of days(); track day.date.getTime()) {
        <div class="group relative flex flex-1 flex-col justify-end">
          <!-- Two stacked segments: what was already late (quiet) and what this
               day adds (loud). The distinction is the whole message — one is
               history, the other is a choice being made now. -->
          <div
            class="w-full rounded-t-sm bg-warning"
            [style.height.%]="fallingHeight(day)"
            [title]="tooltip(day)"
          ></div>
          <div
            class="w-full bg-danger/25"
            [style.height.%]="carriedHeight(day)"
            [title]="tooltip(day)"
          ></div>
        </div>
      }
    </div>

    <div class="mt-2 flex justify-between text-micro text-ink-subtle">
      <span>today</span>
      <span>{{ days().length }} days</span>
    </div>
  `,
})
export class InactionProjection {
  readonly days = input.required<readonly ProjectionDay[]>();

  private readonly peak = computed(() =>
    Math.max(1, ...this.days().map((day) => day.cumulative)),
  );

  /** The slice this day adds. */
  protected fallingHeight(day: ProjectionDay): number {
    return (day.falling / this.peak()) * 100;
  }

  /** Everything that was already overdue before this day. */
  protected carriedHeight(day: ProjectionDay): number {
    return ((day.cumulative - day.falling) / this.peak()) * 100;
  }

  protected tooltip(day: ProjectionDay): string {
    const date = day.date.toDateString();
    return day.falling > 0
      ? `${date} — ${day.falling} more falls due, ${day.cumulative} overdue in total`
      : `${date} — ${day.cumulative} overdue`;
  }
}
