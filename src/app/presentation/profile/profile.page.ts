import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import { ProfileStore } from '@application/profile/profile.store';
import {
  DEFAULT_TIME_ZONE,
  allTimeZones,
  clockIn,
  deviceTimeZone,
  matchesZone,
  offsetLabel,
  zoneLabel,
} from '@application/shared/time-zones';

/**
 * How many rows the list renders before the search field becomes the only way
 * through it. Four hundred rows is a scroll nobody finishes, and rendering them
 * all costs a visible frame on a cold page.
 */
const VISIBLE_ROWS = 80;

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProfileStore],
  template: `
    <div class="mx-auto max-w-3xl px-8 py-6">
      <header class="mb-5">
        <h1 class="font-display text-display-md text-ink">Profile</h1>
        <p class="mt-1 text-body-sm text-ink-muted">{{ email() }}</p>
      </header>

      <section class="rounded-2xl bg-surface p-6 shadow-card">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="text-heading-md text-ink">Time zone</h2>

            <!--
              Says what the setting DOES, not what it is. The server schedules
              reminders and cuts the digest's day against this field while the
              browser is closed, so it is not a display preference and calling
              it one is how it ends up wrong and unnoticed.
            -->
            <p class="mt-1 text-body-sm text-ink-muted">
              Kitto decides what “today” means, when reminders fire and how the daily digest is cut
              against this zone — on the server, while this tab is closed. It is not just a display
              setting.
            </p>
          </div>

          <div class="rounded-xl bg-surface-sunken px-4 py-3 text-end">
            <p class="font-display text-heading-xl tabular text-ink">{{ currentClock() }}</p>
            <p class="text-micro uppercase tracking-[0.08em] text-ink-muted">
              {{ currentOffset() }}
            </p>
          </div>
        </div>

        <!-- The current value, stated once and unambiguously. -->
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <span
            class="rounded-pill bg-accent-soft px-3 py-1 text-body-sm font-semibold text-accent"
          >
            {{ zoneLabel(current()) }}
          </span>

          @if (followsDevice()) {
            <span class="text-caption text-ink-muted">
              following this device — pick one below to fix it
            </span>
          } @else {
            <button
              type="button"
              (click)="followDevice()"
              [disabled]="store.isSaving()"
              class="text-caption text-ink-muted underline transition-colors hover:text-ink disabled:opacity-40"
            >
              Follow this device instead ({{ zoneLabel(device) }})
            </button>
          }
        </div>

        @if (store.error(); as message) {
          <p role="alert" class="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-body-sm text-danger">
            {{ message }}
          </p>
        }

        @if (store.state() === 'saved') {
          <p
            role="status"
            class="mt-4 rounded-lg bg-success-soft px-3 py-2 text-body-sm text-success"
          >
            Saved. Reminders and the digest use {{ zoneLabel(current()) }} from now on.
          </p>
        }

        <!-- Two shortcuts before the long list, because between them they are
             almost every real answer: where the product is based, and where the
             browser says you are. -->
        <div class="mt-5 flex flex-wrap gap-2">
          @for (shortcut of shortcuts(); track shortcut.zone) {
            <button
              type="button"
              (click)="choose(shortcut.zone)"
              [disabled]="store.isSaving()"
              [attr.aria-pressed]="current() === shortcut.zone"
              class="flex flex-col items-start gap-0.5 rounded-xl px-4 py-2.5 text-start transition-colors disabled:opacity-40"
              [class.bg-accent-soft]="current() === shortcut.zone"
              [class.bg-surface-sunken]="current() !== shortcut.zone"
            >
              <span
                class="text-body-sm font-semibold"
                [class.text-accent]="current() === shortcut.zone"
                [class.text-ink]="current() !== shortcut.zone"
              >
                {{ shortcut.label }}
              </span>
              <span class="text-caption tabular text-ink-subtle">
                {{ zoneLabel(shortcut.zone) }} · {{ offsetLabel(shortcut.zone, now) }}
              </span>
            </button>
          }
        </div>

        <label class="mt-5 flex flex-col gap-1.5">
          <span class="text-caption text-ink-muted">Search all zones</span>
          <input
            type="search"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            placeholder="Cairo, Berlin, New York…"
            aria-label="Search time zones"
            class="rounded-lg bg-surface-sunken px-3 py-2.5 text-body-sm text-ink outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        <ul class="mt-2 flex max-h-96 flex-col overflow-y-auto">
          @for (zone of matches(); track zone) {
            <li>
              <button
                type="button"
                (click)="choose(zone)"
                [disabled]="store.isSaving()"
                [attr.aria-pressed]="current() === zone"
                class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start transition-colors disabled:opacity-40"
                [class.bg-accent-soft]="current() === zone"
                [class.hover:bg-surface-sunken]="current() !== zone"
              >
                <span
                  class="truncate text-body-sm"
                  [class.font-bold]="current() === zone"
                  [class.text-accent]="current() === zone"
                  [class.text-ink]="current() !== zone"
                >
                  {{ zoneLabel(zone) }}
                </span>
                <span class="shrink-0 text-caption tabular text-ink-subtle">
                  {{ clockIn(zone, now) }} · {{ offsetLabel(zone, now) }}
                </span>
              </button>
            </li>
          } @empty {
            <li class="px-3 py-6 text-center text-body-sm text-ink-muted">
              No zone matches “{{ query() }}”.
            </li>
          }
        </ul>

        @if (hiddenCount() > 0) {
          <!-- Never a silent truncation. A capped list that says nothing reads
               as "your zone is not supported" to the one person whose zone is
               row 81. -->
          <p class="mt-2 text-caption text-ink-muted">
            {{ hiddenCount() }} more not shown — narrow the search to reach them.
          </p>
        }
      </section>
    </div>
  `,
})
export class ProfilePage {
  private readonly session = inject(SessionStore);
  protected readonly store = inject(ProfileStore);

  protected readonly device = deviceTimeZone();
  protected readonly now = new Date();

  protected readonly query = signal('');

  /** Read once — the runtime's zone table does not change mid-session. */
  private readonly zones = allTimeZones();

  protected readonly current = this.store.timeZone;
  protected readonly followsDevice = this.store.timeZoneFollowsDevice;

  protected readonly zoneLabel = zoneLabel;
  protected readonly offsetLabel = offsetLabel;
  protected readonly clockIn = clockIn;

  protected readonly currentClock = computed(() => clockIn(this.current(), this.now));
  protected readonly currentOffset = computed(() => offsetLabel(this.current(), this.now));

  /**
   * Egypt and the device, deduplicated.
   *
   * Egypt is listed by name rather than as "the default" because that is the
   * fact the user is choosing — a row labelled "Default" tells them nothing
   * about what time it will be.
   */
  protected readonly shortcuts = computed(() => {
    const entries = [
      { zone: DEFAULT_TIME_ZONE, label: 'Egypt' },
      { zone: this.device, label: 'This device' },
    ];
    return entries.filter(
      (entry, index) => entries.findIndex((other) => other.zone === entry.zone) === index,
    );
  });

  private readonly filtered = computed(() =>
    this.zones.filter((zone) => matchesZone(zone, this.query())),
  );

  protected readonly matches = computed(() => this.filtered().slice(0, VISIBLE_ROWS));

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.filtered().length - VISIBLE_ROWS),
  );

  protected email(): string {
    return this.session.account()?.email ?? '';
  }

  protected async choose(zone: string): Promise<void> {
    if (zone === this.current() && !this.followsDevice()) return;
    await this.store.chooseTimeZone(zone);
  }

  protected async followDevice(): Promise<void> {
    await this.store.followDevice();
  }
}
