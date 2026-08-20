/**
 * The signed-in account and the token pair that proves it.
 *
 * Mirrors the server's `User.toJSON()`. Only the fields a dashboard surface
 * actually renders are typed — the account also stores textSize, mic quality
 * and privacy preferences, which nothing here reads. Typing them would
 * advertise settings this client cannot honour.
 */

export type Theme = 'system' | 'light' | 'dark';
export type SubscriptionTier = 'free' | 'pro';

export interface OnboardingAnswer {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

export interface SubscriptionState {
  readonly tier: SubscriptionTier;
  readonly renewsAt?: string;
  readonly canceledAt?: string;
}

export interface Account {
  readonly id: string;
  readonly email: string;
  /** Requested but unconfirmed; the account still signs in as `email`. */
  readonly pendingEmail?: string;
  /**
   * False for magic-link-only accounts. Surfaces re-confirm with a password
   * only when there is one to give — the hash never reaches a client.
   */
  readonly hasPassword?: boolean;
  readonly displayName?: string;
  readonly preferredDomains: readonly string[];
  readonly hasOnboarded: boolean;
  readonly onboardingAnswers?: readonly OnboardingAnswer[];
  readonly emailVerifiedAt?: string;
  /** IANA zone. Always set on accounts created since the server got a default. */
  readonly timezone?: string;
  /**
   * True while `timezone` is still the server's default rather than a zone the
   * user picked. Absent on accounts predating the flag, which read as true.
   */
  readonly timezoneFollowsDevice?: boolean;
  /** BCP 47 tag. Absent only on accounts predating the language picker. */
  readonly locale?: string;
  readonly localeFollowsDevice?: boolean;
  readonly theme?: Theme;
  readonly subscription?: SubscriptionState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * The access/refresh pair.
 *
 * The refresh token is SINGLE-USE: the server rotates it and invalidates the
 * presented one immediately. Everything about how this client handles tokens
 * follows from that one fact — see `TokenRotator` in the infrastructure layer
 * for why there can only ever be one rotation in flight.
 */
export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AuthenticatedSession {
  readonly account: Account;
  readonly tokens: TokenPair;
}

export type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated';

/** The first name to greet someone by, or a caller-supplied fallback. */
export function firstNameOf(account: Account | null, fallback: string): string {
  const display = account?.displayName?.trim();
  if (display) return display.split(/\s+/)[0];
  if (account?.email) return account.email.split('@')[0];
  return fallback;
}
