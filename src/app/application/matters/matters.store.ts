import { Injectable, computed, inject, resource, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import {
  MATTER_DOMAINS,
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
import { MatterRepository } from '@domain/matters/matter.repository';

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

  private readonly listResource = resource({
    params: () => ({
      query: this.filtersSignal(),
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

  private readonly countsResource = resource({
    params: () => ({ tz: this.session.timeZone() }),
    loader: ({ params, abortSignal }) => this.repository.counts(params.tz, abortSignal),
  });

  private readonly tagsResource = resource({
    loader: ({ abortSignal }) => this.repository.tags(abortSignal),
    defaultValue: [] as readonly string[],
  });

  readonly isLoading = this.listResource.isLoading;
  readonly error = this.listResource.error;
  readonly matters = computed(() => this.listResource.value().matters);
  readonly total = computed(() => this.listResource.value().total);
  readonly hasMore = computed(() => this.listResource.value().hasMore);
  readonly counts = computed<MatterCounts | undefined>(() => this.countsResource.value());
  readonly availableTags = computed(() => this.tagsResource.value());

  /**
   * True when the user has narrowed anything at all.
   *
   * Drives whether an empty result reads "nothing matches that" or "nothing
   * here yet" — two different sentences, and telling a new account that nothing
   * matches their filter when they have no matters at all is a dead end.
   */
  readonly isFiltered = computed(() => {
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

  toggleStatus(status: MatterStatus): void {
    this.patchFilters({ status: toggle(this.filtersSignal().status, status) });
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
   * Complete a matter, then refresh.
   *
   * No optimistic patch. The desktop table shows a server-computed total and
   * server-computed counts beside the rows, and quietly editing the row while
   * leaving those numbers stale produces a table that disagrees with its own
   * header — which is the exact failure that makes people stop trusting a
   * dashboard's arithmetic.
   */
  async complete(matter: Matter): Promise<void> {
    await this.repository.update(matter.id, { status: 'done' });
    this.listResource.reload();
    this.countsResource.reload();
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
