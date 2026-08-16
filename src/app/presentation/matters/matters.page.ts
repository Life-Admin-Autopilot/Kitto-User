import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import { MattersStore, type GroupMode } from '@application/matters/matters.store';
import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import { OverlayStore } from '@application/shared/overlay.store';
import { trustOf } from '@application/shared/trust-lens.store';
import { captureChannelOf, hasAssumedTime, type Matter } from '@domain/matters/matter';
import { MATTER_SORTS, type MatterSort } from '@domain/matters/matter-query';
import { DOMAIN_META, PRIORITY_META } from '@presentation/shared/domain-meta';
import { dueLabel } from '@presentation/shared/due-label';
import { isImported, sourceLabel } from '@presentation/shared/source-meta';
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
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    <div class="flex gap-6 px-8 py-6">
      <app-filter-rail />

      <div class="min-w-0 flex-1">
        <header class="mb-5 flex flex-wrap items-center gap-3">
          <h1 class="font-display text-display-md text-ink">Matters</h1>
          <span class="tabular text-body-sm text-ink-muted">{{ summary() }}</span>

          @if (crossFilter.isActive()) {
            <div
              class="flex items-center gap-2 rounded-pill bg-accent-soft px-3 py-1 text-caption text-accent"
            >
              <span>{{ crossFilterLabel() }}</span>
              <button type="button" (click)="crossFilter.clear()" aria-label="Clear filter">
                ✕
              </button>
            </div>
          }

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

        <!-- A rejected write used to be completely silent: the promise was
             dropped, the row stayed as it was, and nothing said the change had
             not been saved. -->
        @if (store.actionError(); as message) {
          <div
            role="alert"
            class="mb-3 flex items-center gap-3 rounded-lg bg-danger-soft px-3 py-2 text-body-sm text-danger"
          >
            <span class="flex-1">{{ message }}</span>
            <button type="button" (click)="store.clearActionError()" aria-label="Dismiss">✕</button>
          </div>
        }

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
                    (click)="store.setCursorTo(matter.id)"
                    [attr.data-matter-id]="matter.id"
                    [attr.data-trust]="trust(matter)"
                    class="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
                    [class.bg-accent-soft]="isCursor(matter)"
                  >
                    <!-- A toggle, never disabled. Ticking the wrong row on a
                         dense table is the easiest mistake here to make, and a
                         checkbox that cannot be unticked turns a slip into
                         repair work. -->
                    <button
                      type="button"
                      (click)="store.toggleComplete(matter)"
                      [attr.aria-pressed]="matter.status === 'done'"
                      [attr.aria-label]="
                        (matter.status === 'done' ? 'Reopen ' : 'Complete ') + matter.title
                      "
                      [title]="matter.status === 'done' ? 'Reopen' : 'Complete'"
                      class="grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors"
                      [class.border-success]="matter.status === 'done'"
                      [class.bg-success]="matter.status === 'done'"
                      [class.border-ink-subtle]="matter.status !== 'done'"
                      [class.hover:border-accent]="matter.status !== 'done'"
                    >
                      @if (matter.status === 'done') {
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--color-surface)"
                          stroke-width="3.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      }
                    </button>

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
                        <!-- Named service, not a generic "Synced": an imported
                             Google event must be distinguishable from something
                             you typed, or you cannot tell what deleting it
                             would actually do. -->
                        <span
                          [class.rounded-pill]="imported(matter)"
                          [class.bg-domain-car]="imported(matter)"
                          [class.text-domain-car-ink]="imported(matter)"
                          [class.px-1.5]="imported(matter)"
                          >{{ source(matter) }}</span
                        >
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

          <!-- Stated, not discovered. A keyboard interface nobody knows about
               is the same as no keyboard interface. -->
          <p class="mt-6 text-center text-micro text-ink-subtle">
            <kbd class="rounded bg-surface-sunken px-1">J</kbd>
            <kbd class="rounded bg-surface-sunken px-1">K</kbd> move ·
            <kbd class="rounded bg-surface-sunken px-1">E</kbd> complete ·
            <kbd class="rounded bg-surface-sunken px-1">S</kbd> snooze ·
            <kbd class="rounded bg-surface-sunken px-1">⌘K</kbd> commands
          </p>
        }
      </div>
    </div>
  `,
})
export class MattersPage {
  protected readonly store = inject(MattersStore);
  protected readonly crossFilter = inject(DashboardFilterStore);
  protected readonly overlay = inject(OverlayStore);
  private readonly session = inject(SessionStore);
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    // Keep the cursor on screen. Without this, J past the fold moved a
    // highlight the user could not see — and then E completed a row they were
    // not looking at, which is the worst possible outcome for a shortcut.
    effect(() => {
      const matter = this.store.cursorMatter();
      if (!matter) return;
      const row = (this.host.nativeElement as HTMLElement).querySelector(
        `[data-matter-id="${matter.id}"]`,
      );
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  protected readonly sorts = MATTER_SORTS;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  protected readonly CHANNEL_LABELS = CHANNEL_LABELS;
  protected readonly hasAssumedTime = hasAssumedTime;
  protected readonly trust = trustOf;

  private readonly tag = computed(() => this.session.account()?.locale ?? 'en-GB');

  protected isCursor(matter: Matter): boolean {
    return this.store.cursorMatter()?.id === matter.id;
  }

  protected crossFilterLabel(): string {
    const domain = this.crossFilter.domain();
    const range = this.crossFilter.range();
    return [domain ? DOMAIN_META[domain].label : null, range?.label].filter(Boolean).join(' · ');
  }

  /**
   * Vim-style triage: J/K to move, E to complete, S to snooze.
   *
   * Ignored while a text field has focus, without exception. Someone typing
   * "insurance" into the search box must not complete four matters on the way
   * through — this is the bug that makes people stop trusting keyboard
   * shortcuts, and it is silent when it happens.
   *
   * Also ignored when a modifier is held, so browser and OS shortcuts keep
   * working and ⌘K reaches the palette rather than being eaten here.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    // An open overlay owns the keyboard. Checking the focus target alone left a
    // window — between a dialog opening and its field taking focus — in which
    // typed letters reached these shortcuts and silently changed matters.
    if (this.overlay.keyboardCaptured()) return;

    const target = event.target as HTMLElement | null;
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) {
      return;
    }

    const matter = this.store.cursorMatter();

    switch (event.key.toLowerCase()) {
      case 'j':
        event.preventDefault();
        this.store.moveCursor(1);
        break;
      case 'k':
        event.preventDefault();
        this.store.moveCursor(-1);
        break;
      // Both are toggles, so the same key undoes what it just did. A shortcut
      // that only goes one way is one an unfamiliar user cannot experiment with.
      case 'e':
        if (!matter) return;
        event.preventDefault();
        void this.store.toggleComplete(matter);
        break;
      case 's':
        if (!matter) return;
        event.preventDefault();
        void this.store.toggleSnooze(matter);
        break;
    }
  }

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

  protected source(matter: Matter): string {
    return sourceLabel(matter, captureChannelOf(matter));
  }

  protected imported(matter: Matter): boolean {
    return isImported(matter);
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
