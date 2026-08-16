import type { Account, AuthenticatedSession, TokenPair } from './session';

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface SignUpDetails extends Credentials {
  readonly displayName?: string;
}

/**
 * The authentication port.
 *
 * `refresh` is deliberately part of the same port as `signIn` rather than
 * hidden inside the HTTP layer: rotation is a domain operation with a rule
 * attached (single-use, one in flight), and burying it in an interceptor is how
 * a second, undeduplicated rotation path gets added later by someone who cannot
 * see the first one.
 */
export abstract class AuthRepository {
  abstract signIn(credentials: Credentials, signal?: AbortSignal): Promise<AuthenticatedSession>;

  abstract signUp(details: SignUpDetails, signal?: AbortSignal): Promise<AuthenticatedSession>;

  /**
   * Exchange a refresh token for a new pair.
   *
   * Throws on rejection rather than returning null — the caller has to
   * distinguish "the server refused this token" from "the network was down",
   * and only an error carries that difference. A 5xx or an offline failure must
   * never cost a session.
   */
  abstract refresh(refreshToken: string, signal?: AbortSignal): Promise<TokenPair>;

  abstract signOut(signal?: AbortSignal): Promise<void>;

  abstract me(signal?: AbortSignal): Promise<Account>;
}
