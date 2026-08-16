/**
 * Wall-clock arithmetic in a named IANA zone. Pure; no framework, no I/O.
 *
 * `setHours(9)` operates in the BROWSER's zone, which is the wrong zone for
 * this product. The account carries an explicit timezone precisely because
 * someone can set Europe/Berlin while travelling, and the server schedules
 * reminders against that field — so a snooze computed on the laptop's clock
 * fires at the wrong hour for exactly the users who care most.
 */

/**
 * How far the named zone is from UTC at a given instant, in milliseconds.
 *
 * Derived by formatting the instant INTO the zone and reading the parts back as
 * if they were UTC. That difference is the offset, and it is correct across
 * daylight-saving boundaries because it is measured at the instant in question
 * rather than assumed from a table.
 */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    // `hour12: false` renders midnight as 24 in some engines, which would push
    // the date forward by a day if taken literally.
    read('hour') % 24,
    read('minute'),
    read('second'),
  );

  return asUtc - at.getTime();
}

/**
 * The ISO instant for a given wall-clock hour, N days from now, in `timeZone`.
 *
 * The offset is resolved twice: once for the naive guess and once for the
 * instant that guess produced. Without the second pass a snooze set on the day
 * a zone changes its clocks lands an hour out — the offset that applies is the
 * one at the TARGET moment, not the one in force now.
 */
export function wallClockFromNow(
  daysAhead: number,
  hour: number,
  timeZone: string,
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const [year, month, day] = parts.split('-').map(Number);

  const naive = Date.UTC(year, month - 1, day + daysAhead, hour, 0, 0);
  const firstPass = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
  const corrected = new Date(naive - zoneOffsetMs(firstPass, timeZone));

  return corrected.toISOString();
}
