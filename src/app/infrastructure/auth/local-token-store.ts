import { Injectable } from '@angular/core';

import type { TokenPair } from '@domain/auth/session';
import { TokenStore } from '@domain/auth/token-store';

const ACCESS_KEY = 'lifeadmin.access-token';
const REFRESH_KEY = 'lifeadmin.refresh-token';

/**
 * localStorage-backed token storage.
 *
 * Every operation fails soft. Storage can be full, disabled by policy, or throw
 * in a private-mode browser — and none of those are worth an unhandled
 * exception on a code path that runs before the app has drawn anything. The
 * cost of failing soft is that tokens do not survive a reload, which is a
 * degraded session rather than a broken one.
 *
 * Known limitation, stated rather than hidden: localStorage is readable by any
 * script on the origin, so this is not a defence against XSS. It matches what
 * the mobile app does today; moving both to a safer store is one adapter swap
 * here and a documented deferral there.
 */
@Injectable()
export class LocalTokenStore extends TokenStore {
  read(): TokenPair | null {
    const accessToken = this.get(ACCESS_KEY);
    const refreshToken = this.get(REFRESH_KEY);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  }

  write(tokens: TokenPair): void {
    this.set(ACCESS_KEY, tokens.accessToken);
    this.set(REFRESH_KEY, tokens.refreshToken);
  }

  clear(): void {
    this.remove(ACCESS_KEY);
    this.remove(REFRESH_KEY);
  }

  private get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota or disabled storage — the session just won't survive a reload */
    }
  }

  private remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
