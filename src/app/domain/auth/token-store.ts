import type { TokenPair } from './session';

/**
 * Where the token pair lives between page loads.
 *
 * A port rather than a direct `localStorage` call, for two reasons that both
 * bite later. First, the rotator and the interceptor both need to read the
 * CURRENT pair — not the one they captured when they started — and a port makes
 * that a single named operation instead of a scattered storage key. Second,
 * localStorage is the wrong answer eventually (an XSS-readable store for a
 * bearer token) and swapping it should be one adapter, not a search across the
 * codebase.
 *
 * The key names match the mobile app's deliberately. Same product, same
 * account, and a developer looking at two DevTools panes should not have to
 * work out which app wrote which key.
 */
export abstract class TokenStore {
  abstract read(): TokenPair | null;
  abstract write(tokens: TokenPair): void;
  abstract clear(): void;
}
