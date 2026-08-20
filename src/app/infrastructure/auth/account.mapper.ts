import type { Account } from '@domain/auth/session';

/**
 * The wire shape of an account, and the one function that turns it into the
 * domain's.
 *
 * Extracted from `http-auth.repository.ts` when the profile adapter arrived:
 * `PATCH /me` echoes the same `user` object `POST /auth/signin` does, and two
 * adapters mapping it independently is how the two drift. A field added to one
 * copy and not the other reads as `undefined` on whichever surface happened to
 * fetch through the other adapter, which is a bug with no error attached to it.
 */
export interface AccountDto {
  id: string;
  email: string;
  pendingEmail?: string;
  hasPassword?: boolean;
  displayName?: string;
  preferredDomains?: string[];
  hasOnboarded?: boolean;
  onboardingAnswers?: { id: string; question: string; answer: string }[];
  emailVerifiedAt?: string;
  timezone?: string;
  timezoneFollowsDevice?: boolean;
  locale?: string;
  localeFollowsDevice?: boolean;
  theme?: 'system' | 'light' | 'dark';
  subscription?: { tier: 'free' | 'pro'; renewsAt?: string; canceledAt?: string };
  createdAt: string;
  updatedAt: string;
}

/**
 * Map the wire account onto the domain account.
 *
 * The defaults matter. `preferredDomains` and `hasOnboarded` are optional on
 * the wire but not in the domain, because every surface that reads them would
 * otherwise need its own `?? []` — and one of them would forget. Defaulting
 * once, here, is the difference between a missing field being a mapping detail
 * and it being a runtime crash three components deep.
 */
export function toAccount(dto: AccountDto): Account {
  return {
    id: dto.id,
    email: dto.email,
    pendingEmail: dto.pendingEmail,
    hasPassword: dto.hasPassword,
    displayName: dto.displayName,
    preferredDomains: dto.preferredDomains ?? [],
    hasOnboarded: dto.hasOnboarded ?? false,
    onboardingAnswers: dto.onboardingAnswers,
    emailVerifiedAt: dto.emailVerifiedAt,
    timezone: dto.timezone,
    timezoneFollowsDevice: dto.timezoneFollowsDevice,
    locale: dto.locale,
    localeFollowsDevice: dto.localeFollowsDevice,
    theme: dto.theme,
    subscription: dto.subscription,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
