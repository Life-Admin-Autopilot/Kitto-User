import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { DashboardFilterStore } from '@application/shared/dashboard-filter.store';
import { OverlayStore } from '@application/shared/overlay.store';
import { ThemeStore } from '@application/theme/theme.store';
import { TrustLensStore } from '@application/shared/trust-lens.store';
import { MATTER_DOMAINS, type MatterDomain } from '@domain/matters/matter';
import { DOMAIN_META } from '@presentation/shared/domain-meta';

interface Command {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  /** Extra words that should match this command without being displayed. */
  readonly keywords: string;
  readonly run: () => void;
}

/**
 * ⌘K.
 *
 * Every navigation and every cross-filter reachable without moving a hand to
 * the mouse. On a desktop this is the difference between a dashboard you look
 * at and one you operate — and it costs a keydown listener and a filter.
 *
 * Mounted once in the shell rather than per page, so the shortcut works
 * everywhere behind the auth guard and the command list cannot drift between
 * routes.
 *
 * Deliberately NOT a search over matters. The list here is actions the app can
 * take, which is a closed, knowable set; mixing server search results into the
 * same list would make the palette's contents depend on network state and its
 * first row unpredictable — and an unpredictable first row is fatal to a
 * control whose whole promise is "type two letters and press Enter".
 */
@Component({
  selector: 'app-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 pt-[15vh] backdrop-blur-sm"
        (click)="close()"
      >
        <div
          class="w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-elevated"
          (click)="$event.stopPropagation()"
        >
          <!-- Focus is load-bearing, not a nicety. Without it every letter
               typed here reaches the document and is read by the Matters
               page's J/K/E/S handler, so typing "settings" would complete and
               snooze matters silently. OverlayStore is the second line of
               defence for the same reason. -->
          <input
            #field
            type="text"
            placeholder="Type a command…"
            [value]="query()"
            (input)="onInput($event)"
            autocomplete="off"
            class="w-full bg-transparent px-4 py-3.5 text-body text-ink outline-none placeholder:text-ink-subtle"
          />

          <div class="max-h-80 overflow-y-auto border-t border-hairline">
            @for (command of results(); track command.id; let i = $index) {
              <button
                type="button"
                (click)="run(command)"
                (mouseenter)="active.set(i)"
                class="flex w-full items-center gap-3 px-4 py-2.5 text-start"
                [class.bg-surface-sunken]="i === activeIndex()"
              >
                <span class="flex-1 truncate text-body-sm text-ink">{{ command.label }}</span>
                <span class="shrink-0 text-micro text-ink-subtle">{{ command.hint }}</span>
              </button>
            } @empty {
              <p class="px-4 py-6 text-center text-body-sm text-ink-muted">Nothing matches.</p>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CommandPalette {
  private readonly router = inject(Router);
  private readonly filter = inject(DashboardFilterStore);
  private readonly lens = inject(TrustLensStore);
  private readonly theme = inject(ThemeStore);
  private readonly overlay = inject(OverlayStore);

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);

  constructor() {
    // Focus the field as soon as it exists, and claim the keyboard for as long
    // as the palette is up. `afterNextRender` timing is what the viewChild
    // signal gives us for free: it only resolves once the element is in the DOM.
    effect(() => {
      if (this.open()) {
        this.field()?.nativeElement.focus();
      }
    });
  }

  private readonly commands = computed<Command[]>(() => [
    {
      id: 'nav:calendar',
      label: 'Go to Calendar',
      hint: 'navigate',
      keywords: 'month grid schedule',
      run: () => void this.router.navigate(['/calendar']),
    },
    {
      id: 'nav:matters',
      label: 'Go to Matters',
      hint: 'navigate',
      keywords: 'list table backlog tasks',
      run: () => void this.router.navigate(['/matters']),
    },
    {
      id: 'nav:insights',
      label: 'Go to Insights',
      hint: 'navigate',
      keywords: 'charts stats analytics',
      run: () => void this.router.navigate(['/insights']),
    },
    ...MATTER_DOMAINS.map((domain) => ({
      id: `filter:${domain}`,
      label: `Filter to ${DOMAIN_META[domain].label}`,
      hint: 'filter',
      keywords: `domain ${domain}`,
      run: () => this.applyDomain(domain),
    })),
    {
      id: 'filter:clear',
      label: 'Clear all filters',
      hint: 'filter',
      keywords: 'reset show everything',
      run: () => this.filter.clear(),
    },
    {
      id: 'lens',
      label: 'Toggle the trust lens',
      hint: 'view',
      keywords: 'confidence ai guessed unsure provenance',
      run: () => this.lens.toggle(),
    },
    {
      id: 'theme',
      label: 'Change theme',
      hint: 'view',
      keywords: 'dark light system appearance',
      run: () => this.theme.cycle(),
    },
  ]);

  /**
   * Subsequence matching, not substring.
   *
   * "gtc" finds "Go to Calendar". This is what makes a palette feel fast — you
   * type the initials you were already thinking rather than a prefix you have
   * to recall exactly.
   */
  protected readonly results = computed(() => {
    const needle = this.query().trim().toLowerCase();
    if (!needle) return this.commands();
    return this.commands().filter((command) =>
      isSubsequence(needle, `${command.label} ${command.keywords}`.toLowerCase()),
    );
  });

  protected readonly activeIndex = computed(() =>
    Math.min(this.active(), Math.max(0, this.results().length - 1)),
  );

  protected onKeydown(event: KeyboardEvent): void {
    // Open on ⌘K / Ctrl-K from anywhere, including from inside a text field:
    // the shortcut is reserved and no input has a competing meaning for it.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.toggle();
      return;
    }

    if (!this.open()) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.active.set(this.activeIndex() + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set(Math.max(0, this.activeIndex() - 1));
        break;
      case 'Enter': {
        event.preventDefault();
        const command = this.results()[this.activeIndex()];
        if (command) this.run(command);
        break;
      }
    }
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    // Reset to the top on every keystroke: the list just changed underneath,
    // so keeping the old index would leave the highlight on an unrelated row.
    this.active.set(0);
  }

  protected run(command: Command): void {
    command.run();
    this.close();
  }

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.query.set('');
    this.active.set(0);
    this.overlay.release();
  }

  private toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    this.overlay.claim();
  }

  private applyDomain(domain: MatterDomain): void {
    this.filter.setDomain(domain);
    void this.router.navigate(['/matters']);
  }
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index++;
    if (index === needle.length) return true;
  }
  return index === needle.length;
}
