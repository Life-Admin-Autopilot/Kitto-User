import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { FinanceStore } from '@application/finance/finance.store';
import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import type { MatterDomain } from '@domain/matters/matter';
import { DOMAIN_META } from '@presentation/shared/domain-meta';

/** Ring geometry, in the SVG's own units. */
const RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The gap between two segments, in path units.
 *
 * Without it, two adjacent pastels of similar lightness — periwinkle beside sky
 * — read as one long arc, and the ring silently loses a category.
 */
const GAP = 5;

interface Arc {
  readonly domain: MatterDomain;
  readonly label: string;
  readonly emoji: string;
  readonly colour: string;
  readonly spentMinor: number;
  readonly count: number;
  readonly percent: number;
  /** `stroke-dasharray`, already assembled. */
  readonly dash: string;
  readonly offset: number;
}

/**
 * Which parts of a life the money went to, as one ring.
 *
 * A ring rather than a sixth bar list. This page already spends three panels on
 * horizontal bars, and the question here is genuinely a question about
 * PROPORTION — "how much of my money is the car" — which is the one question a
 * ring answers better than a bar. The domain pastels do the identifying, and
 * they are theme-invariant, so the ring means the same thing in both themes.
 *
 * The centre is the total the ring ACTUALLY DREW, not the window total. Spending
 * on a receipt nobody filed under an area is real money with no segment here, so
 * printing the window total in the middle would label the ring with a figure its
 * own segments do not add up to. The line under the legend says where the rest
 * went.
 *
 * Clicking a segment cross-filters the whole dashboard, the same gesture the
 * domain list below the charts offers — but it filters MATTERS, not this panel,
 * which is server-aggregated over the whole account and says so.
 */
@Component({
  selector: 'app-spend-arc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (arcs().length === 0) {
      <p class="text-body-sm text-ink-muted">No spending is filed under an area yet.</p>
    } @else {
      <div class="flex flex-wrap items-center gap-6">
        <div class="relative shrink-0" (pointerleave)="hovered.set(null)">
          <svg
            width="176"
            height="176"
            viewBox="0 0 176 176"
            role="img"
            [attr.aria-label]="summaryLabel()"
          >
            <!-- The track. Without it a ring made of two small slices reads as
                 two floating dashes with no shape to place them on. -->
            <circle
              cx="88"
              cy="88"
              [attr.r]="radius"
              fill="none"
              stroke="var(--color-surface-sunken)"
              stroke-width="18"
            />

            <!-- -90° so the ring starts at twelve o'clock. Rotating the group
                 rather than offsetting every dash keeps the arithmetic below
                 readable as plain shares. -->
            <g transform="rotate(-90 88 88)">
              @for (arc of arcs(); track arc.domain) {
                <circle
                  cx="88"
                  cy="88"
                  [attr.r]="radius"
                  fill="none"
                  [attr.stroke]="arc.colour"
                  [attr.stroke-width]="hovered() === arc.domain ? 26 : 18"
                  [attr.stroke-dasharray]="arc.dash"
                  [attr.stroke-dashoffset]="arc.offset"
                  [style.opacity]="dimmed(arc.domain) ? 0.25 : 1"
                  class="cursor-pointer transition-[stroke-width,opacity] duration-150"
                  (pointerenter)="hovered.set(arc.domain)"
                  (click)="filter.toggleDomain(arc.domain)"
                />
              }
            </g>
          </svg>

          <!-- The centre readout is HTML over the SVG, not <text>: it inherits
               the display face and the ink token, and it wraps. -->
          <div
            class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-8 text-center"
          >
            @if (active(); as arc) {
              <span class="text-body-sm text-ink">{{ arc.emoji }} {{ arc.label }}</span>
              <span class="tabular font-display text-heading-md text-ink">{{
                store.moneyCompact(arc.spentMinor)
              }}</span>
              <span class="text-micro text-ink-muted">{{ arc.percent }}% of the ring</span>
            } @else {
              <span class="tabular font-display text-heading-md text-ink">{{
                store.moneyCompact(store.filedMinor())
              }}</span>
              <span class="text-micro text-ink-muted">filed under an area</span>
            }
          </div>
        </div>

        <ul class="flex min-w-56 flex-1 flex-col gap-1">
          @for (arc of arcs(); track arc.domain) {
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-sunken"
                [attr.aria-pressed]="filter.domain() === arc.domain"
                [style.opacity]="dimmed(arc.domain) ? 0.35 : 1"
                (pointerenter)="hovered.set(arc.domain)"
                (focus)="hovered.set(arc.domain)"
                (pointerleave)="hovered.set(null)"
                (blur)="hovered.set(null)"
                (click)="filter.toggleDomain(arc.domain)"
              >
                <span class="size-2.5 shrink-0 rounded-full" [style.background]="arc.colour"></span>
                <span class="min-w-0 flex-1 truncate text-start text-body-sm text-ink">{{
                  arc.label
                }}</span>
                <span class="tabular shrink-0 text-caption text-ink-muted">{{ arc.percent }}%</span>
                <span class="tabular w-24 shrink-0 text-end text-body-sm text-ink">{{
                  store.money(arc.spentMinor)
                }}</span>
              </button>
            </li>
          }
        </ul>
      </div>

      @if (store.hasUnfiledSpend()) {
        <p class="mt-3 text-caption text-ink-muted">
          A further {{ store.money(store.unfiledMinor()) }} was spent on documents that were never
          filed under an area, so it has no segment above.
        </p>
      }
    }
  `,
})
export class SpendArc {
  protected readonly store = inject(FinanceStore);
  protected readonly filter = inject(DashboardFilterStore);

  protected readonly radius = RADIUS;
  protected readonly hovered = signal<MatterDomain | null>(null);

  protected readonly arcs = computed<readonly Arc[]>(() => {
    let cumulative = 0;

    return this.store.slices().map((slice) => {
      const meta = DOMAIN_META[slice.domain];
      // A floor of 1 unit so a rounding-error slice is still a mark on the ring
      // rather than a gap the eye reads as a missing category.
      const length = Math.max(slice.share * CIRCUMFERENCE - GAP, 1);
      const arc: Arc = {
        domain: slice.domain,
        label: meta.label,
        emoji: meta.emoji,
        colour: meta.cssVar,
        spentMinor: slice.spentMinor,
        count: slice.count,
        percent: Math.round(slice.share * 100),
        dash: `${length} ${CIRCUMFERENCE - length}`,
        offset: -cumulative * CIRCUMFERENCE,
      };
      cumulative += slice.share;
      return arc;
    });
  });

  protected readonly active = computed(() => {
    const domain = this.hovered();
    return domain === null ? null : (this.arcs().find((arc) => arc.domain === domain) ?? null);
  });

  /**
   * Recede when something ELSE is being pointed at, or when the page's
   * cross-filter has settled on another domain. Both are the same statement —
   * "this is not what you are looking at" — so they get the same treatment.
   */
  protected dimmed(domain: MatterDomain): boolean {
    const hovered = this.hovered();
    if (hovered !== null) return hovered !== domain;
    const filtered = this.filter.domain();
    return filtered !== null && filtered !== domain;
  }

  protected summaryLabel(): string {
    return this.arcs()
      .map((arc) => `${arc.label} ${arc.percent}%`)
      .join(', ');
  }
}
