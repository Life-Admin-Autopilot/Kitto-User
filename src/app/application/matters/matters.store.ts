import { Injectable, computed, inject, resource, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import { wallClockFromNow } from '@application/shared/zoned-time';
import {
  MATTER_DOMAINS,
  MATTER_STATUSES,
  type Matter,
  type MatterDomain,
  type MatterPriority,
  type MatterStatus,
} from '@domain/matters/matter';
import {
  MAX_PAGE_SIZE,
  type MatterCounts,
  type MatterQuery,
  type MatterSort,
} from '@domain/matters/matter-query';
import { MatterRepository, type MatterPatch } from '@domain/matters/matter.repository';

/** Rows fetched per "load more". One server page, not a made-up number. */
const PAGE = MAX_PAGE_SIZE;

export type GroupMode = 'none' | 'domain' | 'priority';

export interface MatterGroup {
  readonly key: string;
  readonly label: string;
  readonly matters: readonly Matter[];
}

export interface LoadedMatters {
  readonly matters: readonly Matter[];
  /** Total matching the filter server-side, not the number loaded. */
  readonly total: number;
  readonly hasMore: boolean;
}

/**
 * The matters workspace.
 *
 * Filtering happens on the SERVER, not in the browser. Every field in
 * `MatterQuery` is a real query parameter the API already honours, so narrowing
 * by domain fetches the matching rows rather than fetching everything and
 * hiding some — which is the difference between a filter that works on an
 * account with four thousand matters and one that only works in a demo.
 *
 * Grouping, by contrast, is a pure view concern and happens here: it re-arranges
 * rows that have already arrived and must never trigger a request.
 */
@Injectable()
export class MattersStore {
  private readonly repository = inject(MatterRepository);
  private readonly session = inject(SessionStore);
  private readonly crossFilter = inject(DashboardFilterStore);

  /**
   * Hide completed matters by default — a done list is a log, not a workspace.
   * Snoozed stays visible because a snoozed matter is still yours.
   */
  private readonly filtersSignal = signal<MatterQuery>({ status: ['open', 'snoozed'] });
  private readonly sortSignal = signal<MatterSort>('due-asc');
  private readonly groupSignal = signal<GroupMode>('domain');
  private readonly pagesSignal = signal(1);

  readonly filters = this.filtersSignal.asReadonly();
  readonly sort = this.sortSignal.asReadonly();
  readonly group = this.groupSignal.asReadonly();

  /**
   * The rail's filters, plus whatever the dashboard is cross-filtered to.
   *
   * Merged at query time rather than written into `filtersSignal`, so the two
   * stay distinguishable: clicking Finance on Insights and then clearing the
   * rail must not silently drop the cross-filter, and clearing the cross-filter
   * chip must not wipe the filters someone set here by hand.
   *
   * The cross-filter wins on conflict. It was the more recent, more deliberate
   * gesture — someone who clicks a domain on a chart and lands on a table
   * showing a different domain will assume the table is broken.
   */
  private readonly effectiveQuery = computed<MatterQuery>(() => {
    const base = this.filtersSignal();
    const domain = this.crossFilter.domain();
    const range = this.crossFilter.range();

    // A completion span filters on completedAfter/Before AND forces `done` into
    // the status set. Without that second half the table applied the right
    // dates to the wrong field and then hid every row the span described, so
    // drilling into a busy week showed nothing at all.
    const rangeQuery = !range
      ? {}
      : range.basis === 'completed'
        ? {
            completedAfter: range.after,
            completedBefore: range.before,
            status: ['done' as const],
          }
        : { dueAfter: range.after, dueBefore: range.before };

    return prune({
      ...base,
      ...(domain ? { domain: [domain] } : {}),
      ...rangeQuery,
    });
  });

  private readonly listResource = resource({
    params: () => ({
      query: this.effectiveQuery(),
      sort: this.sortSignal(),
      pages: this.pagesSignal(),
    }),
    loader: async ({ params, abortSignal }): Promise<LoadedMatters> => {
      const collected: Matter[] = [];
      let cursor: string | undefined;
      let total = 0;

      for (let page = 0; page < params.pages; page++) {
        const result = await this.repository.list(
          { query: params.query, sort: params.sort, limit: PAGE, cursor },
          abortSignal,
        );
        collected.push(...result.matters);
        total = result.total;
        if (!result.nextCursor) {
          return { matters: collected, total, hasMore: false };
        }
        cursor = result.nextCursor;
      }

      return { matters: collected, total, hasMore: true };
    },
    defaultValue: { matters: [], total: 0, hasMore: false },
  });

  /** Bumped to force a counts refetch — see `reloadCounts`. */
  private readonly countsNonceSignal = signal(0);

  private readonly countsResource = resource({
    params: () => ({ tz: this.session.timeZone(), nonce: this.countsNonceSignal() }),
    loader: ({ params, abortSignal }) => this.repository.counts(params.tz, abortSignal),
  });

  private readonly tagsResource = resource({
    loader: ({ abortSignal }) => this.repository.tags(abortSignal),
    defaultValue: [] as readonly string[],
  });

  /** Optimistic status writes, keyed by matter id. Cleared on reconcile. */
  private readonly pendingSignal = signal<ReadonlyMap<string, MatterStatus>>(new Map());

  private readonly actionErrorSignal = signal<string | null>(null);
  readonly actionError = this.actionErrorSignal.asReadonly();

  clearActionError(): void {
    this.actionErrorSignal.set(null);
  }

  readonly isLoading = this.listResource.isLoading;
  readonly error = this.listResource.error;

  /**
   * The list with optimistic writes applied.
   *
   * Read through a guard, because `resource.value()` RETHROWS when the resource
   * is in an error state. Every template that touched it — the header count,
   * the filter rail — therefore blew up the whole page on a failed request
   * instead of showing the error branch that was written for exactly this case.
   */
  readonly matters = computed(() => {
    if (this.listResource.error()) return [];
    const pending = this.pendingSignal();
    const loaded = this.listResource.value().matters;
    if (pending.size === 0) return loaded;
    return loaded.map((matter) => {
      const status = pending.get(matter.id);
      return status ? { ...matter, status } : matter;
    });
  });

  readonly total = computed(() =>
    this.listResource.error() ? 0 : this.listResource.value().total,
  );

  readonly hasMore = computed(() =>
    this.listResource.error() ? false : this.listResource.value().hasMore,
  );

  /** Undefined rather than a throw when the counts request failed — the rail
   *  renders without numbers instead of taking the page down with it. */
  readonly counts = computed<MatterCounts | undefined>(() =>
    this.countsResource.error() ? undefined : this.countsResource.value(),
  );

  readonly availableTags = computed(() =>
    this.tagsResource.error() ? [] : this.tagsResource.value(),
  );

  /**
   * True when the user has narrowed anything at all.
   *
   * Drives whether an empty result reads "nothing matches that" or "nothing
   * here yet" — two different sentences, and telling a new account that nothing
   * matches their filter when they have no matters at all is a dead end.
   */
  readonly isFiltered = computed(() => {
    // The cross-filter counts. Without it, an empty result under a cross-filter
    // told the user "nothing here yet" — which is false, and hides the one
    // control that would bring their matters back.
    if (this.crossFilter.isActive()) return true;

    const filters = this.filtersSignal();
    return Object.entries(filters).some(([key, value]) => {
      // The default status filter is not a user-applied narrowing.
      if (key === 'status') return !isDefaultStatus(value as readonly MatterStatus[] | undefined);
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== '' && value !== false;
    });
  });

  readonly groups = computed<readonly MatterGroup[]>(() => {
    const matters = this.matters();
    switch (this.groupSignal()) {
      case 'domain':
        return groupByDomain(matters);
      case 'priority':
        return groupByPriority(matters);
      default:
        return [{ key: 'all', label: 'All matters', matters }];
    }
  });

  // ---- Keyboard triage ----
  //
  // A cursor over the rendered order, not over `matters()`. Grouping re-orders
  // rows, so a cursor into the unsorted array would jump around the screen as
  // J moved it "down".

  private readonly cursorSignal = signal(0);

  readonly flatMatters = computed(() => this.groups().flatMap((group) => group.matters));

  readonly cursor = computed(() => {
    const length = this.flatMatters().length;
    if (length === 0) return -1;
    // Clamped on read rather than on write: the list re-orders and shrinks
    // under the cursor constantly — a completed matter leaves the filter — and
    // clamping at the edges is what stops the highlight vanishing when it does.
    return Math.min(this.cursorSignal(), length - 1);
  });

  readonly cursorMatter = computed<Matter | null>(() => {
    const index = this.cursor();
    return index < 0 ? null : (this.flatMatters()[index] ?? null);
  });

  moveCursor(delta: number): void {
    const length = this.flatMatters().length;
    if (length === 0) return;
    this.cursorSignal.set(Math.max(0, Math.min(this.cursor() + delta, length - 1)));
  }

  setCursorTo(matterId: string): void {
    const index = this.flatMatters().findIndex((matter) => matter.id === matterId);
    if (index >= 0) this.cursorSignal.set(index);
  }

  // ---- Intent ----

  patchFilters(patch: Partial<MatterQuery>): void {
    this.pagesSignal.set(1);
    this.filtersSignal.update((current) => prune({ ...current, ...patch }));
  }

  toggleDomain(domain: MatterDomain): void {
    this.patchFilters({ domain: toggle(this.filtersSignal().domain, domain) });
  }

  togglePriority(priority: MatterPriority): void {
    this.patchFilters({ priority: toggle(this.filtersSignal().priority, priority) });
  }

  /**
   * Turning off the last status selects them ALL rather than none.
   *
   * Dropping `status` from the query is not "no filter" to this server — it
   * returns every status including done. So an empty selection widened the
   * result set while the rail showed nothing lit, which reads as a bug in the
   * table. Selecting everything is the honest rendering of the same intent.
   */
  toggleStatus(status: MatterStatus): void {
    const next = toggle(this.filtersSignal().status, status);
    this.patchFilters({ status: next.length === 0 ? [...MATTER_STATUSES] : next });
  }

  setSearch(text: string): void {
    this.patchFilters({ q: text.trim() || undefined });
  }

  setSort(sort: MatterSort): void {
    this.pagesSignal.set(1);
    this.sortSignal.set(sort);
  }

  setGroup(mode: GroupMode): void {
    this.groupSignal.set(mode);
  }

  clearFilters(): void {
    this.pagesSignal.set(1);
    this.filtersSignal.set({ status: ['open', 'snoozed'] });
  }

  loadMore(): void {
    this.pagesSignal.update((pages) => pages + 1);
  }

  reload(): void {
    this.listResource.reload();
  }

  /**
   * Tick a matter off, or put it back.
   *
   * A TOGGLE, not a one-way door. Completing the wrong row is the easiest
   * mistake to make on a dense table, and a checkbox that cannot be unticked
   * turns a slip into repair work.
   *
   * The direction comes from `statusOf`, not from the row passed in. The row is
   * a render-time snapshot and stays stale for a full round-trip, so pressing E
   * twice — the documented way to undo — read 'open' both times and sent 'done'
   * twice, meaning the undo never happened.
   *
   * `snoozedUntil: null` is sent explicitly when reopening. The PATCH contract
   * treats an omitted field as "leave it alone", so omitting it would return a
   * snoozed matter to `open` while it still carried a live wake-up time.
   */
  async toggleComplete(matter: Matter): Promise<void> {
    const next: MatterStatus = this.statusOf(matter) === 'done' ? 'open' : 'done';
    await this.mutate(matter, next, { status: next, snoozedUntil: null });
  }

  /**
   * Snooze to 09:00 tomorrow, or wake it back up.
   *
   * Explicitly a no-op on a completed matter. `S` used to fall through to the
   * else branch and write a `done` matter back as `snoozed` — silently
   * resurrecting something the user had finished, with the row reappearing in
   * their open list days later for no reason they could reconstruct.
   *
   * `dueAt` is untouched in both directions: rewriting it would be a lie about
   * when a bill is actually due. Snoozing changes when the system nudges you,
   * not when the world expects you.
   *
   * The wake time is 09:00 in the ACCOUNT's zone, not the browser's — the
   * server schedules against that field, so a laptop in another country must
   * not move someone's morning.
   */
  async toggleSnooze(matter: Matter): Promise<void> {
    const current = this.statusOf(matter);
    if (current === 'done') return;

    if (current === 'snoozed') {
      await this.mutate(matter, 'open', { status: 'open', snoozedUntil: null });
      return;
    }

    await this.mutate(matter, 'snoozed', {
      status: 'snoozed',
      snoozedUntil: wallClockFromNow(1, 9, this.session.timeZone()),
    });
  }

  /** The status as the user currently sees it, optimistic write included. */
  private statusOf(matter: Matter): MatterStatus {
    return this.pendingSignal().get(matter.id) ?? matter.status;
  }

  /**
   * Apply a status change optimistically, then reconcile.
   *
   * Three things this fixes at once. The row reacts on the click rather than a
   * round-trip later; a second keypress reads the intended state rather than
   * the stale one; and a REJECTED write is no longer silent — the promise was
   * previously dropped on the floor, so a failed PATCH left the row unchanged
   * with no error, no rollback and nothing to retry.
   */
  private async mutate(matter: Matter, optimistic: MatterStatus, patch: MatterPatch): Promise<void> {
    this.pendingSignal.update((map) => new Map(map).set(matter.id, optimistic));
    this.actionErrorSignal.set(null);

    try {
      await this.repository.update(matter.id, patch);
      this.listResource.reload();
      this.reloadCounts();
    } catch {
      this.actionErrorSignal.set(`Could not update "${matter.title}". The change was not saved.`);
    } finally {
      this.pendingSignal.update((map) => {
        const next = new Map(map);
        next.delete(matter.id);
        return next;
      });
    }
  }

  /**
   * `reload()` is documented as a no-op while a resource is still on its first
   * load, so a mutation landing during the initial counts fetch would leave the
   * rail's numbers permanently stale. Re-requesting by bumping the params
   * signal works in both states.
   */
  private reloadCounts(): void {
    this.countsNonceSignal.update((nonce) => nonce + 1);
  }
}

function isDefaultStatus(status: readonly MatterStatus[] | undefined): boolean {
  if (!status) return true;
  return status.length === 2 && status.includes('open') && status.includes('snoozed');
}

/**
 * Drop empty values entirely.
 *
 * The server's filter schema is strict and rejects an empty `?status=`, so a
 * filter the user just cleared has to disappear from the object rather than
 * linger as `[]`. Leaving it produces a 400 that looks like a bug in the table.
 */
function prune(query: MatterQuery): MatterQuery {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '' || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    cleaned[key] = value;
  }
  return cleaned as MatterQuery;
}

function toggle<T>(current: readonly T[] | undefined, value: T): T[] {
  const list = current ?? [];
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Domains in their canonical order, so the sections do not reshuffle as
 *  counts change under them. */
function groupByDomain(matters: readonly Matter[]): MatterGroup[] {
  return MATTER_DOMAINS.map((domain) => ({
    key: domain,
    label: domain,
    matters: matters.filter((matter) => matter.domain === domain),
  })).filter((group) => group.matters.length > 0);
}

const PRIORITY_ORDER: readonly MatterPriority[] = ['urgent', 'high', 'normal', 'low'];

function groupByPriority(matters: readonly Matter[]): MatterGroup[] {
  return PRIORITY_ORDER.map((priority) => ({
    key: priority,
    label: priority,
    matters: matters.filter((matter) => matter.priority === priority),
  })).filter((group) => group.matters.length > 0);
}
