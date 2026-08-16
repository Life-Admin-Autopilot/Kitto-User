/**
 * Rotate the stored session, coalescing concurrent attempts.
 *
 * A port, because the HTTP interceptor needs to trigger a rotation and the
 * rotation logic belongs in the application layer — without this abstraction
 * the transport would have to reach upward into application code, which is the
 * dependency rule backwards.
 *
 * The contract every implementation owes its callers:
 *
 *   - Concurrent calls share ONE attempt. The refresh token is single-use, so a
 *     second simultaneous rotation is guaranteed to lose.
 *   - Resolves `true` when the store now holds a usable access token — INCLUDING
 *     when this particular call lost the race and another one succeeded.
 *   - Resolves `false` without destroying the session when the failure was a
 *     network or server fault rather than a refusal.
 *   - Never rejects. A caller deciding whether to replay a request should not
 *     have to wrap this in a try/catch.
 */
export abstract class SessionRefresher {
  abstract rotate(): Promise<boolean>;
}
