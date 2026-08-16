import { Injectable, computed, inject, resource, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import type { Matter } from '@domain/matters/matter';
import { MAX_PAGE_SIZE } from '@domain/matters/matter-query';
import { MatterRepository } from '@domain/matters/matter.repository';
import { addMonths, buildMonthGrid, dayKey, firstDayOfWeek, startOfDay } from './calendar-month';

/**
 * How many pages deep the month fetch will go before it stops and says so.
 *
 * The server caps a page at 200. A month with more dated matters than that
 * exists, so the loader pages — but it pages a bounded number of times, because
 * an unbounded loop against a filter that matches everything is how one wrong
 * date range turns into forty requests. Five pages is a thousand matters in one
 * month, which is far past any real account and still a finite promise.
 *
 * When the cap is hit the grid says so rather than quietly drawing a subset.
 * A calendar that is silently missing entries is worse than one that admits it.
 */
const MAX_PAGES = 5;

export interface MonthMatters {
  readonly matters: readonly Matter[];
  /** True when the month holds more than this loader was willing to fetch. */
  readonly truncated: boolean;
}

@Injectable()
export class CalendarStore {
  private readonly repository = inject(MatterRepository);
  private readonly session = inject(SessionStore);

  /** Any day inside the month being viewed. */
  private readonly anchorSignal = signal(startOfDay(new Date()));
  readonly anchor = this.anchorSignal.asReadonly();

  /**
   * Today, captured once at construction.
   *
   * A signal rather than `new Date()` in the template: a getter called during
   * render is re-evaluated on every change detection pass, which means the
   * "today" highlight depends on when Angular last happened to run rather than
   * on what day it is. Held still, and correct for any session short of one
   * that spans midnight.
   */
  readonly today = signal(startOfDay(new Date())).asReadonly();

  readonly grid = computed(() =>
    buildMonthGrid(this.anchorSignal(), firstDayOfWeek(this.session.account()?.locale ?? 'en-GB')),
  );

  private readonly monthResource = resource({
    params: () => {
      const grid = this.grid();
      return { after: grid.gridStart.toISOString(), before: grid.gridEnd.toISOString() };
    },
    loader: async ({ params, abortSignal }): Promise<MonthMatters> => {
      const collected: Matter[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await this.repository.list(
          {
            query: {
              dueAfter: params.after,
              dueBefore: params.before,
              // Completed matters stay on the grid. A calendar that hides what
              // you finished cannot answer "what did that week actually look
              // like", which is half of why anyone opens a past month.
              status: ['open', 'snoozed', 'done'],
            },
            sort: 'due-asc',
            limit: MAX_PAGE_SIZE,
            cursor,
          },
          abortSignal,
        );

        collected.push(...result.matters);
        if (!result.nextCursor) return { matters: collected, truncated: false };
        cursor = result.nextCursor;
      }

      return { matters: collected, truncated: true };
    },
    defaultValue: { matters: [], truncated: false },
  });

  readonly isLoading = this.monthResource.isLoading;
  readonly error = this.monthResource.error;
  readonly truncated = computed(() => this.monthResource.value().truncated);

  /**
   * Matters bucketed by local calendar day.
   *
   * Computed once per load rather than filtered per cell: forty-two cells each
   * scanning the whole month is quadratic for no reason, and it is the kind of
   * cost that only shows up on the accounts that matter most.
   */
  readonly byDay = computed(() => {
    const buckets = new Map<string, Matter[]>();
    for (const matter of this.monthResource.value().matters) {
      if (!matter.dueAt) continue;
      const key = dayKey(new Date(matter.dueAt));
      const bucket = buckets.get(key);
      if (bucket) bucket.push(matter);
      else buckets.set(key, [matter]);
    }
    return buckets;
  });

  mattersOn(day: Date): readonly Matter[] {
    return this.byDay().get(dayKey(day)) ?? [];
  }

  goToPreviousMonth(): void {
    this.anchorSignal.update((current) => addMonths(current, -1));
  }

  goToNextMonth(): void {
    this.anchorSignal.update((current) => addMonths(current, 1));
  }

  goToToday(): void {
    this.anchorSignal.set(startOfDay(new Date()));
  }

  reload(): void {
    this.monthResource.reload();
  }
}
