import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { SessionStore } from '@application/auth/session.store';
import type { Matter } from '@domain/matters/matter';
import type { MatterPage } from '@domain/matters/matter-query';
import {
  MatterRepository,
  type ListMattersRequest,
  type MatterPatch,
} from '@domain/matters/matter.repository';
import { MattersStore } from './matters.store';

function matter(id: string, overrides: Partial<Matter> = {}): Matter {
  return {
    id,
    title: `Matter ${id}`,
    domain: 'home',
    kind: 'reminder',
    status: 'open',
    priority: 'normal',
    priorityRank: 1,
    tags: [],
    subtasks: [],
    reminders: [],
    rescheduleCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * A repository that records what it was asked for.
 *
 * The point of most of these tests is the SHAPE of the traffic — which pages get
 * requested, and how often — so the calls matter as much as the answers.
 */
class FakeRepository extends MatterRepository {
  readonly listCalls: ListMattersRequest[] = [];
  readonly patches: { id: string; patch: MatterPatch }[] = [];

  constructor(private readonly pages: readonly MatterPage[]) {
    super();
  }

  async list(request: ListMattersRequest): Promise<MatterPage> {
    this.listCalls.push(request);
    const index = request.cursor ? Number(request.cursor) : 0;
    return this.pages[index] ?? { matters: [], total: 0, nextCursor: null };
  }

  async counts(): Promise<never> {
    // Never resolves: the counts request is irrelevant here, and leaving it
    // pending proves the list does not depend on it.
    return new Promise<never>(() => {});
  }

  async tags(): Promise<readonly string[]> {
    return [];
  }

  async create(): Promise<Matter> {
    throw new Error('not used');
  }

  async update(id: string, patch: MatterPatch): Promise<Matter> {
    this.patches.push({ id, patch });
    return matter(id, {
      status: patch.status ?? 'open',
      completedAt: patch.status === 'done' ? '2026-08-16T10:00:00.000Z' : undefined,
      snoozedUntil: patch.snoozedUntil ?? undefined,
    });
  }

  async remove(): Promise<{ undoToken: string | null }> {
    return { undoToken: null };
  }

  async undo(): Promise<{ restored: number }> {
    return { restored: 0 };
  }
}

function setup(pages: readonly MatterPage[]) {
  const repository = new FakeRepository(pages);
  TestBed.configureTestingModule({
    providers: [
      MattersStore,
      { provide: MatterRepository, useValue: repository },
      {
        provide: SessionStore,
        useValue: { timeZone: () => 'Africa/Cairo', account: () => null },
      },
    ],
  });
  return { store: TestBed.inject(MattersStore), repository };
}

/** Let the resource's loader effect run and its promise settle. */
async function settle(): Promise<void> {
  TestBed.tick();
  await Promise.resolve();
  await Promise.resolve();
  TestBed.tick();
}

const PAGE_ONE: MatterPage = {
  matters: [matter('a'), matter('b')],
  total: 4,
  nextCursor: '1',
};

const PAGE_TWO: MatterPage = {
  matters: [matter('c'), matter('d')],
  total: 4,
  nextCursor: null,
};

describe('MattersStore paging', () => {
  it('appends the next page instead of reloading the list', async () => {
    const { store, repository } = setup([PAGE_ONE, PAGE_TWO]);
    await settle();

    expect(store.matters().map((m) => m.id)).toEqual(['a', 'b']);
    expect(store.hasMore()).toBe(true);

    await store.loadMore();
    await settle();

    // The rows already on screen are still there, followed by the new ones.
    expect(store.matters().map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(store.hasMore()).toBe(false);
  });

  it('does not re-download page one to reach page two', async () => {
    const { store, repository } = setup([PAGE_ONE, PAGE_TWO]);
    await settle();
    const before = repository.listCalls.length;

    await store.loadMore();
    await settle();

    const added = repository.listCalls.slice(before);
    expect(added).toHaveLength(1);
    expect(added[0].cursor).toBe('1');
  });

  it('never empties the list while the next page is in flight', async () => {
    const { store } = setup([PAGE_ONE, PAGE_TWO]);
    await settle();

    const inFlight = store.loadMore();
    // Mid-request: this is the moment the old implementation blanked the table
    // into skeletons and reset the header count to zero.
    expect(store.matters().map((m) => m.id)).toEqual(['a', 'b']);
    expect(store.total()).toBe(4);
    expect(store.loadingMore()).toBe(true);

    await inFlight;
    await settle();
    expect(store.loadingMore()).toBe(false);
  });

  it('discards accumulated pages when the filter changes', async () => {
    const { store } = setup([PAGE_ONE, PAGE_TWO]);
    await settle();
    await store.loadMore();
    await settle();
    expect(store.matters()).toHaveLength(4);

    store.toggleDomain('finance');
    await settle();

    // Back to whatever the new query returned, with nothing stitched on from
    // the query before it.
    expect(store.matters().map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('MattersStore completion', () => {
  it('keeps a completed matter on screen so it can be un-completed', async () => {
    const { store, repository } = setup([PAGE_ONE, PAGE_TWO]);
    await settle();

    const target = store.matters()[0];
    await store.toggleComplete(target);
    await settle();

    // Still listed, wearing its new state — the row has to survive for the
    // undo to have something to act on.
    const row = store.matters().find((m) => m.id === target.id);
    expect(row?.status).toBe('done');

    await store.toggleComplete(row!);
    await settle();

    expect(repository.patches.map((p) => p.patch.status)).toEqual(['done', 'open']);
    expect(store.matters().find((m) => m.id === target.id)?.status).toBe('open');
  });

  it('sends the reopen with an explicit null so a stale wake-up cannot survive', async () => {
    const { store, repository } = setup([PAGE_ONE, PAGE_TWO]);
    await settle();

    await store.toggleComplete(store.matters()[0]);
    await settle();
    await store.toggleComplete(store.matters()[0]);
    await settle();

    expect(repository.patches[1].patch).toEqual({ status: 'open', snoozedUntil: null });
  });

  it('reports a rejected write instead of dropping it', async () => {
    const { store, repository } = setup([PAGE_ONE, PAGE_TWO]);
    await settle();
    vi.spyOn(repository, 'update').mockRejectedValue(new Error('offline'));

    await store.toggleComplete(store.matters()[0]);
    await settle();

    expect(store.actionError()).toContain('was not saved');
    // And the optimistic tick is rolled back rather than left lying.
    expect(store.matters()[0].status).toBe('open');
  });

  it('leaves a completed matter alone when S is pressed', async () => {
    const { store, repository } = setup([PAGE_ONE, PAGE_TWO]);
    await settle();

    await store.toggleComplete(store.matters()[0]);
    await settle();
    await store.toggleSnooze(store.matters()[0]);
    await settle();

    // One patch, not two: snoozing something already done would resurrect it.
    expect(repository.patches).toHaveLength(1);
  });
});
