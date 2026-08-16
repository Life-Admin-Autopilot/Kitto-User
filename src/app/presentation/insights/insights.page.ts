import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { SessionStore } from '@application/auth/session.store';
import { InsightsStore, PROJECTION_DAYS } from '@application/insights/insights.store';
import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import { TrustLensStore, trustOf } from '@application/shared/trust-lens.store';
import type { CaptureChannel, Matter, MatterDomain } from '@domain/matters/matter';
import { DOMAIN_META } from '@presentation/shared/domain-meta';
import { CompletionTrend } from './completion-trend';
import { GravityChart } from './gravity-chart';
import { InactionProjection } from './inaction-projection';
import { PipelineSankey } from './pipeline-sankey';
import { YearHeatmap } from './year-heatmap';

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
  imports: [CompletionTrend, GravityChart, InactionProjection, PipelineSankey, YearHeatmap],
  template: `
    <div class="mx-auto max-w-5xl px-8 py-6">
      <header class="mb-5 flex flex-wrap items-center gap-3">
        <h1 class="font-display text-display-md text-ink">Insights</h1>

        @if (store.isLoading()) {
          <span class="text-caption text-ink-muted">Loading…</span>
        }

        <!-- Cross-filter chip. The only place the current narrowing is stated
             in words — the charts show it, but a highlighted bar is not an
             affordance for undoing it. -->
        @if (filter.isActive()) {
          <div class="flex items-center gap-2 rounded-pill bg-accent-soft px-3 py-1 text-caption text-accent">
            <span>{{ filterLabel() }}</span>
            <button type="button" (click)="filter.clear()" aria-label="Clear filter">✕</button>
          </div>
        }

        <button
          type="button"
          (click)="lens.toggle()"
          [attr.aria-pressed]="lens.active()"
          class="ms-auto rounded-pill px-3 py-1.5 text-body-sm transition-colors"
          [class.bg-warning]="lens.active()"
          [class.text-canvas]="lens.active()"
          [class.bg-surface]="!lens.active()"
          [class.text-ink-muted]="!lens.active()"
          [class.shadow-card]="!lens.active()"
        >
          {{ lens.active() ? 'Trust lens on' : 'Trust lens' }}
        </button>
      </header>

      @if (store.error()) {
        <div class="rounded-2xl bg-danger-soft px-4 py-3 text-body-sm text-danger">
          <p>Could not load insights.</p>
          <button type="button" (click)="store.reload()" class="mt-1 underline">Retry</button>
        </div>
      } @else {
        @if (store.truncated()) {
          <p class="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning">
            This account has more matters than these panels loaded. The counters come from the
            server and stay exact; the charts describe what was fetched.
          </p>
        }

        <section class="mb-4 grid grid-cols-4 gap-3">
          @for (tile of tiles(); track tile.label) {
            <div class="rounded-2xl bg-surface p-5 shadow-card">
              <p class="font-display text-display-md tabular" [class]="tile.tone">
                {{ tile.value }}
              </p>
              <p class="text-micro uppercase tracking-[0.08em] text-ink-muted">{{ tile.label }}</p>
            </div>
          }
        </section>

        <div class="flex flex-col gap-4">
          <section class="rounded-2xl bg-surface p-5 shadow-card">
            <h2 class="mb-1 text-heading-sm text-ink">Completed per week</h2>
            <p class="mb-4 text-caption text-ink-muted">
              Rolling seven-day spans, so the last bar is comparable with the rest.
            </p>
            <app-completion-trend [weeks]="store.weeks()" />
          </section>

          <section class="rounded-2xl bg-surface p-5 shadow-card">
            <h2 class="mb-1 text-heading-sm text-ink">A year of life admin</h2>
            <p class="mb-4 text-caption text-ink-muted">
              One square per day, coloured by the part of your life it belonged to.
            </p>
            <app-year-heatmap [cells]="store.heatmap()" />
          </section>

          <section class="rounded-2xl bg-surface p-5 shadow-card">
            <h2 class="mb-1 text-heading-sm text-ink">How your admin flows</h2>
            <p class="mb-4 text-caption text-ink-muted">
              How each matter arrived, where it was filed, and what became of it.
            </p>
            <app-pipeline-sankey [pipeline]="store.pipeline()" />
          </section>

          <div class="grid grid-cols-2 gap-4">
            <section class="rounded-2xl bg-surface p-5 shadow-card">
              <h2 class="mb-1 text-heading-sm text-ink">What is sinking</h2>
              <p class="mb-4 text-caption text-ink-muted">
                Late against how often it has been moved. Bottom-right is avoidance.
              </p>
              <app-gravity-chart [points]="store.gravity()" />
            </section>

            <section class="rounded-2xl bg-surface p-5 shadow-card">
              <h2 class="mb-1 text-heading-sm text-ink">If you did nothing</h2>
              <p class="mb-4 text-caption text-ink-muted">
                {{ store.projectedOverdue() }} matters would be overdue in
                {{ projectionDays }} days. Pure arithmetic — nothing here is predicted.
              </p>
              <app-inaction-projection [days]="store.projection()" />
            </section>

            <section class="rounded-2xl bg-surface p-5 shadow-card">
              <h2 class="mb-1 text-heading-sm text-ink">What you keep pushing</h2>
              <p class="mb-4 text-caption text-ink-muted">
                Open matters ranked by how many times they have been moved.
              </p>
              @if (store.mostPushed().length === 0) {
                <p class="text-body-sm text-ink-muted">Nothing has been pushed.</p>
              } @else {
                <ul class="flex flex-col gap-2.5">
                  @for (matter of store.mostPushed(); track matter.id) {
                    <li class="flex items-center gap-2.5" [attr.data-trust]="trust(matter)">
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

            <section class="rounded-2xl bg-surface p-5 shadow-card">
              <h2 class="mb-1 text-heading-sm text-ink">Where it comes from</h2>
              <p class="mb-4 text-caption text-ink-muted">
                How {{ store.capturedTotal() }} matters reached the system.
              </p>
              @if (store.capturedTotal() === 0) {
                <p class="text-body-sm text-ink-muted">No matters yet.</p>
              } @else {
                <div class="mb-3 flex h-2.5 overflow-hidden rounded-pill">
                  @for (entry of store.captureMix(); track entry.key) {
                    <div [class]="channelMeta(entry.key).bar" [style.width.%]="share(entry.count)"></div>
                  }
                </div>
                <ul class="flex flex-col gap-1.5">
                  @for (entry of store.captureMix(); track entry.key) {
                    <li class="flex items-center gap-2 text-body-sm">
                      <span class="size-2.5 rounded-full" [class]="channelMeta(entry.key).bar"></span>
                      <span class="text-ink">{{ channelMeta(entry.key).label }}</span>
                      <span class="text-caption text-ink-muted">{{ channelMeta(entry.key).note }}</span>
                      <span class="tabular ms-auto text-ink-muted">{{ sharePercent(entry.count) }}%</span>
                    </li>
                  }
                </ul>
              }
            </section>

            <!-- Clicking a domain here cross-filters the whole page, which is
                 why the rows are buttons. -->
            <section class="rounded-2xl bg-surface p-5 shadow-card">
              <h2 class="mb-1 text-heading-sm text-ink">Where your attention sits</h2>
              <p class="mb-4 text-caption text-ink-muted">
                Open matters per domain. Click one to filter everything.
              </p>
              <ul class="flex flex-col gap-2">
                @for (entry of store.domainBalance(); track entry.key) {
                  <li>
                    <button
                      type="button"
                      (click)="filter.toggleDomain(entry.key)"
                      [attr.aria-pressed]="filter.domain() === entry.key"
                      class="flex w-full items-center gap-2.5 rounded-md px-1 py-0.5 transition-opacity hover:bg-surface-sunken"
                      [class.opacity-35]="dimmed(entry.key)"
                    >
                      <span class="w-16 shrink-0 text-start text-caption text-ink-muted">{{
                        domainLabel(entry.key)
                      }}</span>
                      <span class="h-2.5 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                        <span
                          class="block h-full rounded-pill"
                          [class]="domainBar(entry.key)"
                          [style.width.%]="domainShare(entry.count)"
                        ></span>
                      </span>
                      <span class="tabular w-6 shrink-0 text-end text-caption text-ink-muted">{{
                        entry.count
                      }}</span>
                    </button>
                  </li>
                }
              </ul>
            </section>

            <section class="rounded-2xl bg-surface p-5 shadow-card">
              <h2 class="mb-1 text-heading-sm text-ink">What the AI is unsure about</h2>
              <p class="mb-4 text-caption text-ink-muted">
                {{ store.aiDerived() }} open matters were extracted rather than typed.
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
              <button
                type="button"
                (click)="lens.toggle()"
                class="mt-3 text-micro text-accent hover:underline"
              >
                {{ lens.active() ? 'Turn the trust lens off' : 'Show me which ones' }}
              </button>
            </section>
          </div>
        </div>
      }
    </div>
  `,
})
export class InsightsPage {
  protected readonly store = inject(InsightsStore);
  protected readonly filter = inject(DashboardFilterStore);
  protected readonly lens = inject(TrustLensStore);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly projectionDays = PROJECTION_DAYS;
  protected readonly trust = trustOf;

