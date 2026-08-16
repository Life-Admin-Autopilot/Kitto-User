import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import type { Outcome, Pipeline } from '@application/insights/insights-math';
import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import type { CaptureChannel, MatterDomain } from '@domain/matters/matter';
import { DOMAIN_META } from '@presentation/shared/domain-meta';

const WIDTH = 720;
const HEIGHT = 300;
const NODE_WIDTH = 11;
const NODE_GAP = 7;

/**
 * Room OUTSIDE the columns for the labels that belong there.
 *
 * Without it the outer columns had nowhere to write except inward, on top of
 * their own ribbons — so every label in the chart sat on a mid-tone fill at
 * roughly 1.5:1. The viewBox is extended into negative space rather than the
 * node coordinates being shifted, so the layout arithmetic below still reads in
 * plain 0..WIDTH terms.
 */
const PAD = { left: 74, right: 96, top: 10, bottom: 10 };

/**
 * A node thinner than this gets no label.
 *
 * Ten pixels is about one line of 10px text. Below that the labels of adjacent
 * nodes overlap each other faster than they become useful, and on a large
 * account the middle column would degenerate into a stack of overprinted words.
 * The rect and its tooltip still carry the value.
 */
const MIN_LABEL_HEIGHT = 10;

const CHANNEL_LABELS: Record<CaptureChannel, string> = {
  voice: 'Spoken',
  document: 'Scanned',
  connected: 'Synced',
  manual: 'Typed',
};

/**
 * "Late, untouched" rather than "Overdue".
 *
 * This node is late matters that have NEVER been rescheduled — anything moved
 * even once leaves through `Pushed` instead. The Overdue tile at the top of the
 * page counts both, so calling this one "Overdue" put two different numbers
 * under one word on a single screen, and the smaller one looked like a bug.
 */
const OUTCOME_LABELS: Record<Outcome, string> = {
  done: 'Done',
  onTrack: 'On track',
  pushed: 'Pushed',
  overdue: 'Late, untouched',
};

const OUTCOME_FILL: Record<Outcome, string> = {
  done: 'var(--color-success)',
  onTrack: 'var(--color-ink-subtle)',
  pushed: 'var(--color-warning)',
  overdue: 'var(--color-danger)',
};

interface Node {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly fill: string;
  readonly domain: MatterDomain | null;
}

interface Ribbon {
  readonly key: string;
  readonly path: string;
  readonly fill: string;
  readonly domain: MatterDomain | null;
  readonly title: string;
}

/**
 * How matters arrive, where they are filed, and what becomes of them.
 *
 * Three columns because that is the actual shape of the product — capture,
 * classify, resolve. One picture that explains the whole system to someone who
 * has never seen it, and every edge is a stored field: no inference, nothing
 * modelled.
 *
 * Hand-laid-out SVG rather than a charting library. A Sankey is about two
 * hundred lines of arithmetic and a cubic bezier; importing a library to draw
 * one would add far more weight than it saves, and none of them would know
 * about the domain tokens that make the ribbons mean something here.
 */
