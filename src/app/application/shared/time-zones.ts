/**
 * The IANA zones this dashboard offers, and how to label one.
 *
 * Read from the runtime rather than shipped as a list. A hand-kept array of 400
 * names is a file that goes stale the next time a country renames a zone or
 * splits one, and it would be the second copy of a table the browser already
 * has — the server validates against ICU's set too, so a name from anywhere
 * else is a 400 waiting to happen.
 */

/** The product's default, mirroring the server's `AppTimeZone.DefaultId`. */
export const DEFAULT_TIME_ZONE = 'Africa/Cairo';

/** What the browser thinks it is in. Always resolves; never throws. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Every zone the runtime knows, ascending.
 *
 * `supportedValuesOf` is ES2022 and present in every browser this dashboard
 * targets, but it is still probed rather than called: a WebView without it
 * would otherwise throw a TypeError during render and take the whole page down
 * over a picker. Falling back to the three zones we can name for certain leaves
 * a usable, if short, list.
 */
export function allTimeZones(): readonly string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;

  try {
    if (supported) return supported('timeZone');
  } catch {
    /* fall through to the short list */
  }

  return [...new Set([DEFAULT_TIME_ZONE, deviceTimeZone(), 'UTC'])].sort();
}

/**
 * `GMT+3` — the offset a zone is on RIGHT NOW.
 *
 * Shown beside every row because a zone id is not something most people can
 * convert in their head, and the offset is the part they are actually choosing.
 * It is resolved at the current instant rather than from a table, so a zone in
 * daylight saving reads as the offset it is on today, not its winter one.
 */
export function offsetLabel(zone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/**
 * The local wall clock in a zone, as `14:23`.
 *
 * The confirmation that the chosen row is the right one. An offset tells you
 * the arithmetic; the time tells you whether you believe it.
 */
export function clockIn(zone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
  } catch {
    return '';
  }
}

/** `Africa/Cairo` → `Africa / Cairo`, which is readable at a glance in a long list. */
export function zoneLabel(zone: string): string {
  return zone.replace(/_/g, ' ').replace(/\//g, ' / ');
}

/**
 * Rank zones against a search term.
 *
 * Substring, case-insensitive, and underscore-insensitive both ways — someone
 * typing "new york" must find `America/New_York`, and someone typing "new_york"
 * must too. Without the normalisation the underscore is an invisible reason the
 * search returns nothing for the city the user is sitting in.
 */
export function matchesZone(zone: string, query: string): boolean {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '_');
  if (!needle) return true;
  return zone.toLowerCase().includes(needle);
}
