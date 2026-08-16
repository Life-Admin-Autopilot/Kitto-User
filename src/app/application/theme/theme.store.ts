import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { SessionStore } from '@application/auth/session.store';
import type { Theme } from '@domain/auth/session';

const STORAGE_KEY = 'lifeadmin.theme';

/**
 * Which palette is on screen.
 *
 * Three states, not two. `system` is a real, distinct choice — it means "follow
 * the OS" — and collapsing it into light-or-dark is what makes an app stop
 * following the OS the moment someone touches the toggle once.
 *
 * The class goes on <html>, matching the `@custom-variant dark` declared in
 * styles.css. A media query alone could not express this: `prefers-color-scheme`
 * has no way to say "this person chose light while their laptop is dark", and
 * the account genuinely stores that choice.
 *
 * Precedence, highest first:
 *   1. a choice made in this browser  (localStorage)
 *   2. the account's stored theme     (set on another device)
 *   3. the operating system
 *
 * Local beats the account deliberately: the toggle in the sidebar has to take
 * effect immediately and keep effect, and an account value arriving a moment
 * later from /auth/me must not silently undo the click that just happened.
 */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(SessionStore);

  /** An explicit choice made in THIS browser, if any. */
  private readonly localChoice = signal<Theme | null>(readStoredTheme());

  /** What the OS currently reports. Kept live — a laptop that switches to dark
   *  at sunset should carry a `system` preference with it. */
  private readonly systemPrefersDark = signal(prefersDark());

  /** The preference in force, before it is resolved to an actual palette. */
  readonly preference = computed<Theme>(
    () => this.localChoice() ?? this.session.account()?.theme ?? 'system',
  );

  /** The palette actually on screen. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const preference = this.preference();
    if (preference === 'system') return this.systemPrefersDark() ? 'dark' : 'light';
    return preference;
  });

  readonly isDark = computed(() => this.resolved() === 'dark');

  constructor() {
    const media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    if (media) {
      const onChange = (event: MediaQueryListEvent) => this.systemPrefersDark.set(event.matches);
      media.addEventListener('change', onChange);
    }

    // The single place the DOM is touched. An effect rather than a write inside
    // each setter, so every path that can change the answer — the toggle, the
    // account arriving, the OS flipping — lands here and cannot disagree.
    effect(() => {
      this.document.documentElement.classList.toggle('dark', this.isDark());
    });
  }

  /**
   * Cycle light → dark → system.
   *
   * `system` stays in the cycle rather than being buried in a settings screen:
   * it is the only option that keeps working when the OS changes, and an
   * interface that can enter a mode but never leave it is a trap.
   */
  cycle(): void {
    const next: Theme =
      this.preference() === 'light' ? 'dark' : this.preference() === 'dark' ? 'system' : 'light';
    this.set(next);
  }

  set(theme: Theme): void {
    // `system` clears the local override rather than storing the word: storing
    // it would freeze whatever the OS said at that moment for anyone reading
    // the key later, which is the opposite of what "follow the system" means.
    if (theme === 'system') {
      this.localChoice.set(null);
      remove(STORAGE_KEY);
      return;
    }
    this.localChoice.set(theme);
    write(STORAGE_KEY, theme);
  }
}

function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* disabled storage — the choice just won't survive a reload */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
