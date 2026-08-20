import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { TokenRotator } from '@application/auth/token-rotator';
import { AuthRepository } from '@domain/auth/auth.repository';
import { SessionRefresher } from '@domain/auth/session-refresher';
import { TokenStore } from '@domain/auth/token-store';
import { FinanceRepository } from '@domain/finance/finance.repository';
import { MatterRepository } from '@domain/matters/matter.repository';
import { ProfileRepository } from '@domain/profile/profile.repository';
import { HttpAuthRepository } from '@infrastructure/auth/http-auth.repository';
import { LocalTokenStore } from '@infrastructure/auth/local-token-store';
import { HttpFinanceRepository } from '@infrastructure/finance/http-finance.repository';
import { authInterceptor } from '@infrastructure/http/auth.interceptor';
import { HttpMatterRepository } from '@infrastructure/matters/http-matter.repository';
import { HttpProfileRepository } from '@infrastructure/profile/http-profile.repository';

import { routes } from './app.routes';

/**
 * The composition root.
 *
 * This is the ONLY file allowed to know both a port and its adapter. Every
 * binding below reads "this abstraction is satisfied by that implementation",
 * and nothing else in the app imports from `@infrastructure/*` — which is what
 * makes the dependency rule enforceable by reading imports rather than by
 * trusting everyone to remember it.
 *
 * Swapping any line here swaps an implementation app-wide: an in-memory matter
 * repository for a demo without a backend, a cookie-backed token store, a
 * mocked auth adapter for tests. Nothing above this file changes.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),

    // ---- Ports → adapters ----
    { provide: TokenStore, useClass: LocalTokenStore },
    { provide: AuthRepository, useClass: HttpAuthRepository },
    { provide: MatterRepository, useClass: HttpMatterRepository },
    { provide: FinanceRepository, useClass: HttpFinanceRepository },
    { provide: ProfileRepository, useClass: HttpProfileRepository },

    // The rotator is application logic satisfying a domain port, so the
    // interceptor can depend on the port and never on the class.
    { provide: SessionRefresher, useClass: TokenRotator },
  ],
};
