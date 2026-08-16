import type { Matter, MatterDomain, MatterKind, MatterPriority, MatterStatus } from './matter';
import type {
  MatterCounts,
  MatterPage,
  MatterQuery,
  MatterSort,
} from './matter-query';

/** A sparse patch. `null` clears a field; omitting it leaves the field alone. */
export interface MatterPatch {
  readonly title?: string;
  readonly domain?: MatterDomain;
  readonly status?: MatterStatus;
  readonly priority?: MatterPriority;
  readonly kind?: MatterKind;
  readonly tags?: readonly string[];
  readonly dueAt?: string | null;
  readonly notes?: string | null;
  readonly snoozedUntil?: string | null;
}

export interface NewMatter {
  readonly title: string;
  readonly domain: MatterDomain;
  readonly kind?: MatterKind;
  readonly priority?: MatterPriority;
  readonly tags?: readonly string[];
  readonly dueAt?: string;
  readonly notes?: string;
}

export interface ListMattersRequest {
  readonly query: MatterQuery;
  readonly sort?: MatterSort;
  readonly limit?: number;
  readonly cursor?: string;
}

/**
 * The port. Infrastructure implements it; application depends on it; domain
 * owns it.
 *
 * An abstract class rather than an interface plus a separate InjectionToken,
 * for one specific reason: an abstract class is BOTH the compile-time type and
 * a runtime DI token, so binding it in the composition root cannot drift from
 * the type the store consumes. An interface would erase at runtime and force a
 * hand-maintained token beside it — two things to keep in sync, and nothing to
 * catch you when they stop being.
 *
 * Every method returns a Promise, never an Observable. RxJS is a framework
 * dependency and this layer has none; Promises also drop straight into
 * Angular's `resource()` loader, which hands you the AbortSignal these methods
 * take. Cancellation is therefore free and explicit rather than a subscription
 * lifecycle nobody owns.
 */
export abstract class MatterRepository {
  abstract list(request: ListMattersRequest, signal?: AbortSignal): Promise<MatterPage>;

  abstract counts(timeZone: string, signal?: AbortSignal): Promise<MatterCounts>;

  abstract tags(signal?: AbortSignal): Promise<readonly string[]>;

  abstract create(matter: NewMatter, signal?: AbortSignal): Promise<Matter>;

  abstract update(id: string, patch: MatterPatch, signal?: AbortSignal): Promise<Matter>;

  /** Soft delete. Returns an undo token when the server issued one. */
  abstract remove(id: string, signal?: AbortSignal): Promise<{ undoToken: string | null }>;

  abstract undo(token: string, signal?: AbortSignal): Promise<{ restored: number }>;
}
