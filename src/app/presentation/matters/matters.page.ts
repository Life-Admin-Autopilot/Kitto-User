import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import { MattersStore, type GroupMode } from '@application/matters/matters.store';
import { captureChannelOf, hasAssumedTime, type Matter } from '@domain/matters/matter';
import { MATTER_SORTS, type MatterSort } from '@domain/matters/matter-query';
import { DOMAIN_META, PRIORITY_META } from '@presentation/shared/domain-meta';
import { dueLabel } from '@presentation/shared/due-label';
import { FilterRail } from './filter-rail';

const SORT_LABELS: Record<MatterSort, string> = {
  'due-asc': 'Due soonest',
  'due-desc': 'Due latest',
  'created-desc': 'Newest',
  'created-asc': 'Oldest',
  'priority-desc': 'Priority',
  'title-asc': 'Title',
};

const CHANNEL_LABELS = {
  voice: 'Voice',
  document: 'Document',
  connected: 'Synced',
  manual: 'Typed',
} as const;

@Component({
  selector: 'app-matters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MattersStore],
  imports: [FilterRail],
  template: `
    <div class="flex gap-6 px-8 py-6">
      <app-filter-rail />

      <div class="min-w-0 flex-1">
        <header class="mb-5 flex flex-wrap items-center gap-3">
          <h1 class="font-display text-display-md text-ink">Matters</h1>
          <span class="tabular text-body-sm text-ink-muted">{{ summary() }}</span>

          <div class="ms-auto flex items-center gap-2">
            <input
              type="search"
              placeholder="Search title and notes"
              [value]="store.filters().q ?? ''"
              (change)="onSearch($event)"
              class="w-56 rounded-pill bg-surface px-3.5 py-2 text-body-sm text-ink shadow-card outline-none focus:ring-2 focus:ring-accent"
            />

            <select
              [value]="store.sort()"
              (change)="onSort($event)"
              aria-label="Sort"
              class="rounded-pill bg-surface px-3 py-2 text-body-sm text-ink shadow-card outline-none focus:ring-2 focus:ring-accent"
            >
              @for (option of sorts; track option) {
                <option [value]="option">{{ sortLabel(option) }}</option>
              }
            </select>

            <select
              [value]="store.group()"
              (change)="onGroup($event)"
              aria-label="Group by"
              class="rounded-pill bg-surface px-3 py-2 text-body-sm text-ink shadow-card outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="domain">By domain</option>
              <option value="priority">By priority</option>
              <option value="none">Ungrouped</option>
            </select>
          </div>
        </header>

        @if (store.error()) {
          <div class="rounded-2xl bg-danger-soft px-4 py-3 text-body-sm text-danger">
            <p>Could not load matters.</p>
            <button type="button" (click)="store.reload()" class="mt-1 underline">Retry</button>
          </div>
        } @else if (store.isLoading() && store.matters().length === 0) {
          <div class="flex flex-col gap-2" aria-busy="true">
            @for (row of skeletonRows; track row) {
              <div class="h-14 animate-pulse rounded-xl bg-surface-sunken"></div>
            }
          </div>
        } @else if (store.matters().length === 0) {
          <div class="rounded-2xl bg-surface px-6 py-12 text-center shadow-card">
            <p class="text-body text-ink">
              {{ store.isFiltered() ? 'Nothing matches those filters.' : 'No matters yet.' }}
            </p>
            @if (store.isFiltered()) {
              <button
                type="button"
                (click)="store.clearFilters()"
                class="mt-2 text-body-sm text-accent hover:underline"
              >
                Clear filters
              </button>
            }
          </div>
        } @else {
          @for (group of store.groups(); track group.key) {
            <section class="mb-6">
              @if (store.group() !== 'none') {
                <h2 class="mb-2 flex items-center gap-2 text-caption uppercase tracking-[0.08em] text-ink-muted">
                  <span>{{ groupLabel(group.key) }}</span>
                  <span class="tabular text-ink-subtle">{{ group.matters.length }}</span>
                </h2>
              }

              <div class="overflow-hidden rounded-2xl bg-surface shadow-card">
                @for (matter of group.matters; track matter.id) {
                  <article
                    class="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
                  >
                    <button
                      type="button"
                      (click)="store.complete(matter)"
                      [disabled]="matter.status === 'done'"
                      [attr.aria-label]="'Complete ' + matter.title"
                      class="size-5 shrink-0 rounded-full border-2 border-ink-subtle transition-colors hover:border-accent disabled:border-success disabled:bg-success"
                    ></button>

                    <span
                      class="grid size-8 shrink-0 place-items-center rounded-full text-[13px]"
                      [class]="domainMeta(matter).bg"
                      [title]="domainMeta(matter).label"
                      aria-hidden="true"
                      >{{ domainMeta(matter).emoji }}</span
                    >

                    <div class="min-w-0 flex-1">
                      <p
                        class="truncate text-body-sm text-ink"
                        [class.line-through]="matter.status === 'done'"
                        [class.text-ink-muted]="matter.status === 'done'"
                      >
                        {{ matter.title }}
                      </p>
                      <div class="flex items-center gap-2 text-micro text-ink-muted">
                        <span>{{ CHANNEL_LABELS[channel(matter)] }}</span>
                        @if (matter.subtasks.length) {
                          <span class="tabular"
                            >{{ doneSteps(matter) }}/{{ matter.subtasks.length }} steps</span
                          >
                        }
                        @for (tag of matter.tags; track tag) {
                          <span class="rounded-pill bg-surface-sunken px-1.5">{{ tag }}</span>
                        }
                      </div>
                    </div>

                    <span
                      class="shrink-0 rounded-pill px-2 py-0.5 text-micro"
                      [class]="priorityMeta(matter).chip"
                      >{{ priorityMeta(matter).label }}</span
                    >

                    <div class="w-28 shrink-0 text-end">
                      <span
                        class="text-body-sm"
                        [class.text-danger]="due(matter).overdue && matter.status !== 'done'"
                        [class.text-ink-muted]="!due(matter).overdue || matter.status === 'done'"
                        >{{ due(matter).text }}</span
                      >
                      <!-- Provenance, not decoration. A time nobody chose must
                           never render as though someone did. -->
                      @if (hasAssumedTime(matter)) {
                        <p class="text-micro text-warning">time assumed</p>
                      }
                      @if (matter.rescheduleCount > 0) {
                        <p class="tabular text-micro text-ink-subtle">
                          pushed {{ matter.rescheduleCount }}×
                        </p>
                      }
                    </div>
                  </article>
                }
              </div>
            </section>
          }

          @if (store.hasMore()) {
            <button
              type="button"
              (click)="store.loadMore()"
              [disabled]="store.isLoading()"
              class="mx-auto block rounded-pill bg-surface px-5 py-2.5 text-body-sm text-ink shadow-card transition-colors hover:bg-surface-sunken disabled:opacity-50"
            >
              {{ store.isLoading() ? 'Loading…' : 'Load more' }}
            </button>
          }
        }
      </div>
    </div>
  `,
})
export class MattersPage {
  protected readonly store = inject(MattersStore);
  private readonly session = inject(SessionStore);