@Component({
  selector: 'app-pipeline-sankey',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pipeline().total === 0) {
      <p class="py-8 text-center text-body-sm text-ink-muted">No matters in this window.</p>
    } @else {
      <svg
        [attr.viewBox]="viewBox"
        class="w-full"
        role="img"
        aria-label="How matters arrive, where they are filed, and what becomes of them"
      >
        <!-- Ribbons first so nodes sit on top of them. -->
        @for (ribbon of ribbons(); track ribbon.key) {
          <path
            [attr.d]="ribbon.path"
            [attr.fill]="ribbon.fill"
            [attr.opacity]="ribbonOpacity(ribbon)"
          >
            <title>{{ ribbon.title }}</title>
          </path>
        }

        @for (node of nodes(); track node.key) {
          <g [attr.opacity]="nodeOpacity(node)">
            <rect
              [attr.x]="node.x"
              [attr.y]="node.y"
              [attr.width]="nodeWidth"
              [attr.height]="node.height"
              [attr.fill]="node.fill"
              rx="2"
            >
              <title>{{ node.label }} — {{ node.count }}</title>
            </rect>
            @if (node.height >= minLabelHeight) {
              <text
                [attr.x]="labelX(node)"
                [attr.y]="node.y + node.height / 2"
                [attr.text-anchor]="labelAnchor(node)"
                dominant-baseline="middle"
                class="chart-label fill-ink text-[10px]"
              >
                {{ node.label }}
              </text>
            }
          </g>
        }
      </svg>
    }
  `,
})
export class PipelineSankey {
  readonly pipeline = input.required<Pipeline>();

  private readonly filter = inject(DashboardFilterStore);

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly nodeWidth = NODE_WIDTH;
  protected readonly minLabelHeight = MIN_LABEL_HEIGHT;

  /** Extended into negative space so the outer labels have somewhere to live. */
  protected readonly viewBox = [
    -PAD.left,
    -PAD.top,
    WIDTH + PAD.left + PAD.right,
    HEIGHT + PAD.top + PAD.bottom,
  ].join(' ');

  private readonly columnX = [0, (WIDTH - NODE_WIDTH) / 2, WIDTH - NODE_WIDTH];

  /**
   * One scale for all three columns.
   *
   * Every matter appears exactly once per column, so the totals are identical —
   * but the columns hold different NUMBERS of nodes, so they lose different
   * amounts of height to gaps. Scaling each column to fill the canvas would
   * make a ribbon arrive thinner than it left, which reads as matters going
   * missing. The tightest column sets the scale and the others simply end
   * short.
   */
  private readonly scale = computed(() => {
    const pipeline = this.pipeline();
    if (pipeline.total === 0) return 0;
    const counts = [
      pipeline.channels.length,
      pipeline.domains.length,
      pipeline.outcomes.length,
    ];
    const tightest = Math.max(...counts);
    return (HEIGHT - NODE_GAP * (tightest - 1)) / pipeline.total;
  });

  protected readonly nodes = computed<Node[]>(() => {
    const pipeline = this.pipeline();
    const scale = this.scale();

    const channels = stack(
      pipeline.channels.map((entry) => ({
        key: `c:${entry.key}`,
        label: CHANNEL_LABELS[entry.key],
        count: entry.count,
        fill: 'var(--color-ink-subtle)',
        domain: null,
      })),
      this.columnX[0],
      scale,
    );

    const domains = stack(
      pipeline.domains.map((entry) => ({
        key: `d:${entry.key}`,
        label: DOMAIN_META[entry.key].label,
        count: entry.count,
        fill: DOMAIN_META[entry.key].cssVar,
        domain: entry.key,
      })),
      this.columnX[1],
      scale,
    );

    const outcomes = stack(
      pipeline.outcomes.map((entry) => ({
        key: `o:${entry.key}`,
        label: OUTCOME_LABELS[entry.key],
        count: entry.count,
        fill: OUTCOME_FILL[entry.key],
        domain: null,
      })),
      this.columnX[2],
      scale,
    );

    return [...channels, ...domains, ...outcomes];
  });

  protected readonly ribbons = computed<Ribbon[]>(() => {
    const pipeline = this.pipeline();
    const scale = this.scale();
    const byKey = new Map(this.nodes().map((node) => [node.key, node]));

    // Each node's edges are stacked in the order the links are drawn, tracked
    // separately for the left and right faces so a domain's inbound and
    // outbound ribbons both start at its top and grow down.
    const outgoing = new Map<string, number>();
    const incoming = new Map<string, number>();
    const ribbons: Ribbon[] = [];

    const draw = (
      fromKey: string,
      toKey: string,
      count: number,
      domain: MatterDomain | null,
      title: string,
    ) => {
      const from = byKey.get(fromKey);
      const to = byKey.get(toKey);
      if (!from || !to) return;

      const thickness = count * scale;
      const fromOffset = outgoing.get(fromKey) ?? 0;
      const toOffset = incoming.get(toKey) ?? 0;
      outgoing.set(fromKey, fromOffset + thickness);
      incoming.set(toKey, toOffset + thickness);

      ribbons.push({
        key: `${fromKey}->${toKey}`,
        path: ribbonPath(
          from.x + NODE_WIDTH,
          from.y + fromOffset,
          to.x,
          to.y + toOffset,
          thickness,
        ),
        fill: domain ? DOMAIN_META[domain].cssVar : 'var(--color-ink-subtle)',
        domain,
        title,
      });
    };

    for (const link of pipeline.arrivals) {
      draw(
        `c:${link.from}`,
        `d:${link.to}`,
        link.count,
        link.to,
        `${CHANNEL_LABELS[link.from]} → ${DOMAIN_META[link.to].label}: ${link.count}`,
      );
    }

    for (const link of pipeline.departures) {
      draw(
        `d:${link.from}`,
        `o:${link.to}`,
        link.count,
        link.from,
        `${DOMAIN_META[link.from].label} → ${OUTCOME_LABELS[link.to]}: ${link.count}`,
      );
    }

    return ribbons;
  });

  protected ribbonOpacity(ribbon: Ribbon): number {
    const active = this.filter.domain();
    if (!active) return 0.55;
    return ribbon.domain === active ? 0.85 : 0.08;
  }

  protected nodeOpacity(node: Node): number {
    const active = this.filter.domain();
    if (!active || !node.domain) return 1;
    return node.domain === active ? 1 : 0.25;
  }

  /**
   * Outer columns label OUTWARD, into the padding; the middle has no outside, so
   * it labels right and relies on the halo to stay readable over the ribbons.
   *
   * The previous version's comment said this, and its arithmetic did the
   * opposite: the left column was pushed to `NODE_WIDTH + 5`, which is inside
   * the canvas, and the right column to `node.x - 5` with an `end` anchor, which
   * runs back across its own ribbons. Every label in the chart was drawn on top
   * of the flows.
   */
  protected labelX(node: Node): number {
    return node.x === 0 ? -6 : node.x + NODE_WIDTH + 6;
  }

  protected labelAnchor(node: Node): string {
    return node.x === 0 ? 'end' : 'start';
  }
}

function stack(
  entries: readonly { key: string; label: string; count: number; fill: string; domain: MatterDomain | null }[],
  x: number,
  scale: number,
): Node[] {
  let y = 0;
  return entries.map((entry) => {
    const height = entry.count * scale;
    const node: Node = { ...entry, x, y, height };
    y += height + NODE_GAP;
    return node;
  });
}

/**
 * A ribbon: forward along the top edge, down the far face, back along the
 * bottom edge.
 *
 * Control points sit at the horizontal midpoint of both ends, which is what
 * gives the flat entry and exit angles — a ribbon that met its node at a slope
 * would look like it was sliding off.
 */
function ribbonPath(x1: number, y1: number, x2: number, y2: number, thickness: number): string {
  const mid = (x1 + x2) / 2;
  const y1b = y1 + thickness;
  const y2b = y2 + thickness;
  return [
    `M${x1},${y1}`,
    `C${mid},${y1} ${mid},${y2} ${x2},${y2}`,
    `L${x2},${y2b}`,
    `C${mid},${y2b} ${mid},${y1b} ${x1},${y1b}`,
    'Z',
  ].join(' ');
}
