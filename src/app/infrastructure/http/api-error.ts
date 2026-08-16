import { HttpErrorResponse } from '@angular/common/http';

/**
 * The backend's error envelope, normalised.
 *
 * Every kernel route answers a failure as `{ error: { code, message, details? } }`.
 * Feature code branches on `code`, never on the message — the message is prose
 * meant for a person and the code is the contract. `409 conflict_detected` and
 * `402 quota_exceeded` are both routine, expected answers this app has to
 * handle, not exceptional ones.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /**
   * True when the failure is the network rather than the server.
   *
   * Status 0 is what the browser reports for a refused connection, a DNS
   * failure or a CORS rejection. It must never be treated as an auth problem:
   * signing someone out because their wifi dropped is the single rudest thing
   * a client can do, and it is what happens if `!response.ok` is the only test.
   */
  get isNetworkFailure(): boolean {
    return this.status === 0;
  }
}

/**
 * The literal a route answers with when no model key is configured.
 *
 * The backend boots and serves happily without AI credentials, answering 503
 * on exactly the routes that need one. That is a designed, tested behaviour —
 * so a surface that offers an AI feature has to render "unavailable" rather
 * than "something went wrong", which are different sentences to a user.
 */
export const AI_NOT_CONFIGURED = 'ai_not_configured';

interface ErrorEnvelope {
  readonly error?: { readonly code?: string; readonly message?: string; readonly details?: unknown };
}

/**
 * Convert Angular's HttpErrorResponse into the app's own error type.
 *
 * `fallbackMessage` is passed in rather than hardcoded so the caller can supply
 * a translated sentence — this module has no translator and should not grow
 * one.
 */
export function toApiError(response: HttpErrorResponse, fallbackMessage: string): ApiError {
  const body = response.error as ErrorEnvelope | string | null;
  const envelope = typeof body === 'object' && body !== null ? body.error : undefined;

  return new ApiError(
    envelope?.code ?? (response.status === 0 ? 'network_error' : 'unknown_error'),
    envelope?.message ?? fallbackMessage,
    response.status,
    envelope?.details,
  );
}
