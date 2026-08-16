import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import { InsightsStore, TREND_WEEKS } from '@application/insights/insights.store';
import type { CaptureChannel, Matter, MatterDomain } from '@domain/matters/matter';
import { DOMAIN_META } from '@presentation/shared/domain-meta';

const CHANNEL_META: Record<CaptureChannel, { label: string; bar: string; note: string }> = {
  voice: { label: 'Spoken', bar: 'bg-accent', note: 'captured by voice' },
  document: { label: 'Scanned', bar: 'bg-domain-finance', note: 'read from a document' },
  connected: { label: 'Synced', bar: 'bg-domain-car', note: 'from a connected calendar' },
  manual: { label: 'Typed', bar: 'bg-ink-subtle', note: 'entered by hand' },
};

@Component({
  selector: 'app-insights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InsightsStore],
  template: `
    <div class="mx-auto max-w-5xl px-8 py-6">
      <header class="mb-6 flex items-center gap-3">
        <h1 class="font-display text-display-md text-ink">Insights</h1>
        @if (store.isLoading()) {
          <span class="text-caption text-ink-muted">Loading…</span>
        }
      </header>

      @if (store.error()) {
        <div class="rounded-2xl bg-danger-soft px-4 py-3 text-body-sm text-danger">
          <p>Could not load insights.</p>
          <button type="button" (click)="store.reload()" class="mt-1 underline">Retry</button>
        </div>
      } @else {
        @if (store.truncated()) {
          <p class="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning">
            This account has more matters than these panels loaded. The counters below come from the
            server and stay exact; the trend and the ranked lists describe what was fetched.
          </p>
        }

        <!-- Counters. Server-computed, so these stay right even when the
             window above was capped. -->
        <section class="mb-6 grid grid-cols-4 gap-3">
          <div class="rounded-2xl bg-surface p-5 shadow-card">
            <p class="font-display text-display-md tabular text-ink">{{ store.openTotal() }}</p>
            <p class="text-micro uppercase tracking-[0.08em] text-ink-muted">Open</p>
          </div>
          <div class="rounded-2xl bg-surface p-5 shadow-card">
            <p class="font-display text-display-md tabular text-danger">{{ store.overdue() }}</p>
            <p class="text-micro uppercase tracking-[0.08em] text-ink-muted">Overdue</p>
          </div>
          <div class="rounded-2xl bg-surface p-5 shadow-card">
            <p class="font-display text-display-md tabular text-warning">{{ store.slipping() }}</p>
            <p class="text-micro uppercase tracking-[0.08em] text-ink-muted">Slipping</p>
          </div>
          <div class="rounded-2xl bg-surface p-5 shadow-card">
            <p class="font-display text-display-md tabular text-accent">
              {{ store.completedThisWeek() }}
            </p>
            <p class="text-micro uppercase tracking-[0.08em] text-ink-muted">Done this week</p>
          </div>
        </section>

        <div class="grid grid-cols-2 gap-4">
          <!-- Completion trend. CSS bars rather than SVG: they inherit the
               theme tokens, mirror correctly in Arabic without any axis
               maths, and stay legible to a screen reader as real elements. -->
          <section class="col-span-2 rounded-2xl bg-surface p-5 shadow-card">
            <h2 class="mb-1 text-heading-sm text-ink">Completed per week</h2>
            <p class="mb-4 text-caption text-ink-muted">
              Rolling {{ trendWeeks }} weeks. Each bar is a full seven days ending on the date
              shown, so the last one is comparable with the rest.
            </p>
            <div class="flex h-40 items-end gap-1.5">
              @for (week of store.weeks(); track week.start.getTime()) {
                <div class="flex flex-1 flex-col items-center gap-1.5">
                  <span class="tabular text-micro text-ink-muted">{{ week.completed }}</span>
                  <div
                    class="w-full rounded-t-md bg-accent transition-[height]"
                    [style.height.%]="barHeight(week.completed)"
                    [attr.aria-label]="week.completed + ' completed'"
                  ></div>
                  <span class="text-micro text-ink-subtle">{{ weekLabel(week.start) }}</span>
                </div>
              }
            </div>
          </section>

          <!-- What you keep pushing -->
          <section class="rounded-2xl bg-surface p-5 shadow-card">
            <h2 class="mb-1 text-heading-sm text-ink">What you keep pushing</h2>
            <p class="mb-4 text-caption text-ink-muted">
              Open matters ranked by how many times they have been moved.
            </p>
            @if (store.mostPushed().length === 0) {
              <p class="text-body-sm text-ink-muted">Nothing has been pushed. Unusual, and good.</p>
            } @else {
              <ul class="flex flex-col gap-2.5">
                @for (matter of store.mostPushed(); track matter.id) {
                  <li class="flex items-center gap-2.5">
                    <span
                      class="grid size-7 shrink-0 place-items-center rounded-full text-[12px]"
                      [class]="domainMeta(matter).bg"
                      aria-hidden="true"
                      >{{ domainMeta(matter).emoji }}</span
                    >
                    <span class="min-w-0 flex-1 truncate text-body-sm text-ink">{{
                      matter.title
                    }}</span>
                    <span class="tabular shrink-0 text-body-sm text-warning"
                      >{{ matter.rescheduleCount }}×</span
                    >
                  </li>
                }
              </ul>
            }
          </section>

          <!-- Where your admin comes from -->
          <section class="rounded-2xl bg-surface p-5 shadow-card">
            <h2 class="mb-1 text-heading-sm text-ink">Where your admin comes from</h2>
            <p class="mb-4 text-caption text-ink-muted">
              How each matter reached the system, across {{ store.capturedTotal() }} matters.
            </p>
            @if (store.capturedTotal() === 0) {
              <p class="text-body-sm text-ink-muted">No matters yet.</p>
            } @else {
              <div class="mb-3 flex h-2.5 overflow-hidden rounded-pill">
                @for (entry of store.captureMix(); track entry.key) {
                  <div
                    [class]="channelMeta(entry.key).bar"
                    [style.width.%]="share(entry.count)"
                    [attr.aria-label]="channelMeta(entry.key).label"
                  ></div>
                }
              </div>
              <ul class="flex flex-col gap-1.5">
                @for (entry of store.captureMix(); track entry.key) {
                  <li class="flex items-center gap-2 text-body-sm">
                    <span class="size-2.5 rounded-full" [class]="channelMeta(entry.key).bar"></span>
                    <span class="text-ink">{{ channelMeta(entry.key).label }}</span>
                    <span class="text-caption text-ink-muted">{{
                      channelMeta(entry.key).note
                    }}</span>
                    <span class="tabular ms-auto text-ink-muted"
                      >{{ sharePercent(entry.count) }}%</span
                    >
                  </li>
                }
              </ul>
            }
          </section>

          <!-- Domain balance -->
          <section class="rounded-2xl bg-surface p-5 shadow-card">
            <h2 class="mb-1 text-heading-sm text-ink">Where your attention sits</h2>
            <p class="mb-4 text-caption text-ink-muted">Open matters in each part of your life.</p>
            <ul class="flex flex-col gap-2">
              @for (entry of store.domainBalance(); track entry.key) {
                <li class="flex items-center gap-2.5">
                  <span class="w-16 shrink-0 text-caption text-ink-muted">{{
                    domainLabel(entry.key)
                  }}</span>
                  <div class="h-2.5 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                    <div
                      class="h-full rounded-pill"
                      [class]="domainBar(entry.key)"
                      [style.width.%]="domainShare(entry.count)"
                    ></div>
                  </div>
                  <span class="tabular w-6 shrink-0 text-end text-caption text-ink-muted">{{
                    entry.count
                  }}</span>
                </li>
              }
            </ul>
          </section>

          <!-- AI provenance -->
          <section class="rounded-2xl bg-surface p-5 shadow-card">
            <h2 class="mb-1 text-heading-sm text-ink">What the AI is unsure about</h2>
            <p class="mb-4 text-caption text-ink-muted">
              {{ store.aiDerived() }} open matters were extracted by the system rather than typed.
              These are the ones worth checking.
            </p>
            <dl class="flex flex-col gap-2.5">
              <div class="flex items-baseline justify-between">
                <dt class="text-body-sm text-ink">Low confidence</dt>
                <dd class="tabular text-body-sm text-warning">{{ store.lowConfidence() }}</dd>
              </div>
              <div class="flex items-baseline justify-between">
                <dt class="text-body-sm text-ink">Time was assumed</dt>
                <dd class="tabular text-body-sm text-warning">{{ store.assumedTimes() }}</dd>
              </div>
            </dl>
            <p class="mt-3 text-micro text-ink-subtle">
              A time nobody chose is shown as assumed everywhere it appears, never as a fact.
            </p>
          </section>
        </div>
      }
    </div>
  `,
})
export class InsightsPage {
  protected readonly store = inject(InsightsStore);
  private readonly session = inject(SessionStore);

