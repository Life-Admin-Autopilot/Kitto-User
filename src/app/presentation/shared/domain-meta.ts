import type { MatterDomain, MatterPriority } from '@domain/matters/matter';

export interface DomainMeta {
  readonly label: string;
  /** The signature mark: an emoji in a pastel circle. */
  readonly emoji: string;
  /** Full literal class names — see the note below. */
  readonly bg: string;
  readonly ink: string;
  /** Raw token reference, for SVG fills where a utility class cannot reach. */
  readonly cssVar: string;
}

/**
 * Domain identity — label, emoji and the pastel pair.
 *
 * The class names are written out in full, never composed as
 * `` `bg-domain-${domain}` ``. Tailwind v4 finds classes by scanning source
 * text, so an interpolated name is invisible to it and the utility is simply
 * never generated — the element renders with no background at all and nothing
 * warns you. Every colour utility that varies by data has to appear literally
 * somewhere in the source, and this map is that somewhere.
 *
 * The pastels are theme-invariant on purpose (they are absent from `.dark` in
 * styles.css): this is the one place in the product where hue carries meaning,
 * and dimming it for dark mode would throw that meaning away.
 *
 * The emoji match the mobile app's exactly. A domain that is 🩺 on the phone
 * and 🏥 on the web is two products.
 */
export const DOMAIN_META: Record<MatterDomain, DomainMeta> = {
  health: {
    label: 'Health',
    emoji: '🩺',
    bg: 'bg-domain-health',
    ink: 'text-domain-health-ink',
    cssVar: 'var(--color-domain-health)',
  },
  home: {
    label: 'Home',
    emoji: '🏠',
    bg: 'bg-domain-home',
    ink: 'text-domain-home-ink',
    cssVar: 'var(--color-domain-home)',
  },
  car: {
    label: 'Car',
    emoji: '🚗',
    bg: 'bg-domain-car',
    ink: 'text-domain-car-ink',
    cssVar: 'var(--color-domain-car)',
  },
  finance: {
    label: 'Finance',
    emoji: '💳',
    bg: 'bg-domain-finance',
    ink: 'text-domain-finance-ink',
    cssVar: 'var(--color-domain-finance)',
  },
  family: {
    label: 'Family',
    emoji: '👨‍👩‍👧',
    bg: 'bg-domain-family',
    ink: 'text-domain-family-ink',
    cssVar: 'var(--color-domain-family)',
  },
  pets: {
    label: 'Pets',
    emoji: '🐾',
    bg: 'bg-domain-pets',
    ink: 'text-domain-pets-ink',
    cssVar: 'var(--color-domain-pets)',
  },
};

export interface PriorityMeta {
  readonly label: string;
  readonly chip: string;
}

/**
 * Priority chips.
 *
 * `normal` is deliberately quiet — surface-sunken rather than a tint. If every
 * priority carries a colour then none of them signals anything, and the two
 * that actually need to interrupt someone are urgent and high.
 */
export const PRIORITY_META: Record<MatterPriority, PriorityMeta> = {
  urgent: { label: 'Urgent', chip: 'bg-priority-high-soft text-priority-high' },
  high: { label: 'High', chip: 'bg-priority-med-soft text-priority-med' },
  normal: { label: 'Normal', chip: 'bg-surface-sunken text-ink-muted' },
  low: { label: 'Low', chip: 'bg-priority-low-soft text-priority-low' },
};
