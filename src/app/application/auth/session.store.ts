import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthRepository, type Credentials, type SignUpDetails } from '@domain/auth/auth.repository';
import { SessionRefresher } from '@domain/auth/session-refresher';
import type { Account, SessionStatus } from '@domain/auth/session';
import { TokenStore } from '@domain/auth/token-store';

/**
 * Who is signed in, as application state.
 *
 * Signals rather than RxJS subjects: every consumer is a template or a computed
 * value, none of them need a stream operator, and a signal read inside a
 * component is tracked automatically under zoneless change detection.
 *
 * The store owns STATUS, not just the account. `loading` is a real, distinct
 * state — it is what the app is in between "the page loaded" and "we know
 * whether these stored tokens are any good" — and collapsing it into
 * "unauthenticated" is what makes a cold reload flash the sign-in page at
 * someone who is perfectly well signed in.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly auth = inject(AuthRepository);
  private readonly tokens = inject(TokenStore);
  private readonly refresher = inject(SessionRefresher);

  private readonly statusSignal = signal<SessionStatus>('loading');
  private readonly accountSignal = signal<Account | null>(null);

  readonly status = this.statusSignal.asReadonly();
  readonly account = this.accountSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.statusSignal() === 'authenticated');
  readonly isResolving = computed(() => this.statusSignal() === 'loading');

  /**
   * The account's timezone, or the device's when it has none.
   *
   * Exposed here because three separate surfaces need it (counts, digest,
   * calendar day boundaries) and all three would otherwise re-derive the same
   * fallback. The account wins when set: someone who deliberately chose
   * Europe/Berlin while travelling must not be silently pulled back to wherever
   * the laptop currently is.
   */
  readonly timeZone = computed(
    () => this.accountSignal()?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  private restored: Promise<void> | null = null;

  /**
   * Hydrate from stored tokens. Safe to call from several places at once —
   * the guard and the shell both want it, and neither should have to know
   * whether the other got there first.
   */
  restore(): Promise<void> {
    this.restored ??= this.hydrate();
    return this.restored;
  }

  private async hydrate(): Promise<void> {
    if (!this.tokens.read()) {
      this.statusSignal.set('unauthenticated');
      return;
    }

    // Try the stored access token first. This is the common path and it costs
    // one request; rotating up front would spend a single-use refresh token on
    // every page load for no reason.
    const account = await this.tryMe();
    if (account) {
      this.adopt(account);
      return;
    }

    // The access token is probably just expired. Rotate through the shared
    // refresher — never with a private call — so boot cannot race the first
    // component query over the same single-use token.
    if (await this.refresher.rotate()) {
      const retried = await this.tryMe();
      if (retried) {
        this.adopt(retried);
        return;
      }
    }

    this.signOutLocally();
  }

  private async tryMe(): Promise<Account | null> {
    try {
      return await this.auth.me();
    } catch {
      return null;
    }
  }

  async signIn(credentials: Credentials): Promise<void> {
    const session = await this.auth.signIn(credentials);
    this.tokens.write(session.tokens);
    this.adopt(session.account);
  }

  async signUp(details: SignUpDetails): Promise<void> {
    const session = await this.auth.signUp(details);
    this.tokens.write(session.tokens);
    this.adopt(session.account);
  }

  /**
   * End the session.
   *
   * The server call is best-effort and its failure is deliberately ignored: the
   * user asked to be signed out, and leaving them signed in because the network
   * was down would be answering a different question than the one they asked.
   * The local wipe is what actually matters, so it happens regardless.
   */
  async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
    } catch {
      /* best effort — the local wipe below is the part that counts */
    }
    this.signOutLocally();
  }

  /**
   * Replace the signed-in account with a fresher copy of itself.
   *
   * For a preference write that echoed the whole account back. Deliberately NOT
   * a general setter: it asserts nothing about status, because the only caller
   * is already authenticated and flipping status here would let a settings save
   * resurrect a session that had just ended.
   */
  adoptAccount(account: Account): void {
    if (this.statusSignal() !== 'authenticated') return;
    this.accountSignal.set(account);
  }

  private adopt(account: Account): void {
    this.accountSignal.set(account);
    this.statusSignal.set('authenticated');
  }

  private signOutLocally(): void {
    this.tokens.clear();
    this.accountSignal.set(null);
    this.statusSignal.set('unauthenticated');
    // Let a later visit re-hydrate from scratch rather than replaying the
    // resolved promise from the session that just ended.
    this.restored = null;
  }
}
