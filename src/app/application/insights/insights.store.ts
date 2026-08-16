import { Injectable, computed, inject, resource, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import { addDays, startOfDay } from '@application/calendar/calendar-month';
import {
  MATTER_DOMAINS,
  captureChannelOf,
  type CaptureChannel,
  type Matter,
  type MatterDomain,
} from '@domain/matters/matter';
import { MAX_PAGE_SIZE } from '@domain/matters/matter-query';
import { MatterRepository } from '@domain/matters/matter.repository';

/** How far back the trend looks. Twelve weeks is a term — long enough for a
 *  pattern, short enough that the window is still about now. */
export const TREND_WEEKS = 12;

const DAYS_PER_WEEK = 7;

/**
 * Page ceiling per query.
 *
 * The same bounded-paging promise the calendar makes, for the same reason: this
 * aggregates client-side because the API has no analytics endpoint, and
 * client-side aggregation over an unbounded set is a request storm waiting for
 * a big account. Six pages is 1,200 matters per window.
 *
 * When the cap is reached the page SAYS so. A chart drawn from a silently
 * truncated set is a confident wrong answer, which is worse than no chart.
 */
const MAX_PAGES = 6;

export interface WeekBucket {
  /** Local midnight the week starts on. */
  readonly start: Date;
  readonly completed: number;
}

export interface RankedCount<T extends string = string> {
  readonly key: T;
  readonly count: number;
}

interface WindowLoad {
  readonly matters: readonly Matter[];
  readonly truncated: boolean;
}

/**
 * Behavioural insights, computed from matters the API already serves.
 *
 * Every panel here answers something only this product can answer — what you
 * avoid, how your admin reaches you, whether the AI's guesses were any good.
 * Deliberately not a vanity counter: "47 completed" is a number any todo app
 * can print, and it tells nobody anything they can act on.
 */
@Injectable()
export class InsightsStore {
  private readonly repository = inject(MatterRepository);
  private readonly session = inject(SessionStore);

  /** Captured once, so every bucket boundary on the page agrees with the rest. */
  private readonly now = signal(startOfDay(new Date())).asReadonly();

  readonly windowStart = computed(() => addDays(this.now(), -TREND_WEEKS * DAYS_PER_WEEK));

  private readonly countsResource = resource({
    params: () => ({ tz: this.session.timeZone() }),
    loader: ({ params, abortSignal }) => this.repository.counts(params.tz, abortSignal),
  });

  /** Everything completed inside the window — the trend's raw material. */
  private readonly completedResource = resource({
    params: () => ({ after: this.windowStart().toISOString() }),
    loader: ({ params, abortSignal }) =>
      this.collect(
        { status: ['done'], completedAfter: params.after },
        'created-desc',
        abortSignal,
      ),
    defaultValue: { matters: [], truncated: false } satisfies WindowLoad,
  });

  /** The live backlog — what reschedules and capture mix are measured over. */
  private readonly openResource = resource({
    loader: ({ abortSignal }) =>
      this.collect({ status: ['open', 'snoozed'] }, 'created-desc', abortSignal),
    defaultValue: { matters: [], truncated: false } satisfies WindowLoad,
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

  // ---- Panel 1: the headline counters, straight from the server ----

  readonly openTotal = computed(() => this.counts()?.open ?? 0);
  readonly overdue = computed(() => this.counts()?.overdue ?? 0);
  readonly slipping = computed(() => this.counts()?.slipping ?? 0);
  readonly completedThisWeek = computed(() => this.weeks().at(-1)?.completed ?? 0);

  // ---- Panel 2: completion trend ----

  /**
   * Weekly completions, oldest first.
   *
   * Buckets are rolling seven-day periods counted back from today, not ISO
   * calendar weeks. Deliberate: the last bucket is then always a full seven days
   * ending today, so it is directly comparable with the one before it. An ISO
   * week would leave the final bar covering however many days have elapsed
   * since Monday, and a chart whose last bar is short for a reason that has
   * nothing to do with the user is a chart that lies every day except Sunday.
   */
  readonly weeks = computed<readonly WeekBucket[]>(() => {
    const buckets: WeekBucket[] = [];
    const completed = this.completedResource.value().matters;

    for (let index = TREND_WEEKS - 1; index >= 0; index--) {
      const end = addDays(this.now(), -index * DAYS_PER_WEEK + 1);
      const start = addDays(end, -DAYS_PER_WEEK);
      const count = completed.filter((matter) => {
        if (!matter.completedAt) return false;
        const at = new Date(matter.completedAt).getTime();
        return at >= start.getTime() && at < end.getTime();
      }).length;
      buckets.push({ start, completed: count });
    }
    return buckets;
  });

  readonly peakWeek = computed(() =>
    this.weeks().reduce((max, week) => Math.max(max, week.completed), 0),
  );

  // ---- Panel 3: what you keep pushing ----

  /**
   * The backlog ranked by how many times it has been rescheduled.
   *
   * `rescheduleCount` is a first-class field on the model, which is unusual —
   * it is the only number in the dataset that measures avoidance rather than
   * activity. Matters never pushed are excluded: a list where most rows say
   * "0×" buries the handful that are the actual point.
   */
  readonly mostPushed = computed(() =>
    this.openResource
      .value()
      .matters.filter((matter) => matter.rescheduleCount > 0)
      .sort((a, b) => b.rescheduleCount - a.rescheduleCount)
      .slice(0, 6),
  );

  // ---- Panel 4: where your admin comes from ----

  /**
   * Capture channel mix across the backlog and the window's completions.
   *
   * Both sets, not just the backlog: how work ARRIVES is a property of the
   * whole period, and measuring only what is still open would over-count
   * whatever channel produces the matters people put off.
   */
  readonly captureMix = computed<readonly RankedCount<CaptureChannel>[]>(() => {
    const tally: Record<CaptureChannel, number> = { voice: 0, document: 0, connected: 0, manual: 0 };
    for (const matter of [
      ...this.openResource.value().matters,
      ...this.completedResource.value().matters,
    ]) {
      tally[captureChannelOf(matter)]++;
    }
    return (Object.keys(tally) as CaptureChannel[])
      .map((key) => ({ key, count: tally[key] }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);
  });

  readonly capturedTotal = computed(() =>
    this.captureMix().reduce((sum, entry) => sum + entry.count, 0),
  );

  // ---- Panel 5: domain balance ----

  /**
   * Open matters per domain, from the server's own counters.
   *
   * One cheap call rather than a client-side tally of fetched rows — so this
   * panel is correct even when the window above it was truncated.
   */
  readonly domainBalance = computed<readonly RankedCount<MatterDomain>[]>(() => {
    const byDomain = this.counts()?.byDomain ?? {};
    return MATTER_DOMAINS.map((domain) => ({ key: domain, count: byDomain[domain] ?? 0 })).sort(
      (a, b) => b.count - a.count,
    );
  });

  readonly domainPeak = computed(() =>
    this.domainBalance().reduce((max, entry) => Math.max(max, entry.count), 0),
  );

  // ---- Panel 6: how much the AI got right ----

  /**
   * The share of the backlog the system is NOT confident about.
   *
   * `overview.md` names a wrong extracted value as the product's single biggest
   * risk. This is that risk, counted: matters the extractor marked low
   * confidence, and matters carrying a time nobody actually chose.
   */
  readonly lowConfidence = computed(
    () => this.openResource.value().matters.filter((m) => m.confidence === 'low').length,
  );

  readonly assumedTimes = computed(
    () =>
      this.openResource.value().matters.filter(
        (m) => m.timePrecision === 'dateOnly' || m.timePrecision === 'floating',
      ).length,
  );

  readonly aiDerived = computed(
    () =>
      this.openResource
        .value()
        .matters.filter((m) => m.sourceDocumentId || m.sourceVoiceNoteId).length,
  );

  reload(): void {
    this.countsResource.reload();
    this.completedResource.reload();
    this.openResource.reload();
  }

  private async collect(
    query: Parameters<MatterRepository['list']>[0]['query'],
    sort: Parameters<MatterRepository['list']>[0]['sort'],
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
