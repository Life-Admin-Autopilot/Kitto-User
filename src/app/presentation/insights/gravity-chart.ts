import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { GravityPoint } from '@application/insights/insights-math';
import type { MatterPriority } from '@domain/matters/matter';
import { DOMAIN_META } from '@presentation/shared/domain-meta';

const WIDTH = 460;
const HEIGHT = 260;

/**
 * `top` is 22, not 12, to leave the axis title a line of its own.
 *
 * At 12 the "pushes" caption was drawn at the same height as the topmost tick
 * label and starting to its left, so the two overprinted and the caption ran on
 * across the y axis into the plot area.
 */
const PAD = { top: 22, right: 14, bottom: 26, left: 34 };

/** Bubble radius by priority. Urgent is not much bigger — size is the weakest
 *  visual channel and overdoing it turns the chart into a cartoon. */
const RADIUS: Record<MatterPriority, number> = { urgent: 9, high: 7, normal: 5, low: 4 };

interface Bubble {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly fill: string;
  readonly title: string;
}

/**
 * What is sinking.
 *
 * Days overdue on one axis, times rescheduled on the other. The bottom-right is
 * where avoidance lives — things that are both very late and have been moved
 * repeatedly — and putting those two numbers on the same picture says something
 * neither says alone: a matter that is 40 days late and never touched was
 * forgotten, while one 12 days late and pushed six times is being avoided.
 * Those need different responses.
 *
 * `rescheduleCount` is a first-class field on the model, which almost no
 * product stores. This chart is the reason it is worth having.
 */
@Component({
  selector: 'app-gravity-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (points().length === 0) {
      <p class="py-8 text-center text-body-sm text-ink-muted">
        Nothing is late or repeatedly moved.
      </p>
    } @else {
      <svg
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        class="w-full"
        role="img"
        aria-label="Open matters by days overdue against times rescheduled"
      >
        <!-- Axes, drawn as two hairlines rather than a full frame: a box around
             a scatter adds four lines and no information. -->
        <line
          [attr.x1]="pad.left"
          [attr.y1]="height - pad.bottom"
          [attr.x2]="width - pad.right"
          [attr.y2]="height - pad.bottom"
          stroke="var(--color-hairline)"
        />
        <line
          [attr.x1]="pad.left"
          [attr.y1]="pad.top"
          [attr.x2]="pad.left"
          [attr.y2]="height - pad.bottom"
          stroke="var(--color-hairline)"
        />

        <!-- 11px, not 9px. The viewBox is scaled DOWN to the column width, so
             every size here renders smaller than it reads in the source; 9px
             arrived at roughly 8.4px, and in ink-subtle that is about 2:1
             against the card. Axis ticks are the labels a reader needs most and
             they were the smallest, faintest thing on the page. -->
        @for (tick of xTicks(); track tick.value) {
          <text
            [attr.x]="tick.x"
            [attr.y]="height - pad.bottom + 15"
            text-anchor="middle"
            class="fill-ink-muted text-[11px]"
          >
            {{ tick.value }}
          </text>
        }
        @for (tick of yTicks(); track tick.value) {
          <text
            [attr.x]="pad.left - 6"
            [attr.y]="tick.y"
            text-anchor="end"
            dominant-baseline="middle"
            class="fill-ink-muted text-[11px]"
          >
            {{ tick.value }}
          </text>
        }

        <text
          [attr.x]="(width + pad.left) / 2"
          [attr.y]="height - 2"
          text-anchor="middle"
          class="fill-ink-muted text-[11px]"
        >
          days overdue
        </text>
        <!-- On its own line above the plot, where it cannot collide with the
             topmost y tick. -->
        <text [attr.x]="2" [attr.y]="10" class="fill-ink-muted text-[11px]">pushes</text>

        @for (bubble of bubbles(); track bubble.key) {
          <circle
            [attr.cx]="bubble.cx"
            [attr.cy]="bubble.cy"
            [attr.r]="bubble.r"
            [attr.fill]="bubble.fill"
            opacity="0.75"
          >
            <title>{{ bubble.title }}</title>
          </circle>
        }
      </svg>
    }
  `,
})
export class GravityChart {
  readonly points = input.required<readonly GravityPoint[]>();
  readonly locale = input('en-GB');

  private readonly number = computed(() => new Intl.NumberFormat(this.locale()));

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly pad = PAD;

  /**
   * Axis maxima, floored so a nearly-empty chart still has sensible gridlines.
   *
   * Without the floor, one matter three days late would fill the entire x-axis
   * and read as a catastrophe.
   */
  private readonly maxDays = computed(() =>
    Math.max(14, ...this.points().map((point) => point.daysOverdue)),
  );

  private readonly maxPushes = computed(() =>
    Math.max(3, ...this.points().map((point) => point.pushes)),
  );

  protected readonly bubbles = computed<Bubble[]>(() =>
    this.points().map((point) => ({
      key: point.matter.id,
      cx: this.xFor(point.daysOverdue),
      cy: this.yFor(point.pushes),
      r: RADIUS[point.matter.priority],
      fill: DOMAIN_META[point.matter.domain].cssVar,
      title: `${point.matter.title} — ${this.number().format(point.daysOverdue)}d late, moved ${this.number().format(point.pushes)}×`,
    })),
  );

  protected readonly xTicks = computed(() => {
    const max = this.maxDays();
    return [0, Math.round(max / 2), max].map((value) => ({ value, x: this.xFor(value) }));
  });

  protected readonly yTicks = computed(() => {
    const max = this.maxPushes();
    return [0, max].map((value) => ({ value, y: this.yFor(value) }));
  });

  private xFor(days: number): number {
    const usable = WIDTH - PAD.left - PAD.right;
    return PAD.left + (days / this.maxDays()) * usable;
  }

  private yFor(pushes: number): number {
    const usable = HEIGHT - PAD.top - PAD.bottom;
    return HEIGHT - PAD.bottom - (pushes / this.maxPushes()) * usable;
  }
}
