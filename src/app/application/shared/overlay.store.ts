import { Injectable, computed, signal } from '@angular/core';

/**
 * Who owns the keyboard.
 *
 * Page-level shortcuts (J/K/E/S on Matters) listen on `document`, so they hear
 * every keystroke in the app including ones typed into an open dialog. Checking
 * `event.target` catches the common case — focus is in an input — but not the
 * moment between a dialog opening and its field receiving focus, and not a
 * dialog whose focused element is a button.
 *
 * That gap is not cosmetic: on this app it meant typing a command into the
 * palette could complete and snooze matters, silently, with no way to tell it
 * had happened.
 *
 * So overlays claim the keyboard explicitly and shortcut handlers check here
 * first. A counter rather than a boolean, because two overlays can be open at
 * once and the second one closing must not hand the keyboard back while the
 * first is still up.
 */
@Injectable({ providedIn: 'root' })
export class OverlayStore {
  private readonly claims = signal(0);

  /** True while any overlay is open. Shortcut handlers must bail on this. */
  readonly keyboardCaptured = computed(() => this.claims() > 0);

  claim(): void {
    this.claims.update((count) => count + 1);
  }

  release(): void {
    this.claims.update((count) => Math.max(0, count - 1));
  }
}
