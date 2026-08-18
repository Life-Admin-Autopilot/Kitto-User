import { Injectable, inject } from '@angular/core';

import type { FinanceSummary, FinanceWindow } from '@domain/finance/finance';
import { FinanceRepository } from '@domain/finance/finance.repository';
import { ApiClient } from '../http/api.client';
import { toFinanceSummary, type FinanceSummaryDto } from './finance.mapper';

/**
 * The HTTP adapter for the money port.
 *
 * One GET. The server clamps `months` to 1–24 and falls back to its own default
 * on a junk value rather than 400ing, so there is nothing to validate here — and
 * re-validating it on this side would put the allowed range in two places.
 */
@Injectable()
export class HttpFinanceRepository extends FinanceRepository {
  private readonly api = inject(ApiClient);

  async summary(months: FinanceWindow, signal?: AbortSignal): Promise<FinanceSummary> {
    const dto = await this.api.get<{ finance: FinanceSummaryDto }>(
      '/me/finance/summary',
      { months },
      signal,
    );
    return toFinanceSummary(dto.finance);
  }
}
