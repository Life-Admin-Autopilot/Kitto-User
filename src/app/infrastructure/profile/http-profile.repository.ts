import { Injectable, inject } from '@angular/core';

import { ProfileRepository, type ProfilePatch } from '@domain/profile/profile.repository';
import type { Account } from '@domain/auth/session';
import { toAccount, type AccountDto } from '../auth/account.mapper';
import { ApiClient } from '../http/api.client';

/**
 * `PATCH /me`.
 *
 * The body is the patch verbatim. The endpoint is a partial update with a
 * strict schema: unknown top-level keys are stripped rather than rejected, an
 * absent key is untouched, and an explicit `null` is a 400 — so the patch type
 * uses optional fields and nothing here ever fills a gap with `null`.
 */
@Injectable()
export class HttpProfileRepository extends ProfileRepository {
  private readonly api = inject(ApiClient);

  async update(patch: ProfilePatch, signal?: AbortSignal): Promise<Account> {
    const response = await this.api.patch<{ user: AccountDto }>('/me', patch, signal);
    return toAccount(response.user);
  }
}
