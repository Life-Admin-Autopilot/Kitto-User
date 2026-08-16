import {
  MATTER_DOMAINS,
  captureChannelOf,
  type CaptureChannel,
  type Matter,
  type MatterDomain,
} from '@domain/matters/matter';
import { DAYS_IN_WEEK, addDays, dayKey, startOfDay } from '@application/calendar/calendar-month';

/**
 * Every aggregation the Insights page draws, as pure functions.
 *
 * Separated from the store so each one can be reasoned about — and tested —
 * without Angular, a repository or a network. The store's job is to decide
 * WHICH matters to feed in; these decide what the shapes mean.
 */

// ---------------------------------------------------------------------------
// Weekly completion buckets
// ---------------------------------------------------------------------------

export interface WeekBucket {
  readonly start: Date;
  readonly end: Date;
  readonly completed: number;
}

/**
 * Rolling seven-day buckets counted back from `now`, oldest first.
 *
 * Not ISO calendar weeks. The last bucket is then always a full seven days
 * ending today and is directly comparable with the one before it; an ISO week
 * would leave the final bar covering however many days have passed since
 * Monday, so the chart would understate the present every day except Sunday.
 */
export function bucketByWeek(matters: readonly Matter[], now: Date, weeks: number): WeekBucket[] {
  const buckets: WeekBucket[] = [];

  for (let index = weeks - 1; index >= 0; index--) {
    const end = addDays(now, -index * 7 + 1);
    const start = addDays(end, -7);
    const completed = matters.filter((matter) => {
      if (!matter.completedAt) return false;
      const at = new Date(matter.completedAt).getTime();
      return at >= start.getTime() && at < end.getTime();
    }).length;
    buckets.push({ start, end, completed });
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Year heatmap
// ---------------------------------------------------------------------------

export interface HeatCell {
  readonly date: Date;
  readonly count: number;
  /** The domain that contributed most that day, for the cell's tint. */
  readonly domain: MatterDomain | null;
  /** False for cells before the window starts — drawn, but not part of the data. */
  readonly inRange: boolean;
}

export interface HeatmapGrid {
  /** Week columns, each seven cells, starting on the locale's first weekday. */
  readonly columns: readonly (readonly HeatCell[])[];
  /** Column index → month label, only where the month changes. */
  readonly monthLabels: readonly { column: number; label: string }[];
  /** The seven weekday names, in the locale's own week order. */
  readonly weekdays: readonly string[];
  readonly busiestDay: number;
}

/**
 * Which timestamp a day is counted against.
 *
 * These are different questions and mixing them produces a picture that means
 * nothing: `due` asks "what landed on me that day", `completed` asks "what did
 * I actually clear". The first version of this silently used
 * `completedAt ?? dueAt`, which put a matter due in July but finished in August
 * on an August square while its neighbour sat on its July due date — two
 * different meanings in one grid, with no way for a reader to know which was
 * which.
 */
export type HeatmapMode = 'due' | 'completed';

/**
 * A year of days, laid out as real weeks.
 *
 * WEEK-ALIGNED, which the first version was not. Starting the grid exactly 364
 * days before today puts an arbitrary weekday in the top row, so the rows are
 * not weekdays and the columns are not weeks — the shape reads as a contribution
 * graph and then answers none of the questions one can. Here the grid starts on
 * the locale's first weekday on or before the window, so every column is a real
 * week and every row is a real weekday, and both can be labelled.
 *
 * Colour carries DOMAIN, not volume. Volume is what the weekly bar chart
 * answers, and it answers it better; the question only a year can answer is
 * "when was my life about the car, and when was it about money".
 */
export function buildHeatmap(
  matters: readonly Matter[],
  now: Date,
  weeks: number,
  weekStart: number,
  mode: HeatmapMode,
  monthFormatter: Intl.DateTimeFormat,
  weekdayFormatter: Intl.DateTimeFormat,
): HeatmapGrid {
  const byDay = new Map<string, Matter[]>();
  for (const matter of matters) {
    const stamp = mode === 'completed' ? matter.completedAt : matter.dueAt;
    if (!stamp) continue;
    const at = new Date(stamp);
    if (Number.isNaN(at.getTime())) continue;
    const key = dayKey(at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(matter);
    else byDay.set(key, [matter]);
  }

  const today = startOfDay(now);
  // Back up to the first weekday of THIS week, then back `weeks - 1` more so
  // today lands in the final column.
  const lead = (today.getDay() - weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const gridStart = addDays(today, -lead - (weeks - 1) * DAYS_IN_WEEK);

  const columns: HeatCell[][] = [];
  const monthLabels: { column: number; label: string }[] = [];
  let busiestDay = 0;
  let lastMonth = -1;

  for (let week = 0; week < weeks; week++) {
    const column: HeatCell[] = [];
    for (let day = 0; day < DAYS_IN_WEEK; day++) {
      const date = addDays(gridStart, week * DAYS_IN_WEEK + day);
      const onThisDay = byDay.get(dayKey(date)) ?? [];
      busiestDay = Math.max(busiestDay, onThisDay.length);
      column.push({
        date,
        count: onThisDay.length,
        domain: dominantDomain(onThisDay),
        // Future days are drawn so the grid stays rectangular, but they are not
        // data — an empty square for next Tuesday must not read as "a quiet day".
        inRange: date.getTime() <= today.getTime(),
      });
    }
    columns.push(column);

    // Label a column when its week introduces a new month. Checked on the
    // column's FIRST day so a label never lands mid-month.
    const month = column[0].date.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ column: week, label: monthFormatter.format(column[0].date) });
      lastMonth = month;
    }
  }

  const weekdays = Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
    weekdayFormatter.format(addDays(gridStart, index)),
  );

  return { columns, monthLabels: spaceLabels(monthLabels), weekdays, busiestDay };
}

