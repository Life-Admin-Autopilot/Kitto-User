import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { SessionStore } from './session.store';

/**
 * Gate the app behind a resolved session.
 *
 * Awaits `restore()` before deciding, which is the whole point: on a cold
 * reload the tokens are in storage but the store has not validated them yet,
 * and a guard that reads `isAuthenticated()` synchronously would bounce a
 * signed-in user to the sign-in page every single time they pressed F5.
 *
 * `restore()` deduplicates internally, so several guarded routes activating
 * together cost one hydration, not one each.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);

  await session.restore();
  if (session.isAuthenticated()) return true;

  // Carry where they were going, so signing in lands them there rather than on
  // a generic home page — a link to a specific matter should survive the
  // detour through authentication.
  return router.createUrlTree(['/sign-in'], {
    queryParams: state.url === '/' ? {} : { returnTo: state.url },
  });
};

/** Keep an already-signed-in visitor out of the sign-in page. */
export const guestGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  await session.restore();
  return session.isAuthenticated() ? router.createUrlTree(['/calendar']) : true;
};
