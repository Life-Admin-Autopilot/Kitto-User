import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';

import { SessionRefresher } from '@domain/auth/session-refresher';
import { TokenStore } from '@domain/auth/token-store';

/**
 * Endpoints that must never carry a bearer token or trigger a rotation.
 *
 * `/auth/refresh` is the important one: letting it retry through this
 * interceptor would make a failed refresh recurse into itself. The rest are the
 * unauthenticated entry points — sending a stale bearer to sign-in is harmless
 * but sending it to a 401 and then rotating on its behalf is not.
 */
const UNAUTHENTICATED = [
  '/auth/refresh',
  '/auth/signin',
  '/auth/signup',
  '/auth/magic-link',
  '/auth/magic-consume',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function isUnauthenticated(url: string): boolean {
  return UNAUTHENTICATED.some((path) => url.includes(path));
}

function withBearer(request: HttpRequest<unknown>, accessToken: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } });
}

/**
 * Attach the access token; on 401, rotate once and replay.
 *
 * The retry is strictly ONE-SHOT. A 401 that survives a successful rotation is
 * not an expiry — it is the server refusing this request for a reason a new
 * token will not fix — and retrying it in a loop turns one rejected call into a
 * request storm against an endpoint that has already said no.
 *
 * All the concurrency subtlety lives behind SessionRefresher, deliberately.
 * Several requests failing at once is the NORMAL case on a cold load, not an
 * edge case, and this interceptor stays readable only because it can hand that
 * problem to something that solves it once. It depends on the domain port
 * rather than the application class that implements it, so the transport layer
 * never reaches upward.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (isUnauthenticated(request.url)) return next(request);

  const tokens = inject(TokenStore);
  const rotator = inject(SessionRefresher);

  const accessToken = tokens.read()?.accessToken;
  const authorised = accessToken ? withBearer(request, accessToken) : request;

  return next(authorised).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return replayAfterRotation(request, next, rotator, tokens, error);
    }),
  );
};

function replayAfterRotation(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  rotator: SessionRefresher,
  tokens: TokenStore,
  original: HttpErrorResponse,
): Observable<HttpEvent<unknown>> {
  return from(rotator.rotate()).pipe(
    switchMap((rotated) => {
      // Re-read rather than trusting what we sent: a concurrent rotation may
      // have been the one that succeeded, and its pair is the live one.
      const refreshed = rotated ? tokens.read()?.accessToken : undefined;
      if (!refreshed) return throwError(() => original);
      return next(withBearer(request, refreshed));
    }),
  );
}