/**
 * The narrowest column gap a month label can survive.
 *
 * A column is 14px and a short month name is roughly 20px, so two labels closer
 * than three columns overprint into an unreadable smudge.
 */
const MIN_LABEL_COLUMNS = 3;

/**
 * Drop a month label that would collide with the next one, keeping the LATER.
 *
 * This only ever fires at the left edge, and only because the grid begins on a
 * week boundary: a grid starting on 28 July puts "Jul" on column 0 and "Aug" on
 * column 1, fourteen pixels apart. Keeping the later label is the right way
 * round — the leading month owns one part-column, the one after it owns four or
 * five, so the label that survives is the one describing most of what is drawn.
 */
function spaceLabels(
  labels: readonly { column: number; label: string }[],
): { column: number; label: string }[] {
  return labels.filter(
    (entry, index) =>
      index === labels.length - 1 || labels[index + 1].column - entry.column >= MIN_LABEL_COLUMNS,
  );
}

function dominantDomain(matters: readonly Matter[]): MatterDomain | null {
  if (matters.length === 0) return null;
  const tally = new Map<MatterDomain, number>();
  for (const matter of matters) {
    tally.set(matter.domain, (tally.get(matter.domain) ?? 0) + 1);
  }
  let winner: MatterDomain = MATTER_DOMAINS[0];
  let best = -1;
  for (const domain of MATTER_DOMAINS) {
    const count = tally.get(domain) ?? 0;
    if (count > best) {
      best = count;
      winner = domain;
    }
  }
  return best > 0 ? winner : null;
}

// ---------------------------------------------------------------------------
// The pipeline (Sankey)
// ---------------------------------------------------------------------------

export type Outcome = 'done' | 'pushed' | 'overdue' | 'onTrack';

export interface FlowLink<From extends string, To extends string> {
  readonly from: From;
  readonly to: To;
  readonly count: number;
}

export interface Pipeline {
  readonly total: number;
  readonly channels: readonly { key: CaptureChannel; count: number }[];
  readonly domains: readonly { key: MatterDomain; count: number }[];
  readonly outcomes: readonly { key: Outcome; count: number }[];
  readonly arrivals: readonly FlowLink<CaptureChannel, MatterDomain>[];
  readonly departures: readonly FlowLink<MatterDomain, Outcome>[];
}

/**
 * How matters arrive, where they are filed, and what becomes of them.
 *
 * Three stages because that is the actual shape of the product — capture,
 * classify, resolve — and drawing it makes the whole system legible to someone
 * who has never seen it. Every edge is a field already stored; nothing here is
 * inferred.
 */
export function buildPipeline(matters: readonly Matter[], now: Date): Pipeline {
  const arrivals = new Map<string, number>();
  const departures = new Map<string, number>();
  const channels = new Map<CaptureChannel, number>();
  const domains = new Map<MatterDomain, number>();
  const outcomes = new Map<Outcome, number>();

  for (const matter of matters) {
    const channel = captureChannelOf(matter);
    const outcome = outcomeOf(matter, now);

    channels.set(channel, (channels.get(channel) ?? 0) + 1);
    domains.set(matter.domain, (domains.get(matter.domain) ?? 0) + 1);
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);

    const arrivalKey = `${channel} ${matter.domain}`;
    arrivals.set(arrivalKey, (arrivals.get(arrivalKey) ?? 0) + 1);

    const departureKey = `${matter.domain} ${outcome}`;
    departures.set(departureKey, (departures.get(departureKey) ?? 0) + 1);
  }

  return {
    total: matters.length,
    channels: [...channels.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    domains: MATTER_DOMAINS.filter((d) => domains.has(d)).map((key) => ({
      key,
      count: domains.get(key) ?? 0,
    })),
    outcomes: (['done', 'onTrack', 'pushed', 'overdue'] as Outcome[])
      .filter((o) => outcomes.has(o))
      .map((key) => ({ key, count: outcomes.get(key) ?? 0 })),
    arrivals: splitLinks(arrivals) as FlowLink<CaptureChannel, MatterDomain>[],
    departures: splitLinks(departures) as FlowLink<MatterDomain, Outcome>[],
  };
}

