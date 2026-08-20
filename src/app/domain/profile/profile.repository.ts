import type { Account } from '@domain/auth/session';

/**
 * The subset of `PATCH /me` this dashboard is allowed to send.
 *
 * Deliberately narrow. The endpoint accepts a dozen more keys — theme, textSize,
 * mic quality, notification and privacy preferences, onboarding answers — and
 * typing them here would advertise settings no surface in this client can edit.
 * A field belongs in this type when something on screen can change it.
 */
export interface ProfilePatch {
  /** IANA zone, e.g. `Africa/Cairo`. The server validates it and 400s on a bad one. */
  readonly timezone?: string;
  /**
   * False when the zone is the user's own pick rather than a default or a
   * device reading. Sending the zone WITHOUT this leaves the account marked as
   * device-following, and the phone app will write its own zone back over the
   * choice on its next launch.
   */
  readonly timezoneFollowsDevice?: boolean;
}

/**
 * The profile port.
 *
 * Separate from `AuthRepository` even though both talk to `/me`-shaped
 * endpoints, because they answer different questions: one is "who is signed in
 * and is this credential good", the other is "change a preference". Folding
 * preference writes into the auth port would mean every consumer of
 * authentication also depends on the ability to mutate settings.
 *
 * Returns the FULL updated account rather than void. The server echoes it, and
 * the alternative — patching the local copy field by field — is how a client
 * ends up disagreeing with the server about what it just saved.
 */
export abstract class ProfileRepository {
  abstract update(patch: ProfilePatch, signal?: AbortSignal): Promise<Account>;
}
