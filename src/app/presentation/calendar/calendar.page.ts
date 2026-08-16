import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { CalendarStore } from '@application/calendar/calendar.store';
import { DAYS_IN_WEEK, isSameDay, isSameMonth } from '@application/calendar/calendar-month';
import { SessionStore } from '@application/auth/session.store';
import { TrustLensStore, trustOf } from '@application/shared/trust-lens.store';
import { hasAssumedTime, type Matter } from '@domain/matters/matter';
import { DOMAIN_META } from '@presentation/shared/domain-meta';

/** How many matters a cell shows before it collapses into a count. */
const VISIBLE_PER_DAY = 3;

@Component({
  selector: 'app-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CalendarStore],
  template: `
    <div class="flex h-dvh flex-col px-8 py-6">
      <header class="mb-5 flex items-center gap-4">
        <h1 class="font-display text-display-md text-ink">{{ monthLabel() }}</h1>

        <div class="flex items-center gap-1">
          <button
            type="button"
            (click)="store.goToPreviousMonth()"
            aria-label="Previous month"
            class="grid size-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <!-- Rotates with direction: in Arabic "previous" points the other
                 way, and an arrow that does not mirror sends people backwards. -->
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 class="rtl:rotate-180" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            (click)="store.goToNextMonth()"
            aria-label="Next month"
            class="grid size-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 class="rtl:rotate-180" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          (click)="store.goToToday()"
          class="rounded-pill bg-surface px-3 py-1.5 text-body-sm text-ink shadow-card transition-colors hover:bg-surface-sunken"
        >
          Today
        </button>

        @if (store.isLoading()) {
          <span class="text-caption text-ink-muted">Loading…</span>
        }

        <div class="ms-auto flex items-center gap-2">
          <button
            type="button"
            (click)="pressure.set(!pressure())"
            [attr.aria-pressed]="pressure()"
            class="rounded-pill px-3 py-1.5 text-body-sm transition-colors"
            [class.bg-warning]="pressure()"
            [class.text-canvas]="pressure()"
            [class.bg-surface]="!pressure()"
            [class.text-ink-muted]="!pressure()"
            [class.shadow-card]="!pressure()"
          >
            Pressure
          </button>
          <button
            type="button"
            (click)="lens.toggle()"
            [attr.aria-pressed]="lens.active()"
            class="rounded-pill px-3 py-1.5 text-body-sm transition-colors"
            [class.bg-warning]="lens.active()"
            [class.text-canvas]="lens.active()"
            [class.bg-surface]="!lens.active()"
            [class.text-ink-muted]="!lens.active()"
            [class.shadow-card]="!lens.active()"
          >
            Trust lens
          </button>
        </div>
      </header>

      @if (pressure()) {
        <p class="mb-2 text-caption text-ink-muted">
          Days are shaded by estimated workload, not by how many matters they hold. Matters with no
          estimate add nothing — an unshaded day is not necessarily a free one.
        </p>
      }

      @if (store.error()) {
        <div class="rounded-2xl bg-danger-soft px-4 py-3 text-body-sm text-danger">
          <p>Could not load this month.</p>
          <button type="button" (click)="store.reload()" class="mt-1 underline">Retry</button>
        </div>
      } @else {
        @if (store.truncated()) {
          <p class="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning">
            This month has more matters than the grid loaded. Narrow the range to see the rest.
          </p>
        }

        <!-- Weekday header. Labels come from the grid's own first week, so they
             follow whatever day the locale starts on rather than assuming
             Monday. -->
        <div class="grid grid-cols-7 border-b border-hairline pb-2">
          @for (day of store.grid().weeks[0]; track day.getTime()) {
            <div class="px-2 text-caption uppercase tracking-[0.08em] text-ink-muted">
              {{ weekdayLabel(day) }}
            </div>
          }
        </div>

        <div class="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
          @for (week of store.grid().weeks; track week[0].getTime()) {
            @for (day of week; track day.getTime()) {
              <div
                class="flex min-h-0 flex-col gap-1 border-b border-e border-hairline p-1.5"
                [class.bg-surface-sunken]="!inMonth(day) && !pressure()"
                [style.background-color]="pressureFill(day)"
                [title]="pressure() ? loadLabel(day) : ''"
              >
                <span
                  class="tabular self-start rounded-full px-1.5 text-caption"
                  [class.text-ink-subtle]="!inMonth(day)"
                  [class.text-ink-muted]="inMonth(day) && !isToday(day)"
                  [class.bg-accent]="isToday(day)"
                  [class.text-accent-ink]="isToday(day)"
                  [class.font-bold]="isToday(day)"
                >
                  {{ day.getDate() }}
                </span>

                <div class="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                  @for (matter of visible(day); track matter.id) {
                    <div
                      class="flex items-center gap-1.5 rounded-md px-1.5 py-0.5"
                      [class]="chipClass(matter)"
                      [attr.data-trust]="trust(matter)"
                      [title]="tooltip(matter)"
                    >
                      <span class="text-[10px] leading-none" aria-hidden="true">{{
                        emoji(matter)
                      }}</span>
                      <span
                        class="truncate text-micro"
                        [class.line-through]="matter.status === 'done'"
                        [class.opacity-60]="matter.status === 'done'"
                        >{{ matter.title }}</span
                      >
                    </div>
                  }
                  @if (overflow(day); as extra) {
                    <span class="px-1.5 text-micro text-ink-muted">+{{ extra }} more</span>
                  }
                </div>
              </div>
            }
          }
        </div>
      }
    </div>
  `,
})
export class CalendarPage {
  protected readonly store = inject(CalendarStore);
  protected readonly lens = inject(TrustLensStore);
  private readonly session = inject(SessionStore);

