/**
 * A matter — the central entity of the product.
 *
 * "Matter" is the product noun, not "task". The API calls the collection
 * `/me/tasks` for historical reasons and the UI has always said matters; the
 * mapper in the infrastructure layer is where the two names meet, and it is the
 * only place either name crosses over.
 *
 * This file imports nothing, by rule. It is the innermost layer: no Angular, no
 * RxJS, no HttpClient, no DTO shapes. Anything here must be true about a matter
 * regardless of how it arrived or how it is drawn.
 */

/** The six life-admin domains the whole product is organised around. */
export const MATTER_DOMAINS = ['health', 'home', 'car', 'finance', 'family', 'pets'] as const;
export type MatterDomain = (typeof MATTER_DOMAINS)[number];

export const MATTER_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type MatterPriority = (typeof MATTER_PRIORITIES)[number];

export const MATTER_STATUSES = ['open', 'done', 'snoozed'] as const;
export type MatterStatus = (typeof MATTER_STATUSES)[number];

/**
 * `reminder` fires at its due moment; `list` is passive and never fires.
 *
 * The distinction is load-bearing, not cosmetic: a reminder without a date is a
 * broken promise, and the server rejects one outright.
 */
export const MATTER_KINDS = ['reminder', 'list'] as const;
export type MatterKind = (typeof MATTER_KINDS)[number];

export type MatterConfidence = 'high' | 'medium' | 'low';

/**
 * Where a matter came from, when it did not come from this user typing it.
 * Drives the capture-mix panel on Insights, and — more importantly — tells the
 * calendar not to push an imported event back out to the service it arrived
 * from.
 */
export type MatterExternalSource =
  | 'google_calendar'
  | 'google_tasks'
  | 'apple_calendar'
  | 'apple_reminders'
  | 'ics_feed'
  | 'email_forward';

/**
 * How precisely the source specified the time.
 *
 * `dateOnly` — the source gave a date and no hour, so the time-of-day in
 * `dueAt` is the USER's default, not the source's. `floating` — the source gave
 * a wall clock with no zone, so ours was assumed.
 *
 * Both must stay visible wherever a time is drawn. A rendered time that looks
 * source-derived but is not is precisely the trust failure the product is built
 * to avoid, and a calendar grid is the surface most likely to imply a precision
 * that was never there.
 */
export type MatterTimePrecision = 'exact' | 'dateOnly' | 'floating';

export interface Subtask {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
}

/**
 * An AI-guessed (or user-corrected) window for how long a matter takes.
 *
 * Always a bucketed RANGE, never a single number — the width of the range is
 * how the system admits it is estimating. `source: 'user'` means a person set
 * it by hand and no AI pass may overwrite it. Absent on every matter created
 * before the feature existed, so every surface must render without it.
 */
export interface MatterEstimate {
  readonly minMinutes: number;
  readonly maxMinutes: number;
  readonly source: 'ai' | 'user';
}

/**
 * What a matter costs, when anyone said.
 *
 * Minor units, like every other money figure in this product — the exponent is a
 * property of the currency (JPY has none, KWD has three) and dividing belongs
 * with the formatter, not the model.
 *
 * `source: 'user'` means a person typed this figure, by hand or as the answer to
 * "how much is it?". Nothing may overwrite it with a guess. `direction` is what
 * keeps a refund from summing like a payment.
 *
 * Absent on most matters — an amount is the exception, not the rule — so every
 * surface must render without it.
 */
export interface MatterAmount {
  readonly amountMinor: number;
  readonly currency: string;
  readonly source: 'ai' | 'user';
  readonly direction: 'out' | 'in';
}

export interface MatterReminder {
  readonly at: string;
  readonly firedAt?: string;
  readonly kind: 'lead' | 'due' | 'ai';
}

export interface Matter {
  readonly id: string;
  readonly title: string;
  readonly domain: MatterDomain;
  readonly kind: MatterKind;
  readonly status: MatterStatus;
  readonly priority: MatterPriority;
  /** Derived server-side from the priority table so no client duplicates it. */
  readonly priorityRank: number;
  readonly tags: readonly string[];
  readonly subtasks: readonly Subtask[];
  readonly reminders: readonly MatterReminder[];
  readonly dueAt?: string;
  readonly notes?: string;
  readonly completedAt?: string;
  readonly snoozedUntil?: string;
  readonly confidence?: MatterConfidence;
  readonly estimate?: MatterEstimate;
  /** What it costs. See MatterAmount — absent on most matters. */
  readonly amount?: MatterAmount;
  readonly sourceVoiceNoteId?: string;
  readonly sourceDocumentId?: string;
  readonly externalSource?: MatterExternalSource;
  readonly timePrecision?: MatterTimePrecision;
  /**
   * How many times this matter has been pushed to a later date.
   *
   * A first-class counter on the model, which is unusual and worth using: it is
   * the only field that measures avoidance rather than activity, and it is what
   * the "what you keep pushing" panel on Insights is built from.
   */
  readonly rescheduleCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Where a matter's content actually came from.
 *
 * Derived rather than stored: the API carries three separate provenance fields
 * (`sourceVoiceNoteId`, `sourceDocumentId`, `externalSource`) and no single
 * answer, so the collapsing rule lives here — once — instead of in each panel
 * that asks the question.
 *
 * Order matters. A matter extracted from a scanned bill that was itself pulled
 * in from a calendar feed is a DOCUMENT capture; the feed only delivered the
 * envelope. Voice and document beat the connected services for the same reason.
 */
export type CaptureChannel = 'voice' | 'document' | 'connected' | 'manual';

export function captureChannelOf(matter: Matter): CaptureChannel {
  if (matter.sourceVoiceNoteId) return 'voice';
  if (matter.sourceDocumentId) return 'document';
  if (matter.externalSource) return 'connected';
  return 'manual';
}

/**
 * True when a rendered time carries less precision than it appears to.
 *
 * The calendar draws these differently — a hard block for `exact`, a soft
 * all-day band for anything else — because placing a `dateOnly` matter at
 * 09:00 states an hour nobody chose.
 */
export function hasAssumedTime(matter: Matter): boolean {
  return matter.timePrecision === 'dateOnly' || matter.timePrecision === 'floating';
}
