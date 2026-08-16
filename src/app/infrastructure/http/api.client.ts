import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { ApiError, toApiError } from './api-error';

/** Values a query parameter can carry before serialisation. */
export type QueryValue = string | number | boolean | readonly string[] | undefined | null;

/**
 * The single HTTP seam.
 *
 * Everything the app sends goes through here, so the base URL, the query
 * serialisation rule and the error shape each exist exactly once. Repositories
 * call these methods; nothing else may inject HttpClient.
 *
 * Promises out, not Observables. The domain ports are Promise-shaped (see
 * MatterRepository for why), and Angular's `resource()` loader is Promise-based
 * and hands you an AbortSignal — so this class bridges Observable→Promise once
 * and cancellation comes for free everywhere.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string, params?: Record<string, QueryValue>, signal?: AbortSignal): Promise<T> {
    return this.send(this.http.get<T>(this.url(path), { params: toHttpParams(params) }), signal);
  }

  post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.send(this.http.post<T>(this.url(path), body ?? {}), signal);
  }

  patch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.send(this.http.patch<T>(this.url(path), body), signal);
  }

  delete<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.send(this.http.delete<T>(this.url(path)), signal);
  }

  private url(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  /**
   * Observable → Promise, with the AbortSignal wired to the subscription.
   *
   * `firstValueFrom` alone would not do: it resolves on the first emission but
   * gives no way to CANCEL the underlying request, so a filter changed three
   * times in a second leaves three in-flight requests racing to write the same
   * signal. Unsubscribing is what actually aborts an Angular HTTP request.
   */
  private send<T>(source: Observable<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }

      const subscription = source.subscribe({
        next: (value) => resolve(value),
        error: (error: unknown) => reject(normalise(error)),
      });

      signal?.addEventListener(
        'abort',
        () => {
          subscription.unsubscribe();
          reject(abortError());
        },
        { once: true },
      );
    });
  }
}

function abortError(): DOMException {
  return new DOMException('The request was aborted.', 'AbortError');
}

function normalise(error: unknown): ApiError | unknown {
  return error instanceof HttpErrorResponse
    ? toApiError(error, 'Something went wrong. Try again.')
    : error;
}

/**
 * Serialise a filter object into query parameters.
 *
 * Two rules, both load-bearing against this backend:
 *
 * 1. Empty values are DROPPED, never sent blank. The server's filter schema is
 *    strict and rejects `?status=` outright, so a filter the user just cleared
 *    has to vanish from the URL rather than linger as an empty string.
 * 2. Arrays join with commas, matching the server's CSV multi-value filters —
 *    `?domain=health,car`, not repeated `?domain=` keys.
 */
export function toHttpParams(params?: Record<string, QueryValue>): HttpParams {
  let httpParams = new HttpParams();
  if (!params) return httpParams;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      httpParams = httpParams.set(key, value.join(','));
    } else {
      httpParams = httpParams.set(key, String(value));
    }
  }
  return httpParams;
}
