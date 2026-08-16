import type { CaptureChannel, Matter, MatterExternalSource } from '@domain/matters/matter';

/**
 * Where a matter came from, said plainly.
 *
 * This exists because "is that Google Calendar?" is a question the dashboard
 * was forcing people to ask. The backend imports Google Calendar events, Google
 * Tasks and subscribed .ics feeds AS MATTERS — so a synced meeting sat in the
 * table and on the grid looking exactly like something the user had created,
 * with nothing anywhere to say otherwise.
 *
 * A matter you cannot attribute is a matter you cannot trust, and on a calendar
 * that also means you cannot tell what would happen if you deleted it.
 */
const EXTERNAL_LABELS: Record<MatterExternalSource, string> = {
  google_calendar: 'Google Calendar',
  google_tasks: 'Google Tasks',
  apple_calendar: 'Apple Calendar',
  apple_reminders: 'Apple Reminders',
  ics_feed: 'Calendar feed',
  email_forward: 'Forwarded email',
};

const CHANNEL_LABELS: Record<CaptureChannel, string> = {
  voice: 'Spoken',
  document: 'Scanned',
  connected: 'Synced',
  manual: 'Typed',
};

/**
 * The most specific true statement about a matter's origin.
 *
 * Prefers the named service over the generic channel: "Google Calendar" answers
 * the question, "Synced" only renames it.
 */
export function sourceLabel(matter: Matter, channel: CaptureChannel): string {
  if (matter.externalSource) return EXTERNAL_LABELS[matter.externalSource];
  return CHANNEL_LABELS[channel];
}

/** True when the matter arrived from a connected service rather than from here. */
export function isImported(matter: Matter): boolean {
  return matter.externalSource !== undefined;
}
