import { Injectable, inject } from '@angular/core';

import { AuthRejectedError } from '@domain/auth/auth-errors';
import { AuthRepository } from '@domain/auth/auth.repository';
import { SessionRefresher } from '@domain/auth/session-refresher';
import { TokenStore } from '@domain/auth/token-store';

/**
 * The one place a refresh token is ever spent.
 *
 * The server rotates refresh tokens and invalidates the presented one
 * IMMEDIATELY, so a refresh token is single-use. That is not a theoretical
 * hazard: two callers presenting the same token get back 200 and 401, measured
 * against the live server. Exactly one wins.
 *
 * Three rules follow, and every one of them exists because breaking it signs a
 * perfectly healthy user out:
 *
 * 1. ONE ROTATION IN FLIGHT. A page that opens the calendar, the counts and the
 *    tag list at once produces three simultaneous 401s on a cold load with an
 *    expired access token. Three rotations means two guaranteed losers, so
 *    callers share the in-flight promise instead of starting their own.
 *
 * 2. LOSING THE RACE IS NOT A DEAD SESSION. If the stored refresh token has
 *    changed since this attempt began, a concurrent rotation already succeeded
 *    and installed a good pair. The rejection in hand describes a token that
 *    was spent legitimately — reporting failure here is what ejects someone
 *    mid-session over a condition that already resolved itself.
 *
 * 3. A NETWORK FAILURE COSTS NOTHING. Offline, DNS failure, CORS rejection and
 *    5xx all leave the tokens almost certainly valid. Only an explicit refusal
 *    of the CURRENT token — an AuthRejectedError — ends the session.
 *
 * Callers should re-read the token store after this resolves rather than
 * reusing the token they started with: the winner may not have been them.
 */
@Injectable()
export class TokenRotator extends SessionRefresher {
  private readonly auth = inject(AuthRepository);
  private readonly tokens = inject(TokenStore);

  private inFlight: Promise<boolean> | null = null;

  rotate(): Promise<boolean> {
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<boolean> {
    const before = this.tokens.read()?.refreshToken;
    if (!before) return false;

    try {
      this.tokens.write(await this.auth.refresh(before));
      return true;
    } catch (error: unknown) {
      // Rule 2 — checked BEFORE the error is inspected, because a lost race
      // produces exactly the same rejection as a genuinely dead token and the
      // only thing that tells them apart is whether the stored token moved.
      if (this.tokens.read()?.refreshToken !== before) return true;

      // Rule 3 — only an explicit refusal is fatal.
      if (error instanceof AuthRejectedError) this.tokens.clear();
      return false;
    }
  }
}