  /** The pressure map is opt-in: it answers a different question from the
   *  default view, and shading every cell by default would fight the domain
   *  colours the chips already carry. */
  protected readonly pressure = signal(false);
  protected readonly trust = trustOf;

  /**
   * Cell tint by estimated workload, relative to the busiest day in view.
   *
   * Relative rather than absolute because "a heavy day" means something
   * different for different people — six hours of admin is a catastrophe for
   * one person and a Tuesday for another. Capped at 55% so the day number and
   * the chips stay legible on top of it.
   */
  protected pressureFill(day: Date): string | null {
    if (!this.pressure()) return null;
    const peak = this.store.peakLoad();
    if (peak === 0) return null;
    const share = this.store.loadOn(day) / peak;
    if (share === 0) return null;
    return `color-mix(in srgb, var(--color-warning) ${Math.round(share * 55)}%, transparent)`;
  }

  protected loadLabel(day: Date): string {
    const minutes = Math.round(this.store.loadOn(day));
    if (minutes === 0) return 'No estimated work';
    if (minutes < 60) return `about ${minutes} min estimated`;
    return `about ${(minutes / 60).toFixed(1)} h estimated`;
  }

  /**
   * The Intl tag to format with.
   *
   * The account's language, not the browser's. Someone whose account is Arabic
   * reading on a borrowed English laptop should still get Arabic month names —
   * the app's language is a property of the person, not of the machine.
   */
  private readonly tag = computed(() => this.session.account()?.locale ?? 'en-GB');

  private readonly monthFormat = computed(
    () => new Intl.DateTimeFormat(this.tag(), { month: 'long', year: 'numeric' }),
  );
  private readonly weekdayFormat = computed(
    () => new Intl.DateTimeFormat(this.tag(), { weekday: 'short' }),
  );
  private readonly timeFormat = computed(
    () => new Intl.DateTimeFormat(this.tag(), { hour: 'numeric', minute: '2-digit' }),
  );

  protected monthLabel(): string {
    return this.monthFormat().format(this.store.grid().month);
  }

  protected weekdayLabel(day: Date): string {
    return this.weekdayFormat().format(day);
  }

  protected inMonth(day: Date): boolean {
    return isSameMonth(day, this.store.grid().month);
  }

  protected isToday(day: Date): boolean {
    return isSameDay(day, this.store.today());
  }

  protected visible(day: Date): readonly Matter[] {
    return this.store.mattersOn(day).slice(0, VISIBLE_PER_DAY);
  }

  protected overflow(day: Date): number {
    return Math.max(0, this.store.mattersOn(day).length - VISIBLE_PER_DAY);
  }

  protected emoji(matter: Matter): string {
    return DOMAIN_META[matter.domain].emoji;
  }

  /**
   * A matter whose time was assumed is drawn differently.
   *
   * `dateOnly` and `floating` mean nobody chose the hour this chip implies, so
   * it gets a dashed outline instead of a solid fill — the same distinction the
   * phone makes with its time-provenance line. Drawing an assumed 09:00 exactly
   * like a confirmed 09:00 is the trust failure this product is built to avoid,
   * and a calendar is the surface most likely to commit it.
   */
  protected chipClass(matter: Matter): string {
    const meta = DOMAIN_META[matter.domain];
    return hasAssumedTime(matter)
      ? `border border-dashed border-current bg-transparent ${meta.ink}`
      : `${meta.bg} ${meta.ink}`;
  }

  protected tooltip(matter: Matter): string {
    const parts = [matter.title];
    if (matter.dueAt && !hasAssumedTime(matter)) {
      parts.push(this.timeFormat().format(new Date(matter.dueAt)));
    } else if (matter.dueAt) {
      parts.push('time not specified');
    }
    return parts.join(' · ');
  }

  protected readonly daysInWeek = DAYS_IN_WEEK;
}
