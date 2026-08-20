import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIME_ZONE,
  allTimeZones,
  clockIn,
  matchesZone,
  offsetLabel,
  zoneLabel,
} from './time-zones';

/** Inside Egyptian DST — Egypt runs +03:00 from late April to late October. */
const SUMMER = new Date('2026-08-20T09:00:00.000Z');

/** Outside it, where Egypt runs +02:00. */
const WINTER = new Date('2026-01-15T09:00:00.000Z');

describe('time zones', () => {
  it('defaults to Egypt, matching the server', () => {
    // The server writes this same id at signup and falls back to it in every
    // resolver. A drift between the two constants would make the "Egypt"
    // shortcut save a zone the server does not consider its default.
    expect(DEFAULT_TIME_ZONE).toBe('Africa/Cairo');
  });

  it('observes Egyptian daylight saving rather than a fixed offset', () => {
    // The reason the default is a NAMED zone. Egypt reinstated DST in 2023, so
    // a hardcoded +02:00 or +03:00 is wrong for about half of every year — and
    // wrong in the way that only surfaces months after it ships.
    expect(clockIn(DEFAULT_TIME_ZONE, SUMMER)).toBe('12:00');
    expect(clockIn(DEFAULT_TIME_ZONE, WINTER)).toBe('11:00');
  });

  it('reads the offset at the instant given, not from a table', () => {
    expect(offsetLabel(DEFAULT_TIME_ZONE, SUMMER)).toBe('GMT+3');
    expect(offsetLabel(DEFAULT_TIME_ZONE, WINTER)).toBe('GMT+2');
  });

  it('offers the runtime full zone table, including the default', () => {
    const zones = allTimeZones();

    expect(zones.length).toBeGreaterThan(100);
    expect(zones).toContain(DEFAULT_TIME_ZONE);
  });

  it('searches past the underscore in either direction', () => {
    // Someone typing "new york" must find America/New_York, and someone typing
    // "new_york" must too. Without the normalisation the underscore is an
    // invisible reason the search returns nothing for the city you live in.
    expect(matchesZone('America/New_York', 'new york')).toBe(true);
    expect(matchesZone('America/New_York', 'new_york')).toBe(true);
    expect(matchesZone('America/New_York', 'NEW YORK')).toBe(true);
    expect(matchesZone('America/New_York', 'berlin')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesZone('Africa/Cairo', '')).toBe(true);
    expect(matchesZone('Africa/Cairo', '   ')).toBe(true);
  });

  it('renders a zone id as something readable', () => {
    expect(zoneLabel('America/New_York')).toBe('America / New York');
    expect(zoneLabel('UTC')).toBe('UTC');
  });

  it('returns empty rather than throwing on a zone the runtime rejects', () => {
    // These feed a template. A TypeError from a label helper would take the
    // whole page down over one bad stored value.
    expect(offsetLabel('Mars/Olympus_Mons', SUMMER)).toBe('');
    expect(clockIn('Mars/Olympus_Mons', SUMMER)).toBe('');
  });
});
