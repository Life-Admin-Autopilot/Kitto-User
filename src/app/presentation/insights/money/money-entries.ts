import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { FinanceStore } from '@application/finance/finance.store';
import type { FinanceEntry } from '@domain/finance/finance';
import { DOMAIN_META } from '@presentation/shared/domain-meta';
import { dueLabel } from '@presentation/shared/due-label';

/**
 * Priced things, as rows or as cards.
 *
 * One component for both lists on the money panel, because the two share every
 * rule that matters: what an extracted figure is marked with, how an undated
 * obligation is worded, which amounts turn red. Splitting them into two
 * components is how those rules start to disagree.
 *
 * `layout` chooses the shape only. `list` is a vertical stack for obligations,
 * where the reader is scanning dates; `cards` is a horizontal rank for the
 * largest payments, where the reader is scanning amounts and the row is
 * comparative rather than sequential.
 *
 * Every row carries `data-trust`, so the dashboard's trust lens covers money as
 * well as matters — a figure read off a bill by a vision pass is exactly the
 * kind of value the lens exists to surface.
 */
@Component({
  selector: 'app-money-entries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length === 0) {
      <p class="text-body-sm text-ink-muted">{{ emptyLabel() }}</p>
    } @else if (layout() === 'cards') {
      <ul class="grid grid-cols-5 gap-2.5">
        @for (entry of entries(); track entry.id) {
          <li
            class="flex flex-col gap-1.5 rounded-xl border border-hairline bg-surface p-3"
            [attr.data-trust]="trust(entry)"
          >
            <span class="flex items-center gap-1.5">
              <span
                class="grid size-6 shrink-0 place-items-center rounded-full text-[11px]"
                [class]="chip(entry)"
                aria-hidden="true"
                >{{ mark(entry) }}</span
              >
              @if (entry.source === 'ai') {
                <span class="text-micro text-ink-subtle" [title]="extractedTitle">read</span>
              }
            </span>
            <span class="tabular font-display text-heading-sm text-ink">{{
              store.money(entry.amountMinor)
            }}</span>
            <span class="line-clamp-2 text-caption text-ink-muted">{{ entry.title }}</span>
            <span class="mt-auto text-micro text-ink-subtle">{{ when(entry) }}</span>
          </li>
        }
      </ul>
    } @else {
      <ul class="flex flex-col gap-1.5">
        @for (entry of entries(); track entry.id) {
          <li
            class="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface px-3 py-2.5"
            [attr.data-trust]="trust(entry)"
          >
            <span
              class="grid size-7 shrink-0 place-items-center rounded-full text-[12px]"
              [class]="chip(entry)"
              aria-hidden="true"
              >{{ mark(entry) }}</span
            >

            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-body-sm text-ink">{{ entry.title }}</span>
              <span class="flex items-center gap-1.5">
                <span
                  class="text-micro"
                  [class.text-danger]="entry.overdue"
                  [class.text-ink-muted]="!entry.overdue"
                  >{{ when(entry) }}</span
                >
                @if (entry.source === 'ai') {
                  <span
                    class="rounded-pill bg-accent-soft px-1.5 py-px text-micro text-accent"
                    [title]="extractedTitle"
                    >Extracted</span
                  >
                }
              </span>
            </span>

            <span
              class="tabular shrink-0 text-body-sm"
              [class.text-danger]="entry.overdue"
              [class.text-ink]="!entry.overdue"
              >{{ store.money(entry.amountMinor) }}</span
            >
          </li>
        }
      </ul>
    }
  `,
})
export class MoneyEntries {
  readonly entries = input.required<readonly FinanceEntry[]>();
  readonly emptyLabel = input.required<string>();
  readonly layout = input<'list' | 'cards'>('list');

  protected readonly store = inject(FinanceStore);

  protected readonly extractedTitle = 'This figure was read off a document, not typed.';

  /**
   * An extracted figure is a guess until someone confirms it; a typed one is
   * not. Deliberately simpler than `trustOf` for matters — an entry carries no
   * time precision and no confidence band, so provenance is the whole signal
   * available here, and pretending otherwise would mark rows on nothing.
   */
  protected trust(entry: FinanceEntry): 'guessed' | 'certain' {
    return entry.source === 'ai' ? 'guessed' : 'certain';
  }

  protected chip(entry: FinanceEntry): string {
    return entry.domain ? DOMAIN_META[entry.domain].bg : 'bg-surface-field';
  }

  /**
   * The domain emoji, or a page for a document nobody filed. Not a blank circle:
   * an entry with no area is a real payment the system read, and an empty mark
   * beside it reads as a rendering failure rather than as missing filing.
   */
  protected mark(entry: FinanceEntry): string {
    return entry.domain ? DOMAIN_META[entry.domain].emoji : '📄';
  }

  protected when(entry: FinanceEntry): string {
    if (!entry.at) return 'No date';
    const label = dueLabel(entry.at, this.store.intlTag());
    return entry.overdue ? `Overdue · ${label.text}` : label.text;
  }
}
