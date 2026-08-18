import { Injectable, computed, inject, resource, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import { addDays, startOfDay } from '@application/calendar/calendar-month';
import { DashboardFilterStore, type DateRange } from '@application/shared/dashboard-filter.store';
import {
  MATTER_DOMAINS,
  captureChannelOf,
  type CaptureChannel,
  type Matter,
  type MatterDomain,
} from '@domain/matters/matter';
import { MAX_PAGE_SIZE, type MatterQuery, type MatterSort } from '@domain/matters/matter-query';
import { MatterRepository } from '@domain/matters/matter.repository';
import { bucketByWeek, buildGravity, buildPipeline, projectInaction } from './insights-math';

/** The weekly chart's span. */
export const TREND_WEEKS = 12;

/**
 * How much history the completion window covers, in whole weeks.
 *
 * A year. Two panels say "the last year of completions" in words — the flow
 * diagram and the capture mix — so the fetch has to be a year or those
 * sentences become false. The weekly chart draws the last twelve weeks of the
 * same array.
 */
export const HISTORY_WEEKS = 53;

/** Days of history to fetch. A week over the span, so the oldest bucket is a
 *  full one rather than half-empty for reasons of arithmetic. */
export const HISTORY_DAYS = HISTORY_WEEKS * 7 + 7;

/** How far ahead "what if I did nothing" looks. */
export const PROJECTION_DAYS = 14;

/**
 * Page ceiling per query. Six pages is 1,200 matters per window.
 *
 * Client-side aggregation over an unbounded set is a request storm waiting for
 * a large account, so every window is bounded — and when the bound is reached
 * the page SAYS so. A chart drawn from a silently truncated set is a confident
 * wrong answer, which is worse than no chart.
 */
const MAX_PAGES = 6;

interface WindowLoad {
  readonly matters: readonly Matter[];
  readonly truncated: boolean;
}

const EMPTY: WindowLoad = { matters: [], truncated: false };

/**
 * Behavioural insights, computed from matters the API already serves.
 *
 * Every panel answers something only this product can answer — what you avoid,
 * how your admin reaches you, what the system guessed. Deliberately not a
 * vanity counter: "47 completed" is a number any todo app can print.
 *
 * Two fetches, not seven. A year of completions and the live backlog between
 * them feed every panel on the page; each additional view is a `computed` over
 * data already in memory, so adding a chart costs no requests.
 */
@Injectable()
export class InsightsStore {
  private readonly repository = inject(MatterRepository);
  private readonly session = inject(SessionStore);
  private readonly crossFilter = inject(DashboardFilterStore);

  /** Captured once, so every bucket boundary on the page agrees with the rest. */
  readonly now = signal(startOfDay(new Date())).asReadonly();

  readonly windowStart = computed(() => addDays(this.now(), -HISTORY_DAYS));

  /**
   * The Intl tag every panel formats with.
   *
   * The ACCOUNT's language, not the browser's. Passing `undefined` to
   * `Intl.DateTimeFormat` resolves to the browser, so an Arabic account read on
   * a borrowed English laptop got Arabic chrome wrapped around English month
   * names — the exact bug the mobile app's dateFormat module exists to prevent.
   */
  readonly intlTag = computed(() => this.session.account()?.locale ?? 'en-GB');

  private readonly countsResource = resource({
    params: () => ({ tz: this.session.timeZone() }),
    loader: ({ params, abortSignal }) => this.repository.counts(params.tz, abortSignal),
  });

  /**
   * A year of completions — the weekly chart's raw material, the flow diagram's
   * and the capture mix's.
   *
   * One fetch for all three. The weekly buckets are a `computed` that looks at
   * the last twelve weeks of the same array, so widening the chart later costs
   * nothing and no two views can disagree about a day.
   *
   * Paged `created-desc` because the server offers no completion-ordered sort —
   * its six sorts are due, created, priority and title. That only matters at the
   * ceiling: an account that completes more than 1,200 matters in a year keeps
   * the most recently CREATED of them rather than the most recently completed,
   * which would skew the oldest weeks of the chart. `truncated` is how the page
   * admits it, rather than drawing a confident wrong answer.
   */
  private readonly completedResource = resource({
    params: () => ({ after: this.windowStart().toISOString() }),
    loader: ({ params, abortSignal }) =>
      this.collect({ status: ['done'], completedAfter: params.after }, 'created-desc', abortSignal),
    defaultValue: EMPTY,
  });

  /** The live backlog — gravity, capture mix, projection and trust all read it. */
  private readonly openResource = resource({
    loader: ({ abortSignal }) =>
      this.collect({ status: ['open', 'snoozed'] }, 'created-desc', abortSignal),
    defaultValue: EMPTY,
  });

  readonly isLoading = computed(
    () =>
      this.countsResource.isLoading() ||
      this.completedResource.isLoading() ||
      this.openResource.isLoading(),
  );

  readonly error = computed(
    () => this.countsResource.error() ?? this.completedResource.error() ?? this.openResource.error(),
  );

  /**
   * Every read of a resource's value goes through a guard.
   *
   * `resource.value()` RETHROWS when the resource is in an error state — even
   * with a `defaultValue` — so an unguarded read inside a template expression
   * takes the whole page down instead of rendering the error branch written for
   * exactly that case. Today the template's `@if (store.error())` happens to
   * shield these, which means the crash is one carelessly-placed binding away
   * rather than impossible. Guarding at the source removes the class of bug.
   */
  private readonly completedLoad = computed(() =>
    this.completedResource.error() ? EMPTY : this.completedResource.value(),
  );

  private readonly openLoad = computed(() =>
    this.openResource.error() ? EMPTY : this.openResource.value(),
  );

  readonly truncated = computed(
    () => this.completedLoad().truncated || this.openLoad().truncated,
  );

  readonly counts = computed(() =>
    this.countsResource.error() ? undefined : this.countsResource.value(),
  );

  // ---- Cross-filtered views ------------------------------------------------
  //
  // The cross-filter narrows what the PANELS draw, never what is fetched.
  // Re-querying on every click would make a filter chip cost a round trip and
  // lose the instant feedback that makes cross-filtering worth having at all.

  private readonly domainFilter = computed(() => this.crossFilter.domain());
  private readonly rangeFilter = computed(() => this.crossFilter.range());

  /**
   * Each set is filtered on the timestamp it is ABOUT.
   *
   * The backlog is filtered by `dueAt` and the completed set by `completedAt`,
   * because a span brushed on the completion chart means "this period" and the
   * two sets record that period with different fields. Filtering both on one
   * field would drop every open matter (they have no `completedAt`) and quietly
   * empty half the page.
   */
  private readonly openMatters = computed(() =>
    applyFilters(this.openLoad().matters, this.domainFilter(), this.rangeFilter(), 'due'),
  );

  private readonly completedMatters = computed(() =>
    applyFilters(this.completedLoad().matters, this.domainFilter(), this.rangeFilter(), 'completed'),
  );

  /**
   * The completed set WITHOUT the range filter — what the trend chart draws.
   *
   * The chart is the control that sets the range, so feeding it the range would
   * make it erase itself: brush three weeks, every other bar drops to zero, and
   * there is nothing left to drag across to widen the selection again. A brush
   * must never filter its own source.
   *
   * The domain filter still applies, because that one comes from elsewhere and
   * narrowing the chart to a domain is the point of clicking a domain.
   */
  private readonly completedForTrend = computed(() =>
    applyFilters(this.completedLoad().matters, this.domainFilter(), null, 'completed'),
  );

  /** Everything in the window, both states — what the pipeline is built from. */
  private readonly allMatters = computed(() => [
    ...this.openMatters(),
    ...this.completedMatters(),
  ]);

  // ---- Headline counters ---------------------------------------------------
  //
  // Straight from the server, so they stay exact even when a window above was
  // truncated. They deliberately ignore the cross-filter: they are the whole
  // account's state, and a filtered headline would just repeat the panel below.

  readonly openTotal = computed(() => this.counts()?.open ?? 0);
  readonly overdue = computed(() => this.counts()?.overdue ?? 0);
  readonly slipping = computed(() => this.counts()?.slipping ?? 0);

  /**
   * Counted over the RAW completion window, not the cross-filtered one.
   *
   * This tile used to read the trend chart's last bucket, which carries the
   * domain filter. Its three neighbours come straight from the server and ignore
   * the cross-filter by design, so clicking Finance changed one number in the
   * row and left the other three alone — the tile silently answered a different
   * question from the tiles beside it.
   *
   * There is no server counter for "completed in the last seven days"
   * (`completedToday` is the closest), so this one is derived, and a truncated
   * window could understate it. The banner above the panels says so.
   */
  readonly completedThisWeek = computed(
    () => bucketByWeek(this.completedLoad().matters, this.now(), 1).at(-1)?.completed ?? 0,
  );

  // ---- The panels ----------------------------------------------------------

  readonly weeks = computed(() =>
    bucketByWeek(this.completedForTrend(), this.now(), TREND_WEEKS),
  );

  readonly peakWeek = computed(() =>
    this.weeks().reduce((max, week) => Math.max(max, week.completed), 0),
  );

  readonly pipeline = computed(() => buildPipeline(this.allMatters(), this.now()));

  readonly gravity = computed(() => buildGravity(this.openMatters(), this.now()));

  readonly projection = computed(() =>
    projectInaction(this.openMatters(), this.now(), PROJECTION_DAYS),
  );

  /** Where the projection lands if nothing is done — the number worth reading. */
  readonly projectedOverdue = computed(() => this.projection().at(-1)?.cumulative ?? 0);

  // `[...].sort()` rather than `.toSorted()`: the latter needs the ES2023 lib,
  // and `filter` has already produced a fresh array here, so sorting it in
  // place mutates nothing the store or a signal is holding.
  readonly mostPushed = computed(() =>
    this.openMatters()
      .filter((matter) => matter.rescheduleCount > 0)
      .sort((a, b) => b.rescheduleCount - a.rescheduleCount)
      .slice(0, 6),
  );

  readonly captureMix = computed<readonly { key: CaptureChannel; count: number }[]>(() => {
    const tally: Record<CaptureChannel, number> = { voice: 0, document: 0, connected: 0, manual: 0 };
    for (const matter of this.allMatters()) tally[captureChannelOf(matter)]++;
    return (Object.keys(tally) as CaptureChannel[])
      .map((key) => ({ key, count: tally[key] }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);
  });

  readonly capturedTotal = computed(() =>
    this.captureMix().reduce((sum, entry) => sum + entry.count, 0),
  );

  /**
   * Open matters per domain, from the server's own counters — so this panel is
   * correct even when a window was truncated. It ignores the domain
   * cross-filter, because it IS the domain picker.
   */
  readonly domainBalance = computed<readonly { key: MatterDomain; count: number }[]>(() => {
    const byDomain = this.counts()?.byDomain ?? {};
    return MATTER_DOMAINS.map((domain) => ({ key: domain, count: byDomain[domain] ?? 0 })).sort(
      (a, b) => b.count - a.count,
    );
  });

  readonly domainPeak = computed(() =>
    this.domainBalance().reduce((max, entry) => Math.max(max, entry.count), 0),
  );

  // ---- Trust ---------------------------------------------------------------

  readonly lowConfidence = computed(
    () => this.openMatters().filter((m) => m.confidence === 'low').length,
  );

  readonly assumedTimes = computed(
    () =>
      this.openMatters().filter(
        (m) => m.timePrecision === 'dateOnly' || m.timePrecision === 'floating',
      ).length,
  );

  readonly aiDerived = computed(
    () => this.openMatters().filter((m) => m.sourceDocumentId || m.sourceVoiceNoteId).length,
  );

  reload(): void {
    this.countsResource.reload();
    this.completedResource.reload();
    this.openResource.reload();
  }

  private async collect(
    query: MatterQuery,
    sort: MatterSort,
    abortSignal: AbortSignal,
  ): Promise<WindowLoad> {
    const matters: Matter[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.repository.list(
        { query, sort, limit: MAX_PAGE_SIZE, cursor },
        abortSignal,
      );
      matters.push(...result.matters);
      if (!result.nextCursor) return { matters, truncated: false };
      cursor = result.nextCursor;
    }
    return { matters, truncated: true };
  }
}

function applyFilters(
  matters: readonly Matter[],
  domain: MatterDomain | null,
  range: DateRange | null,
  stamp: 'due' | 'completed',
): readonly Matter[] {
  let filtered = matters;

  if (domain) {
    filtered = filtered.filter((matter) => matter.domain === domain);
  }

  if (range) {
    const after = new Date(range.after).getTime();
    const before = new Date(range.before).getTime();
    filtered = filtered.filter((matter) => {
      // The range's own basis wins where the set can honour it: a completion
      // span asked about completions. The open backlog has no completedAt, so
      // it falls back to its due date rather than filtering itself to nothing.
      const preferred = range.basis === 'completed' ? matter.completedAt : matter.dueAt;
      const value = preferred ?? (stamp === 'completed' ? matter.completedAt : matter.dueAt);
      // An undated matter is not "outside the range" — it has no position on
      // the timeline at all. Excluding it is right: a brushed span is a
      // question about a period, and a matter with no date cannot answer it.
      if (!value) return false;
      const at = new Date(value).getTime();
      return at >= after && at < before;
    });
  }

  return filtered;
}
