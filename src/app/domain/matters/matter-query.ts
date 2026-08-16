import type { MatterDomain, MatterKind, MatterPriority, MatterStatus } from './matter';

/**
 * The query surface for listing matters.
 *
 * Mirrors the server's filter schema exactly — all fifteen filters, not the
 * subset the phone happens to expose. The phone shows a handful because a
 * bottom sheet has room for a handful; a desktop filter rail does not have that
 * excuse, and every field below is already honoured by the API today.
 *
 * All instants are ISO 8601 UTC. The server rejects a bare `2026-09-01`, so
 * callers must send a full instant, never a date.
 */
export interface MatterQuery {
  /** Free text over title and notes. */
  readonly q?: string;
  readonly status?: readonly MatterStatus[];
  readonly domain?: readonly MatterDomain[];
  readonly priority?: readonly MatterPriority[];
  readonly kind?: readonly MatterKind[];
  readonly tag?: readonly string[];
  readonly dueBefore?: string;
  readonly dueAfter?: string;
  readonly createdBefore?: string;
  readonly createdAfter?: string;
  /**
   * Completion-window filters. These are what make an Insights trend possible
   * without a bespoke analytics endpoint: bucket a range, ask for each bucket,
   * read the totals.
   */
  readonly completedBefore?: string;
  readonly completedAfter?: string;
  readonly overdue?: boolean;
  readonly undated?: boolean;
  readonly untagged?: boolean;
}

export const MATTER_SORTS = [
  'due-asc',
  'due-desc',
  'created-desc',
  'created-asc',
  'priority-desc',
  'title-asc',
] as const;
export type MatterSort = (typeof MATTER_SORTS)[number];

/**
 * The server's hard ceiling on one page. Exported because callers that
 * aggregate across a window (Insights, the calendar's month fetch) have to page
 * deliberately rather than discover the cap at runtime, and a silently
 * truncated total is a wrong number drawn confidently.
 */
export const MAX_PAGE_SIZE = 200;

export interface MatterPage {
  readonly matters: readonly import('./matter').Matter[];
  /** Total matching the filter, not the length of this page. */
  readonly total: number;
  readonly nextCursor: string | null;
}

/** Distinct tag list for the filter rail's autocomplete. */
export interface MatterTags {
  readonly tags: readonly string[];
}

/**
 * The server-computed counters behind every headline figure.
 *
 * Pure aggregation, returns in milliseconds, and already carries the
 * `byDomain` / `byPriority` breakdowns that the phone fetches and never draws.
 * The Insights KPI row is one call to this.
 */
export interface MatterCounts {
  readonly overdue: number;
  readonly today: number;
  readonly tomorrow: number;
  readonly thisWeek: number;
  readonly later: number;
  readonly undated: number;
  readonly open: number;
  readonly done: number;
  readonly trashed: number;
  readonly slipping: number;
  readonly completedToday: number;
  readonly needsInput: number;
  readonly scansAwaitingReview: number;
  readonly byDomain: Partial<Record<MatterDomain, number>>;
  readonly byPriority: Partial<Record<MatterPriority, number>>;
}
