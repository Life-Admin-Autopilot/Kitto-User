import { describe, expect, it } from 'vitest';

import { formatMoney, formatMoneyCompact, formatMoneyRounded } from './money-format';

/**
 * These tests exist for one bug: dividing every currency by 100.
 *
 * It is the most plausible mistake in this file and the least visible one — the
 * page still renders, the number is still formatted, and it is simply wrong by a
 * factor of a hundred for anyone holding yen. The assertions below check the
 * DIGITS rather than the symbol, because the symbol an ICU build picks is not
 * this module's contract and pinning it would make the suite fail on a runtime
 * difference that harms nobody.
 */
describe('formatMoney', () => {
  it('divides by the currency’s own minor unit, not by 100', () => {
    // JPY has no minor unit: 1000 on the wire is ¥1,000, not ¥10.
    expect(formatMoney(1000, 'JPY', 'en-GB')).toContain('1,000');
    // KWD has three places: 1234 fils is 1.234 dinars, not 12.34.
    expect(formatMoney(1234, 'KWD', 'en-GB')).toContain('1.234');
    // The ordinary two-place case still works.
    expect(formatMoney(123456, 'USD', 'en-GB')).toContain('1,234.56');
  });

  it('rounds the headline to whole major units', () => {
    const rounded = formatMoneyRounded(123456, 'USD', 'en-GB');
    expect(rounded).toContain('1,235');
    expect(rounded).not.toContain('.56');
  });

  it('abbreviates only where the reader is not meant to check the figure', () => {
    // Case-insensitive: whether ICU abbreviates a thousand as "K" or "k" is its
    // business, not this module's contract.
    expect(formatMoneyCompact(1234500, 'USD', 'en-GB')).toMatch(/12(\.3)?k/i);
  });

  it('degrades to the raw code rather than throwing on a currency Intl rejects', () => {
    // Codes arrive from a vision pass over a scanned bill. A RangeError here
    // would propagate out of a template expression and take the whole Insights
    // page down over one unreadable receipt.
    const output = formatMoney(123456, 'NOT-A-CODE', 'en-GB');
    expect(output).toContain('NOT-A-CODE');
    expect(output).toContain('1,234.56');
  });

  it('keeps the currency unambiguous in Arabic', () => {
    // The narrow forms are Latin digraphs — "E£" — and the bidi algorithm
    // reorders them inside Arabic text into a different currency entirely.
    expect(formatMoney(100000, 'EGP', 'ar-EG')).not.toContain('E£');
  });
});