function splitLinks(map: Map<string, number>): FlowLink<string, string>[] {
  return [...map.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split(' ');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * `pushed` outranks `overdue` deliberately.
 *
 * A matter that is both late AND has been moved four times is a story about
 * avoidance, not about a deadline — filing it under "overdue" would hide it
 * among things that are merely late.
 */
export function outcomeOf(matter: Matter, now: Date): Outcome {
  if (matter.status === 'done') return 'done';
  if (matter.rescheduleCount > 0) return 'pushed';
  if (matter.dueAt && new Date(matter.dueAt).getTime() < now.getTime()) return 'overdue';
  return 'onTrack';
}

// ---------------------------------------------------------------------------
// Gravity — what is sinking
// ---------------------------------------------------------------------------

export interface GravityPoint {
  readonly matter: Matter;
  readonly daysOverdue: number;
  readonly pushes: number;
}

/**
 * Open matters positioned by how late they are against how often they have been
 * moved.
 *
 * Only matters that are actually sinking — late, or pushed at least once.
 * Including everything would put a dense cloud at the origin and bury the
 * handful of points that are the entire message.
 */
export function buildGravity(
  matters: readonly Matter[],
  now: Date,
  /** The real clock. `now` is a local midnight, which is not when "late" starts. */
  instant: Date = new Date(),
): GravityPoint[] {
  const points: GravityPoint[] = [];

  for (const matter of matters) {
    if (matter.status === 'done' || !matter.dueAt) {
      // An undated matter cannot be late, but it can still be pushed.
      if (matter.status !== 'done' && matter.rescheduleCount > 0) {
        points.push({ matter, daysOverdue: 0, pushes: matter.rescheduleCount });
      }
      continue;
    }

    const due = new Date(matter.dueAt).getTime();
    // Overdue is measured against the real instant, then EXPRESSED in whole
    // days. Measuring in whole days from local midnight silently dropped
    // everything less than a day late — a bill that went overdue at 09:00 this
    // morning floored to zero and vanished from a chart about lateness.
    const isLate = due < instant.getTime();
    if (!isLate && matter.rescheduleCount === 0) continue;

    points.push({
      matter,
      daysOverdue: isLate ? Math.max(0, Math.floor((now.getTime() - due) / 86_400_000)) : 0,
      pushes: matter.rescheduleCount,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// "What if I did nothing?"
// ---------------------------------------------------------------------------

export interface ProjectionDay {
  readonly date: Date;
  /** Matters falling due on this day. */
  readonly falling: number;
  /** Everything overdue by end of this day, if nothing is completed. */
  readonly cumulative: number;
}

/**
 * The cost of inaction, day by day.
 *
 * Pure `dueAt` arithmetic — no model, no estimate, nothing that could be wrong.
 * It starts from what is ALREADY overdue rather than from zero, because a
 * projection that opens at zero implies a clean slate the person does not have.
 */
export function projectInaction(
  matters: readonly Matter[],
  now: Date,
  days: number,
): ProjectionDay[] {
  const open = matters.filter((matter) => matter.status !== 'done');

  let running = open.filter(
    (matter) => matter.dueAt && new Date(matter.dueAt).getTime() < now.getTime(),
  ).length;

  const projection: ProjectionDay[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(startOfDay(now), offset);
    const next = addDays(date, 1);
    const falling = open.filter((matter) => {
      if (!matter.dueAt) return false;
      const at = new Date(matter.dueAt).getTime();
      return at >= Math.max(date.getTime(), now.getTime()) && at < next.getTime();
    }).length;
    running += falling;
    projection.push({ date, falling, cumulative: running });
  }

  return projection;
}

// ---------------------------------------------------------------------------
// Workload
// ---------------------------------------------------------------------------

/**
 * Estimated minutes of REMAINING work for a day, as a midpoint.
 *
 * Completed matters are excluded, which the first version got wrong: the
 * pressure map counted them, so clearing a heavy day left it exactly as dark as
 * before. A workload map that never responds to work is worse than none — it
 * teaches the user their effort does not register.
 *
 * The model stores a RANGE because the width is how it admits it is guessing.
 * A calendar cell has room for one number, so the midpoint is what it gets, and
 * matters with no estimate contribute nothing rather than a made-up default —
 * quietly turning "unknown" into "quick" is the wrong way to be wrong.
 */
export function estimatedMinutes(matters: readonly Matter[]): number {
  return matters.reduce((total, matter) => {
    if (matter.status === 'done' || !matter.estimate) return total;
    return total + (matter.estimate.minMinutes + matter.estimate.maxMinutes) / 2;
  }, 0);
}
