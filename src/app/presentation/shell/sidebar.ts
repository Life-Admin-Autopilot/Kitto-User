import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { SessionStore } from '@application/auth/session.store';
import { ThemeStore } from '@application/theme/theme.store';
import { firstNameOf } from '@domain/auth/session';
import { KittoLogo } from '@presentation/shared/kitto-logo';

interface NavEntry {
  readonly route: string;
  readonly label: string;
  /** Inline SVG path data — see the note on why there is no icon library. */
  readonly path: string;
}

/**
 * Navigation. Six entries eventually; three while the other surfaces live only
 * on the phone.
 *
 * The icons are hand-written SVG paths rather than an icon package. A
 * dependency that ships a thousand glyphs to render three is a poor trade in a
 * bundle that has to stay small, and these three are simple enough that the
 * path data is shorter than the import would be.
 */
const NAV: readonly NavEntry[] = [
  {
    route: '/calendar',
    label: 'Calendar',
    path: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  },
  {
    route: '/matters',
    label: 'Matters',
    path: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  },
  {
    route: '/insights',
    label: 'Insights',
    path: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  },
];

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, KittoLogo],
  template: `
    <nav class="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-1 bg-surface px-4 py-6">
      <div class="mb-7 flex items-center gap-2.5 px-3">
        <app-kitto-logo [size]="34" [eager]="true" />
        <span class="text-heading-md text-ink">Kitto</span>
      </div>

      @for (entry of nav; track entry.route) {
        <a
          [routerLink]="entry.route"
          routerLinkActive="bg-surface-sunken !text-ink"
          class="flex items-center gap-3 rounded-pill px-3 py-2.5 text-body-sm text-ink-muted transition-colors hover:bg-surface-sunken/60 hover:text-ink"
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path [attr.d]="entry.path" />
          </svg>
          <span>{{ entry.label }}</span>
        </a>
      }

      <div class="mt-auto flex flex-col gap-1 border-t border-hairline pt-4">
        <p class="truncate px-3 text-caption text-ink-muted">{{ email() }}</p>

        <button
          type="button"
          (click)="theme.cycle()"
          [attr.aria-label]="'Theme: ' + theme.preference() + '. Change.'"
          class="flex items-center gap-3 rounded-pill px-3 py-2 text-body-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path [attr.d]="themeIcon()" />
          </svg>
          <span class="capitalize">{{ theme.preference() }}</span>
        </button>

        <button
          type="button"
          (click)="signOut()"
          class="rounded-pill px-3 py-2 text-start text-body-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </nav>
  `,
})
export class Sidebar {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeStore);

  protected readonly nav = NAV;

  /** Sun, moon, or monitor — whichever names the CHOICE, not the result. A
   *  `system` preference showing a moon would suggest dark was picked. */
  protected themeIcon(): string {
    switch (this.theme.preference()) {
      case 'light':
        return 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z';
      case 'dark':
        return 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z';
      default:
        return 'M8 21h8M12 17v4M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z';
    }
  }

  protected email(): string {
    return this.session.account()?.email ?? firstNameOf(null, 'Account');
  }

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/sign-in']);
  }
}
