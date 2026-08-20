import { Injectable, inject } from '@angular/core';

import { AuthRejectedError } from '@domain/auth/auth-errors';
import { AuthRepository, type Credentials, type SignUpDetails } from '@domain/auth/auth.repository';
import type { Account, AuthenticatedSession, TokenPair } from '@domain/auth/session';
import { toAccount, type AccountDto } from './account.mapper';
import { ApiClient } from '../http/api.client';
import { ApiError } from '../http/api-error';

/**
 * Wire shape of a session. `AccountDto` and its mapper moved to
 * `account.mapper.ts` once `PATCH /me` needed them too — the same `user` object
 * comes back from both, and two copies of the mapping is how the two drift.
 */
interface SessionDto {
  user: AccountDto;
  tokens: { accessToken: string; refreshToken: string };
}

function toSession(dto: SessionDto): AuthenticatedSession {
  return { account: toAccount(dto.user), tokens: dto.tokens };
}

/**
 * Translate an explicit refusal into the domain's own error.
 *
 * This is the boundary where an HTTP status stops being meaningful. Layers
 * above must be able to ask "was this credential refused?" without importing a
 * notion of 401, and — just as importantly — a 500 or an offline failure has to
 * come through as something else entirely, because those say nothing about
 * whether the credential is still good.
 */
async function rejectingRefusals<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error: unknown) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      throw new AuthRejectedError(error.message);
    }
    throw error;
  }
}

@Injectable()
export class HttpAuthRepository extends AuthRepository {
  private readonly api = inject(ApiClient);

  async signIn(credentials: Credentials, signal?: AbortSignal): Promise<AuthenticatedSession> {
    return toSession(
      await rejectingRefusals(this.api.post<SessionDto>('/auth/signin', credentials, signal)),
    );
  }

  async signUp(details: SignUpDetails, signal?: AbortSignal): Promise<AuthenticatedSession> {
    return toSession(
      await rejectingRefusals(this.api.post<SessionDto>('/auth/signup', details, signal)),
    );
  }

  async refresh(refreshToken: string, signal?: AbortSignal): Promise<TokenPair> {
    const response = await rejectingRefusals(
      this.api.post<{ tokens: TokenPair }>('/auth/refresh', { refreshToken }, signal),
    );
    return response.tokens;
  }

  async signOut(signal?: AbortSignal): Promise<void> {
    await this.api.post<void>('/auth/signout', {}, signal);
  }

  async me(signal?: AbortSignal): Promise<Account> {
    const response = await this.api.get<{ user: AccountDto }>('/auth/me', undefined, signal);
    return toAccount(response.user);
  }
}
