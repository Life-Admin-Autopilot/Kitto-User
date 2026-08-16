import type {
  Matter,
  MatterConfidence,
  MatterDomain,
  MatterExternalSource,
  MatterKind,
  MatterPriority,
  MatterStatus,
  MatterTimePrecision,
} from '@domain/matters/matter';
import type { MatterCounts } from '@domain/matters/matter-query';

/**
 * The wire shape of a matter.
 *
 * The API calls it a `task`, because the route is `/me/tasks` and always has
 * been. The product calls it a matter. This file is the ONLY place those two
 * names meet — the rename happens on the way in, and no layer above
 * infrastructure ever sees the word "task".
 */
export interface TaskDto {
  id: string;
  title: string;
  domain: MatterDomain;
  kind: MatterKind;
  status: MatterStatus;
  priority: MatterPriority;
  priorityRank?: number;
  tags?: string[];
  subtasks?: { id: string; text: string; done: boolean }[];
  reminders?: { at: string; firedAt?: string; kind: 'lead' | 'due' | 'ai' }[];
  dueAt?: string;
  notes?: string;
  completedAt?: string;
  snoozedUntil?: string;
  confidence?: MatterConfidence;
  estimate?: { minMinutes: number; maxMinutes: number; source: 'ai' | 'user' };
  sourceVoiceNoteId?: string;
  sourceDocumentId?: string;
  externalSource?: MatterExternalSource;
  timePrecision?: MatterTimePrecision;
  rescheduleCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListDto {
  tasks: TaskDto[];
  total: number;
  nextCursor: string | null;
}

export interface TaskCountsDto {
  overdue?: number;
  today?: number;
  tomorrow?: number;
  thisWeek?: number;
  later?: number;
  undated?: number;
  open?: number;
  done?: number;
  trashed?: number;
  slipping?: number;
  completedToday?: number;
  needsInput?: number;
  scansAwaitingReview?: number;
  byDomain?: Partial<Record<MatterDomain, number>>;
  byPriority?: Partial<Record<MatterPriority, number>>;
}

/**
 * Collections default to empty and counters to zero.
 *
 * Not defensiveness for its own sake: `subtasks`, `tags` and `reminders` are
 * genuinely absent on matters created before those features existed, and
 * `rescheduleCount` is absent on anything predating the counter. Every one of
 * those is a real row in a real account, and a table that throws on the third
 * page because one 2025 matter has no `tags` array is a bug the mapper is
 * supposed to absorb.
 */
export function toMatter(dto: TaskDto): Matter {
  return {
    id: dto.id,
    title: dto.title,
    domain: dto.domain,
    kind: dto.kind,
    status: dto.status,
    priority: dto.priority,
    priorityRank: dto.priorityRank ?? 0,
    tags: dto.tags ?? [],
    subtasks: dto.subtasks ?? [],
    reminders: dto.reminders ?? [],
    dueAt: dto.dueAt,
    notes: dto.notes,
    completedAt: dto.completedAt,
    snoozedUntil: dto.snoozedUntil,
    confidence: dto.confidence,
    estimate: dto.estimate,
    sourceVoiceNoteId: dto.sourceVoiceNoteId,
    sourceDocumentId: dto.sourceDocumentId,
    externalSource: dto.externalSource,
    timePrecision: dto.timePrecision,
    rescheduleCount: dto.rescheduleCount ?? 0,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toCounts(dto: TaskCountsDto): MatterCounts {
  return {
    overdue: dto.overdue ?? 0,
    today: dto.today ?? 0,
    tomorrow: dto.tomorrow ?? 0,
    thisWeek: dto.thisWeek ?? 0,
    later: dto.later ?? 0,
    undated: dto.undated ?? 0,
    open: dto.open ?? 0,
    done: dto.done ?? 0,
    trashed: dto.trashed ?? 0,
    slipping: dto.slipping ?? 0,
    completedToday: dto.completedToday ?? 0,
    needsInput: dto.needsInput ?? 0,
    scansAwaitingReview: dto.scansAwaitingReview ?? 0,
    byDomain: dto.byDomain ?? {},
    byPriority: dto.byPriority ?? {},
  };
}
