import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AuthRejectedError } from '@domain/auth/auth-errors';
import { AuthRepository } from '@domain/auth/auth.repository';
import type { TokenPair } from '@domain/auth/session';
import { TokenStore } from '@domain/auth/token-store';
import { TokenRotator } from './token-rotator';

class FakeTokenStore extends TokenStore {
  constructor(private tokens: TokenPair | null) {
    super();
  }
  read(): TokenPair | null {
    return this.tokens;
  }
  write(tokens: TokenPair): void {
    this.tokens = tokens;
  }
  clear(): void {
    this.tokens = null;
  }
}

function setup(store: TokenStore, refresh: AuthRepository['refresh']) {
  TestBed.configureTestingModule({
    providers: [
      TokenRotator,
      { provide: TokenStore, useValue: store },
      { provide: AuthRepository, useValue: { refresh } as Partial<AuthRepository> },
    ],
  });
  return TestBed.inject(TokenRotator);
}

const PAIR: TokenPair = { accessToken: 'access-1', refreshToken: 'refresh-1' };

describe('TokenRotator', () => {
  it('coalesces concurrent callers into ONE rotation', async () => {
    // The whole reason this class exists: the server invalidates a refresh
    // token the moment it is spent, so three simultaneous rotations would
    // produce one winner and two spurious sign-outs.
    const refresh = vi.fn(async () => ({ accessToken: 'a2', refreshToken: 'r2' }));
    const rotator = setup(new FakeTokenStore(PAIR), refresh);

    const results = await Promise.all([rotator.rotate(), rotator.rotate(), rotator.rotate()]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results).toEqual([true, true, true]);
  });

  it('treats a lost race as a healthy session, not a dead one', async () => {
    // Another tab rotated while this attempt was in flight. The rejection
    // describes a token that was spent legitimately; reporting failure here is
    // what used to eject a perfectly signed-in user.
    const store = new FakeTokenStore(PAIR);
    const refresh = vi.fn(async () => {
      store.write({ accessToken: 'a-other', refreshToken: 'r-other' });
      throw new AuthRejectedError();
    });
    const rotator = setup(store, refresh);

    await expect(rotator.rotate()).resolves.toBe(true);
    expect(store.read()).not.toBeNull();
  });

  it('does NOT clear the session on a network failure', async () => {
    const store = new FakeTokenStore(PAIR);
    const rotator = setup(store, async () => {
      throw new Error('offline');
    });

    await expect(rotator.rotate()).resolves.toBe(false);
    expect(store.read()).toEqual(PAIR);
  });

  it('clears the session only on an explicit refusal of the current token', async () => {
    const store = new FakeTokenStore(PAIR);
    const rotator = setup(store, async () => {
      throw new AuthRejectedError();
    });

    await expect(rotator.rotate()).resolves.toBe(false);
    expect(store.read()).toBeNull();
  });

  it('reports false with no stored token rather than calling the server', async () => {
    const refresh = vi.fn();
    const rotator = setup(new FakeTokenStore(null), refresh);

    await expect(rotator.rotate()).resolves.toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('allows a fresh rotation after the previous one settles', async () => {
    const refresh = vi.fn(async () => ({ accessToken: 'a2', refreshToken: 'r2' }));
    const rotator = setup(new FakeTokenStore(PAIR), refresh);

    await rotator.rotate();
    await rotator.rotate();

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
