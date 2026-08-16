import { Injectable, inject } from '@angular/core';

import type { Matter } from '@domain/matters/matter';
import type { MatterCounts, MatterPage } from '@domain/matters/matter-query';
import {
  MatterRepository,
  type ListMattersRequest,
  type MatterPatch,
  type NewMatter,
} from '@domain/matters/matter.repository';
import { ApiClient, type QueryValue } from '../http/api.client';
import { toCounts, toMatter, type TaskCountsDto, type TaskDto, type TaskListDto } from './matter.mapper';

/**
 * The HTTP adapter for the matter port.
 *
 * Nothing here decides anything. It builds a URL, calls the seam, and maps the
 * answer — every rule about WHICH matters to ask for lives in the application
 * layer, and every rule about what a matter IS lives in the domain.
 */
@Injectable()
export class HttpMatterRepository extends MatterRepository {
  private readonly api = inject(ApiClient);

  async list(request: ListMattersRequest, signal?: AbortSignal): Promise<MatterPage> {
    const { query, sort, limit, cursor } = request;

    // Spread the query straight in: its keys are already the server's parameter
    // names, and renaming them here would create a second vocabulary to keep in
    // step with the first.
    const params: Record<string, QueryValue> = {
      ...query,
      sort,
      limit,
      cursor,
    };

    const dto = await this.api.get<TaskListDto>('/me/tasks', params, signal);
    return {
      matters: dto.tasks.map(toMatter),
      total: dto.total,
      nextCursor: dto.nextCursor,
    };
  }

  /**
   * `tz` is not optional and not defaulted here.
   *
   * Day boundaries are meaningless without a zone — "due today" is a different
   * set in Cairo and in London — and the server answers an unrecognised zone
   * with a 500 rather than silently falling back to UTC. The caller knows which
   * zone it means; this layer must not guess on its behalf.
   */
  async counts(timeZone: string, signal?: AbortSignal): Promise<MatterCounts> {
    const dto = await this.api.get<{ counts: TaskCountsDto }>(
      '/me/tasks/counts',
      { tz: timeZone },
      signal,
    );
    return toCounts(dto.counts);
  }

  async tags(signal?: AbortSignal): Promise<readonly string[]> {
    const dto = await this.api.get<{ tags: string[] }>('/me/tasks/tags', undefined, signal);
    return dto.tags;
  }

  async create(matter: NewMatter, signal?: AbortSignal): Promise<Matter> {
    const dto = await this.api.post<{ task: TaskDto }>('/me/tasks', matter, signal);
    return toMatter(dto.task);
  }

  async update(id: string, patch: MatterPatch, signal?: AbortSignal): Promise<Matter> {
    const dto = await this.api.patch<{ task: TaskDto }>(`/me/tasks/${id}`, patch, signal);
    return toMatter(dto.task);
  }

  async remove(id: string, signal?: AbortSignal): Promise<{ undoToken: string | null }> {
    return this.api.delete<{ undoToken: string | null }>(`/me/tasks/${id}`, signal);
  }

  async undo(token: string, signal?: AbortSignal): Promise<{ restored: number }> {
    return this.api.post<{ restored: number }>(`/me/tasks/undo/${token}`, {}, signal);
  }
}
