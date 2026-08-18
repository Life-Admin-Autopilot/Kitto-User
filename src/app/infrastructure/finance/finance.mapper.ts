import type {
  FinanceCurrencyBlock,
  FinanceDomainSpend,
  FinanceEntry,
  FinanceSummary,
  MoneySource,
} from '@domain/finance/finance';
import { MATTER_DOMAINS, type MatterDomain } from '@domain/matters/matter';

/**
 * The wire shape of `/me/finance/summary`.
 *
 * Every collection is optional here even though the server always sends one.
 * A summary is drawn as charts, and a chart handed `undefined` where it expected
 * an array throws inside a template expression — which takes the whole Insights
 * page down rather than degrading one panel. Defaulting on the way in costs a
 * `?? []` per field and removes the class of failure.
 */
export interface FinanceMonthDto {
  month: string;
  spentMinor: number;
  count: number;
}

export interface FinanceDomainDto {
  domain: string;
  spentMinor: number;
  count: number;
}

export interface FinanceEntryDto {
  id: string;
  kind?: string;
  title: string;
  domain?: string;
  amountMinor: number;
  source?: string;
  at?: string;
  overdue?: boolean;
}

export interface FinanceCurrencyDto {
  currency: string;
  spentThisMonthMinor: number;
  spentLastMonthMinor: number;
  spentWindowMinor: number;
  receivedWindowMinor: number;
  overdueMinor: number;
  overdueCount: number;
  upcomingMinor: number;
  upcomingCount: number;
  byMonth?: FinanceMonthDto[];
  byDomain?: FinanceDomainDto[];
  largest?: FinanceEntryDto[];
  upcoming?: FinanceEntryDto[];
}

export interface FinanceCoverageDto {
  documentsTotal?: number;
  documentsWithAmount?: number;
  mattersWithAmount?: number;
}

export interface FinanceSummaryDto {
  months: number;
  timezone?: string;
  generatedAt?: string;
  currencies?: FinanceCurrencyDto[];
  coverage?: FinanceCoverageDto;
}

export function toFinanceSummary(dto: FinanceSummaryDto): FinanceSummary {
  return {
    months: dto.months,
    timezone: dto.timezone ?? 'UTC',
    generatedAt: dto.generatedAt ?? new Date().toISOString(),
    currencies: (dto.currencies ?? []).map(toCurrencyBlock),
    coverage: {
      documentsTotal: dto.coverage?.documentsTotal ?? 0,
      documentsWithAmount: dto.coverage?.documentsWithAmount ?? 0,
      mattersWithAmount: dto.coverage?.mattersWithAmount ?? 0,
    },
  };
}

function toCurrencyBlock(dto: FinanceCurrencyDto): FinanceCurrencyBlock {
  return {
    currency: dto.currency,
    spentThisMonthMinor: dto.spentThisMonthMinor,
    spentLastMonthMinor: dto.spentLastMonthMinor,
    spentWindowMinor: dto.spentWindowMinor,
    receivedWindowMinor: dto.receivedWindowMinor,
    overdueMinor: dto.overdueMinor,
    overdueCount: dto.overdueCount,
    upcomingMinor: dto.upcomingMinor,
    upcomingCount: dto.upcomingCount,
    byMonth: (dto.byMonth ?? []).map((month) => ({
      month: month.month,
      spentMinor: month.spentMinor,
      count: month.count,
    })),
    byDomain: (dto.byDomain ?? []).flatMap(toDomainSpend),
    largest: (dto.largest ?? []).map(toEntry),
    upcoming: (dto.upcoming ?? []).map(toEntry),
  };
}

/**
 * A breakdown row, dropped when its domain is not one this client draws.
 *
 * `flatMap` rather than `map`, because the alternatives are both worse: an
 * "Other" bucket would invent a seventh life area the product does not have, and
 * a fallback to `home` would file someone's money under the wrong heading. The
 * six domains are a closed set the server shares, so this should never fire —
 * and if the set ever grows, an area silently missing from one chart is a far
 * smaller wrong than an area mislabelled in it.
 */
function toDomainSpend(dto: FinanceDomainDto): FinanceDomainSpend[] {
  const domain = toDomain(dto.domain);
  return domain ? [{ domain, spentMinor: dto.spentMinor, count: dto.count }] : [];
}

function toEntry(dto: FinanceEntryDto): FinanceEntry {
  return {
    id: dto.id,
    kind: dto.kind === 'document' ? 'document' : 'matter',
    title: dto.title,
    domain: toDomain(dto.domain),
    amountMinor: dto.amountMinor,
    source: toSource(dto.source),
    at: dto.at,
    overdue: dto.overdue ?? false,
  };
}

/**
 * `ai` unless the server said `user`.
 *
 * The default leans toward "we guessed", never away from it. An unknown value
 * rendered as user-typed would strip the provenance mark off a figure nobody
 * confirmed — the exact trust failure the mark exists to prevent.
 */
function toSource(raw: string | undefined): MoneySource {
  return raw === 'user' ? 'user' : 'ai';
}

function toDomain(raw: string | undefined): MatterDomain | undefined {
  return MATTER_DOMAINS.find((domain) => domain === raw);
}