  protected readonly trendWeeks = TREND_WEEKS;

  private readonly tag = computed(() => this.session.account()?.locale ?? 'en-GB');
  private readonly dayMonth = computed(
    () => new Intl.DateTimeFormat(this.tag(), { day: 'numeric', month: 'short' }),
  );

  protected weekLabel(start: Date): string {
    return this.dayMonth().format(start);
  }

  /**
   * Bar height as a percentage of the tallest week.
   *
   * A floor of 2% on any non-zero count, so a week with one completion still
   * draws something. A bar rounded to invisibility reads as zero, which is a
   * different claim entirely.
   */
  protected barHeight(count: number): number {
    const peak = this.store.peakWeek();
    if (peak === 0) return 0;
    return count === 0 ? 0 : Math.max(2, (count / peak) * 100);
  }

  protected share(count: number): number {
    const total = this.store.capturedTotal();
    return total === 0 ? 0 : (count / total) * 100;
  }

  /** The same share, rounded for display. The bar uses the exact value so the
   *  segments still add up to the full width. */
  protected sharePercent(count: number): number {
    return Math.round(this.share(count));
  }

  protected domainShare(count: number): number {
    const peak = this.store.domainPeak();
    return peak === 0 ? 0 : (count / peak) * 100;
  }

  protected channelMeta(channel: CaptureChannel) {
    return CHANNEL_META[channel];
  }

  protected domainMeta(matter: Matter) {
    return DOMAIN_META[matter.domain];
  }

  protected domainLabel(domain: MatterDomain): string {
    return DOMAIN_META[domain].label;
  }

  protected domainBar(domain: MatterDomain): string {
    return DOMAIN_META[domain].bg;
  }
}