  protected readonly tiles = computed(() => [
    { value: this.store.openTotal(), label: 'Open', tone: 'text-ink' },
    { value: this.store.overdue(), label: 'Overdue', tone: 'text-danger' },
    { value: this.store.slipping(), label: 'Slipping', tone: 'text-warning' },
    { value: this.store.completedThisWeek(), label: 'Done this week', tone: 'text-accent' },
  ]);

  protected filterLabel(): string {
    const domain = this.filter.domain();
    const range = this.filter.range();
    return [domain ? DOMAIN_META[domain].label : null, range?.label].filter(Boolean).join(' · ');
  }

  protected domainMeta(matter: Matter) {
    return DOMAIN_META[matter.domain];
  }

  protected channelMeta(channel: CaptureChannel) {
    return CHANNEL_META[channel];
  }

  protected share(count: number): number {
    const total = this.store.capturedTotal();
    return total === 0 ? 0 : (count / total) * 100;
  }

  protected sharePercent(count: number): number {
    return Math.round(this.share(count));
  }

  protected domainShare(count: number): number {
    const peak = this.store.domainPeak();
    return peak === 0 ? 0 : (count / peak) * 100;
  }

  protected domainLabel(domain: MatterDomain): string {
    return DOMAIN_META[domain].label;
  }

  protected domainBar(domain: MatterDomain): string {
    return DOMAIN_META[domain].bg;
  }

  protected dimmed(domain: MatterDomain): boolean {
    const active = this.filter.domain();
    return active !== null && active !== domain;
  }
}
