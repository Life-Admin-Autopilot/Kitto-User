import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MattersStore } from '@application/matters/matters.store';
import {
  MATTER_DOMAINS,
  MATTER_PRIORITIES,
  MATTER_STATUSES,
  type MatterDomain,
  type MatterPriority,
  type MatterStatus,
} from '@domain/matters/matter';
import { DOMAIN_META, PRIORITY_META } from '@presentation/shared/domain-meta';

/**
 * The persistent filter rail.
 *
 * Every control here maps to a server-side filter, so the counts in the header
 * and the rows in the table always describe the same set. A rail that filtered
 * client-side would show "12 matching" beside a page that had only fetched the
 * first fifty.
 */
@Component({
  selector: 'app-filter-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="flex w-56 shrink-0 flex-col gap-6 border-e border-hairline py-6 pe-6">
      <section class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between">
          <h2 class="text-caption uppercase tracking-[0.08em] text-ink-muted">Domain</h2>
          @if (store.isFiltered()) {
            <button
              type="button"
              (click)="store.clearFilters()"
              class="text-micro text-accent hover:underline"
            >
              Clear
            </button>
          }
        </div>
        @for (domain of domains; track domain) {
          <button
            type="button"
            (click)="store.toggleDomain(domain)"
            [attr.aria-pressed]="isDomainOn(domain)"
            class="flex items-center gap-2.5 rounded-pill px-2 py-1.5 text-body-sm transition-colors"
            [class.bg-surface-sunken]="isDomainOn(domain)"
            [class.text-ink]="isDomainOn(domain)"
            [class.text-ink-muted]="!isDomainOn(domain)"
          >
            <span
              class="grid size-6 shrink-0 place-items-center rounded-full text-[11px]"
              [class]="meta(domain).bg"
              aria-hidden="true"
              >{{ meta(domain).emoji }}</span
            >
            <span>{{ meta(domain).label }}</span>
            @if (domainCount(domain); as count) {
              <span class="tabular ms-auto text-micro text-ink-subtle">{{ count }}</span>
            }
          </button>
        }
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-caption uppercase tracking-[0.08em] text-ink-muted">Priority</h2>
        <div class="flex flex-wrap gap-1.5">
          @for (priority of priorities; track priority) {
            <button
              type="button"
              (click)="store.togglePriority(priority)"
              [attr.aria-pressed]="isPriorityOn(priority)"
              class="rounded-pill px-2.5 py-1 text-micro transition-opacity"
              [class]="priorityMeta(priority).chip"
              [class.opacity-40]="!isPriorityOn(priority) && anyPriorityOn()"
            >
              {{ priorityMeta(priority).label }}
            </button>
          }
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-caption uppercase tracking-[0.08em] text-ink-muted">Status</h2>
        <div class="flex flex-wrap gap-1.5">
          @for (status of statuses; track status) {
            <button
              type="button"
              (click)="store.toggleStatus(status)"
              [attr.aria-pressed]="isStatusOn(status)"
              class="rounded-pill px-2.5 py-1 text-micro capitalize transition-colors"
              [class.bg-solid]="isStatusOn(status)"
              [class.text-solid-ink]="isStatusOn(status)"
              [class.bg-surface-sunken]="!isStatusOn(status)"
              [class.text-ink-muted]="!isStatusOn(status)"
            >
              {{ status }}
            </button>
          }
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-caption uppercase tracking-[0.08em] text-ink-muted">Only show</h2>
        @for (flag of flags; track flag.key) {
          <label class="flex items-center gap-2 text-body-sm text-ink-muted">
            <input
              type="checkbox"
              [checked]="isFlagOn(flag.key)"
              (change)="toggleFlag(flag.key)"
              class="size-4 accent-[var(--color-accent)]"
            />
            <span>{{ flag.label }}</span>
          </label>
        }
      </section>
    </aside>
  `,
})
export class FilterRail {
  protected readonly store = inject(MattersStore);

  protected readonly domains = MATTER_DOMAINS;
  protected readonly priorities = MATTER_PRIORITIES;
  protected readonly statuses = MATTER_STATUSES;

  protected readonly flags = [
    { key: 'overdue', label: 'Overdue' },
    { key: 'undated', label: 'No date' },
    { key: 'untagged', label: 'Untagged' },
  ] as const;

  protected meta(domain: MatterDomain) {
    return DOMAIN_META[domain];
  }

  protected priorityMeta(priority: MatterPriority) {
    return PRIORITY_META[priority];
  }

  protected isDomainOn(domain: MatterDomain): boolean {
    return this.store.filters().domain?.includes(domain) ?? false;
  }

  protected isPriorityOn(priority: MatterPriority): boolean {
    return this.store.filters().priority?.includes(priority) ?? false;
  }

  protected anyPriorityOn(): boolean {
    return (this.store.filters().priority?.length ?? 0) > 0;
  }

  protected isStatusOn(status: MatterStatus): boolean {
    return this.store.filters().status?.includes(status) ?? false;
  }

  /**
   * The whole-account count for a domain, from the server's counters.
   *
   * Deliberately NOT the number of loaded rows in that domain. This number has
   * to stay still while you narrow by priority, because it is what tells you
   * how much is behind a filter you have not applied yet — a count that shrank
   * to match the current view would only ever repeat what the table already
   * shows.
   */
  protected domainCount(domain: MatterDomain): number | undefined {
    return this.store.counts()?.byDomain[domain];
  }

  protected isFlagOn(key: 'overdue' | 'undated' | 'untagged'): boolean {
    return this.store.filters()[key] === true;
  }

  protected toggleFlag(key: 'overdue' | 'undated' | 'untagged'): void {
    this.store.patchFilters({ [key]: !this.isFlagOn(key) });
  }
}
