import { Injectable, computed, inject, resource, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import { addDays, startOfDay } from '@application/calendar/calendar-month';
import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import {
  MATTER_DOMAINS,
  captureChannelOf,
  type CaptureChannel,
  type Matter,
  type MatterDomain,
} from '@domain/matters/matter';
import { MAX_PAGE_SIZE, type MatterQuery, type MatterSort } from '@domain/matters/matter-query';
import { MatterRepository } from '@domain/matters/matter.repository';
import {
  bucketByWeek,
  buildGravity,
  buildHeatmap,
  buildPipeline,
  projectInaction,
} from './insights-math';

/** The weekly chart's span. */
export const TREND_WEEKS = 12;

/** The heatmap's span. One fetch serves both — see `completedResource`. */
export const HEATMAP_DAYS = 364;

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

  readonly windowStart = computed(() => addDays(this.now(), -HEATMAP_DAYS));

  private readonly countsResource = resource({
    params: () => ({ tz: this.session.timeZone() }),
    loader: ({ params, abortSignal }) => this.repository.counts(params.tz, abortSignal),
  });

  /**
   * A year of completions — the heatmap's raw material, and the weekly chart's.
   *
   * One fetch for both. The weekly buckets are a `computed` that looks at the
   * last twelve weeks of the same array, so widening the chart later costs
   * nothing and the two views can never disagree about a day.
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

  readonly truncated = computed(
    () => this.completedResource.value().truncated || this.openResource.value().truncated,
  );

  readonly counts = computed(() => this.countsResource.value());

  // ---- Cross-filtered views ------------------------------------------------
  //
  // The cross-filter narrows what the PANELS draw, never what is fetched.
  // Re-querying on every click would make a filter chip cost a round trip and
  // lose the instant feedback that makes cross-filtering worth having at all.

  private readonly domainFilter = computed(() => this.crossFilter.domain());

  private readonly openMatters = computed(() =>
    applyDomain(this.openResource.value().matters, this.domainFilter()),
  );

  private readonly completedMatters = computed(() =>
    applyDomain(this.completedResource.value().matters, this.domainFilter()),
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
  readonly completedThisWeek = computed(() => this.weeks().at(-1)?.completed ?? 0);

  // ---- The panels ----------------------------------------------------------

  readonly weeks = computed(() =>
    bucketByWeek(this.completedMatters(), this.now(), TREND_WEEKS),
  );

  readonly peakWeek = computed(() =>
    this.weeks().reduce((max, week) => Math.max(max, week.completed), 0),
  );

  readonly heatmap = computed(() =>
    buildHeatmap(this.allMatters(), this.now(), HEATMAP_DAYS),
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

function applyDomain(
  matters: readonly Matter[],
  domain: MatterDomain | null,
): readonly Matter[] {
  return domain ? matters.filter((matter) => matter.domain === domain) : matters;
}