  protected readonly sorts = MATTER_SORTS;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  protected readonly CHANNEL_LABELS = CHANNEL_LABELS;
  protected readonly hasAssumedTime = hasAssumedTime;

  private readonly tag = computed(() => this.session.account()?.locale ?? 'en-GB');

  protected summary(): string {
    const loaded = this.store.matters().length;
    const total = this.store.total();
    return loaded < total ? `${loaded} of ${total}` : `${total}`;
  }

  protected sortLabel(sort: MatterSort): string {
    return SORT_LABELS[sort];
  }

  protected groupLabel(key: string): string {
    const domain = DOMAIN_META[key as keyof typeof DOMAIN_META];
    if (domain) return domain.label;
    const priority = PRIORITY_META[key as keyof typeof PRIORITY_META];
    return priority ? priority.label : key;
  }

  protected domainMeta(matter: Matter) {
    return DOMAIN_META[matter.domain];
  }

  protected priorityMeta(matter: Matter) {
    return PRIORITY_META[matter.priority];
  }

  protected channel(matter: Matter) {
    return captureChannelOf(matter);
  }

  protected doneSteps(matter: Matter): number {
    return matter.subtasks.filter((step) => step.done).length;
  }

  protected due(matter: Matter) {
    return dueLabel(matter.dueAt, this.tag());
  }

  protected onSearch(event: Event): void {
    this.store.setSearch((event.target as HTMLInputElement).value);
  }

  protected onSort(event: Event): void {
    this.store.setSort((event.target as HTMLSelectElement).value as MatterSort);
  }

  protected onGroup(event: Event): void {
    this.store.setGroup((event.target as HTMLSelectElement).value as GroupMode);
  }
}
