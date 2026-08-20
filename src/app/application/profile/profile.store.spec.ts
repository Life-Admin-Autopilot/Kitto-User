import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SessionStore } from '@application/auth/session.store';
import type { Account } from '@domain/auth/session';
import { ProfileRepository, type ProfilePatch } from '@domain/profile/profile.repository';
import { ProfileStore } from './profile.store';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'u1',
    email: 'omar@example.com',
    preferredDomains: [],
    hasOnboarded: true,
    timezone: 'Africa/Cairo',
    timezoneFollowsDevice: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Records what it was asked to save, and can be told to refuse. */
class FakeProfileRepository extends ProfileRepository {
  readonly patches: ProfilePatch[] = [];

  constructor(
    private readonly current: Account,
    private readonly failure: Error | null = null,
  ) {
    super();
  }

  async update(patch: ProfilePatch): Promise<Account> {
    this.patches.push(patch);
    if (this.failure) throw this.failure;
    return {
      ...this.current,
      timezone: patch.timezone ?? this.current.timezone,
      timezoneFollowsDevice: patch.timezoneFollowsDevice ?? this.current.timezoneFollowsDevice,
    };
  }
}

/**
 * A session double that behaves like the real store on the one axis that
 * matters here: `adoptAccount` writes, and `timeZone` reads back through the
 * same value — which is what proves a save actually reaches every other surface.
 */
function fakeSession(initial: Account | null) {
  let current = initial;
  return {
    account: () => current,
    timeZone: () => current?.timezone ?? 'UTC',
    adoptAccount: (next: Account) => {
      current = next;
    },
  };
}

function setup(initial: Account | null = account(), failure: Error | null = null) {
  const session = fakeSession(initial);
  const repository = new FakeProfileRepository(initial ?? account(), failure);

  TestBed.configureTestingModule({
    providers: [
      ProfileStore,
      { provide: ProfileRepository, useValue: repository },
      { provide: SessionStore, useValue: session },
    ],
  });

  return { store: TestBed.inject(ProfileStore), repository, session };
}

describe('ProfileStore', () => {
  it('sends the zone and clears the device flag in one request', async () => {
    // Both fields or neither. Sending the zone alone leaves the account marked
    // as device-following, and the phone app writes its own zone back over the
    // choice on its next launch — so the flag is part of the same decision.
    const { store, repository } = setup();

    await store.chooseTimeZone('Europe/Berlin');

    expect(repository.patches).toEqual([
      { timezone: 'Europe/Berlin', timezoneFollowsDevice: false },
    ]);
  });

  it('publishes the saved zone through the session, not just its own state', async () => {
    // Every other surface — calendar day boundaries, the counts query, the
    // digest — reads the zone off SessionStore. A save that updated only this
    // store would leave all of them on the old value until a full reload.
    const { store, session } = setup();

    await store.chooseTimeZone('Asia/Tokyo');

    expect(session.timeZone()).toBe('Asia/Tokyo');
    expect(store.timeZoneFollowsDevice()).toBe(false);
  });

  it('reports a refusal and stays out of the saved state', async () => {
    const { store } = setup(account(), new Error('nope'));

    const ok = await store.chooseTimeZone('Europe/Berlin');

    expect(ok).toBe(false);
    expect(store.state()).toBe('idle');
    expect(store.error()).not.toBeNull();
  });

  it('leaves the previous zone in place when the save fails', async () => {
    // The optimistic version of this store would have written the new zone
    // locally first, so a rejected save left the dashboard showing a zone the
    // server does not have.
    const { store, session } = setup(account({ timezone: 'Africa/Cairo' }), new Error('nope'));

    await store.chooseTimeZone('Not/AZone');

    expect(session.timeZone()).toBe('Africa/Cairo');
  });

  it('treats an absent flag as still following the device', async () => {
    // Accounts written before the flag existed. Reading absence as false would
    // silently promote every legacy default into a deliberate choice and stop
    // the phone app from ever correcting it.
    const { store } = setup(account({ timezoneFollowsDevice: undefined }));

    expect(store.timeZoneFollowsDevice()).toBe(true);
  });

  it('re-arms the flag when handing the zone back to the device', async () => {
    const { store, repository } = setup(
      account({ timezone: 'Europe/Berlin', timezoneFollowsDevice: false }),
    );

    await store.followDevice();

    expect(repository.patches).toHaveLength(1);
    expect(repository.patches[0].timezoneFollowsDevice).toBe(true);
    expect(repository.patches[0].timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('ignores a second write while one is in flight', async () => {
    const { store, repository } = setup();

    await Promise.all([store.chooseTimeZone('Asia/Tokyo'), store.chooseTimeZone('Europe/Berlin')]);

    // One request, not two racing to write the same field. The loser of that
    // race decides the stored zone, which is not something the user chose.
    expect(repository.patches).toHaveLength(1);
  });
});
