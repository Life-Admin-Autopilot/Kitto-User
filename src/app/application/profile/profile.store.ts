import { Injectable, computed, inject, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import { ProfileRepository, type ProfilePatch } from '@domain/profile/profile.repository';
import { ApiError } from '@infrastructure/http/api-error';

export type SaveState = 'idle' | 'saving' | 'saved';

/**
 * Preference writes, as application state.
 *
 * Thin on purpose: one in-flight write, one error, one transient "saved". What
 * it does own is the rule that a successful write REPLACES the session's
 * account — every surface reads the zone off `SessionStore`, so a save that
 * updated only this store would leave the calendar and the counts on the old
 * one until the next full reload.
 */
@Injectable()
export class ProfileStore {
  private readonly profiles = inject(ProfileRepository);
  private readonly session = inject(SessionStore);

  private readonly stateSignal = signal<SaveState>('idle');
  private readonly errorSignal = signal<string | null>(null);

  readonly state = this.stateSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isSaving = computed(() => this.stateSignal() === 'saving');

  /** The account's zone, or the device's when it somehow has none. */
  readonly timeZone = this.session.timeZone;

  /**
   * True while the stored zone is still a default rather than a choice.
   *
   * An ABSENT flag reads as true: those are accounts written before the flag
   * existed, and the server treats them the same way. Reading absence as false
   * would silently promote every legacy default into a deliberate choice.
   */
  readonly timeZoneFollowsDevice = computed(
    () => this.session.account()?.timezoneFollowsDevice !== false,
  );

  /**
   * Save a zone as the user's explicit choice.
   *
   * `timezoneFollowsDevice: false` travels with it, and it is not optional: the
   * phone app syncs the device's zone onto any account still marked as
   * following, so a zone saved here without the flag gets overwritten the next
   * time that app launches. The two fields are one decision and go in one
   * request.
   */
  async chooseTimeZone(zone: string): Promise<boolean> {
    return this.write({ timezone: zone, timezoneFollowsDevice: false });
  }

  /**
   * Hand the zone back to the device — the undo for the above.
   *
   * Writes the device's current zone AND re-arms the flag, so this dashboard
   * and the phone app agree about what happens next rather than one of them
   * treating the account as chosen and the other as following.
   */
  async followDevice(): Promise<boolean> {
    return this.write({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneFollowsDevice: true,
    });
  }

  private async write(patch: ProfilePatch): Promise<boolean> {
    if (this.stateSignal() === 'saving') return false;

    this.stateSignal.set('saving');
    this.errorSignal.set(null);

    try {
      // The server echoes the whole account; adopting it is what keeps this
      // client from disagreeing with the server about what it just saved.
      this.session.adoptAccount(await this.profiles.update(patch));
      this.stateSignal.set('saved');
      return true;
    } catch (failure: unknown) {
      this.errorSignal.set(messageFor(failure));
      this.stateSignal.set('idle');
      return false;
    }
  }

  /** Clear a transient "saved" or a stale error — called when the surface closes. */
  reset(): void {
    this.stateSignal.set('idle');
    this.errorSignal.set(null);
  }
}

/**
 * Say the true thing about why the save failed.
 *
 * A 400 here means the server rejected the zone name, which is worth
 * distinguishing from a network failure: one is fixed by picking a different
 * row, the other by waiting. "Could not save" covers both and helps with
 * neither.
 */
function messageFor(failure: unknown): string {
  if (failure instanceof ApiError) {
    if (failure.isNetworkFailure) return 'No response from the server. Try again.';
    if (failure.status === 400) return 'The server did not recognise that time zone.';
    return failure.message;
  }
  return 'Could not save. Try again.';
}
