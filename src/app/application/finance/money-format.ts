/**
 * Minor units in, a string a person can check against paper out.
 *
 * The one piece of arithmetic the money panels are not allowed to do by hand.
 * Every amount on the wire is whole minor units, and how many of those make a
 * major unit is a property of the CURRENCY, not a constant: JPY has no minor
 * unit at all and KWD has three decimal places. Dividing everything by 100
 * renders ¥1,000 as ¥10 and 1.234 KWD as 12.340 — a wrong figure that looks
 * exactly as confident as a right one, in the one place this product can least
 * afford it.
 *
 * So the divisor is read off Intl's own ISO 4217 table, which is the same table
 * the server stores against. Two sides, one source, no hand-maintained list.
 *
 * Ported from the mobile app's `lib/i18n/numberFormat.ts` on purpose — the two
 * clients must render the same bill identically, and the way to guarantee that
 * is to share the rules rather than re-derive them.
 */

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(tag: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${tag}|${JSON.stringify(options)}`;
  const hit = formatters.get(key);
  if (hit) return hit;
  const made = new Intl.NumberFormat(tag, options);
  formatters.set(key, made);
  return made;
}

/**
 * Whether to abbreviate the currency symbol for this locale.
 *
 * Only in a left-to-right one. The narrow forms are Latin-script digraphs —
 * "E£" for EGP — and dropping one into an Arabic paragraph invites the bidi
 * algorithm to reorder it: "E£623" renders as "£E 623", which reads as British
 * pounds and is simply the wrong currency on screen. Arabic loses nothing by
 * opting out; its standard form "ج.م." is native, unambiguous and no wider.
 */
function narrowSymbolSuits(tag: string): boolean {
  return !tag.startsWith('ar');
}

function currencyOptions(currency: string, tag: string): Intl.NumberFormatOptions {
  return narrowSymbolSuits(tag)
    ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }
    : { style: 'currency', currency };
}

/**
 * How many minor units make one major unit of `currency`.
 *
 * `maximumFractionDigits` is optional in the type even though the currency style
 * always resolves it. The `?? 2` is there so a runtime that omits it produces a
 * plausible figure rather than `10 ** undefined` = NaN, which would render every
 * amount on the page as "NaN".
 */
function minorUnitsPerMajor(currency: string, tag: string): number {
  const digits = formatter(tag, { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits;
  return 10 ** (digits ?? 2);
}

/**
 * The last line of defence against a currency code Intl will not accept.
 *
 * Codes reach this client from a vision pass over a scanned bill. The server
 * stores what it read, and "EG" or "£" is not a thing `Intl.NumberFormat` will
 * take — it throws a RangeError, which inside a template expression takes the
 * whole Insights page down. So an unusable code degrades to the raw code beside
 * a plainly formatted number: still checkable, still honest about the currency,
 * and no panel disappears over it.
 */
function fallback(minor: number, currency: string, tag: string): string {
  const amount = formatter(tag, { maximumFractionDigits: 2 }).format(minor / 100);
  return `${currency} ${amount}`;
}

/** Exact, to the cent — what every row and every tooltip shows. */
export function formatMoney(minor: number, currency: string, tag: string): string {
  try {
    return formatter(tag, currencyOptions(currency, tag)).format(
      minor / minorUnitsPerMajor(currency, tag),
    );
  } catch {
    return fallback(minor, currency, tag);
  }
}

/**
 * Rounded to the major unit — for the headline figures.
 *
 * A six-figure sum rendered to the cent spends its two most prominent characters
 * on precision nobody reads at a glance, and every row underneath still carries
 * the exact amount.
 */
export function formatMoneyRounded(minor: number, currency: string, tag: string): string {
  try {
    return formatter(tag, {
      ...currencyOptions(currency, tag),
      maximumFractionDigits: 0,
    }).format(minor / minorUnitsPerMajor(currency, tag));
  } catch {
    return fallback(minor, currency, tag);
  }
}

/**
 * Rounded AND abbreviated — "E£12K" — for labels that sit inside a chart.
 *
 * Compact notation only, never on a figure the reader is meant to check. An
 * axis tick exists to give a bar a sense of scale; a total someone might compare
 * against a bank statement gets `formatMoney` and all of its digits.
 */
export function formatMoneyCompact(minor: number, currency: string, tag: string): string {
  try {
    return formatter(tag, {
      ...currencyOptions(currency, tag),
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(minor / minorUnitsPerMajor(currency, tag));
  } catch {
    return fallback(minor, currency, tag);
  }
}
