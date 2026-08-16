import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The Kitto mascot.
 *
 * The coral ghost, taken from the mobile app's `assets/ghost/logo.png` and
 * re-encoded to a 256px webp — 713 kB of PNG became 12 kB, which matters for an
 * asset that appears in the sidebar on every route.
 *
 * NOT the panda from `assets/images/mascot/`. That set is the retired v1
 * identity and the mobile AGENTS.md is explicit that it must not come back.
 *
 * Width and height are always set. The mascot sits in a sidebar above navigation
 * and on the sign-in card above a form; an unsized image reflows both the moment
 * it decodes, which is the one layout shift a user is guaranteed to be looking
 * at.
 */
@Component({
  selector: 'app-kitto-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img
      src="kitto-logo.webp"
      [width]="size()"
      [height]="size()"
      [alt]="label()"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.loading]="eager() ? null : 'lazy'"
      [attr.fetchpriority]="eager() ? 'high' : null"
      class="block shrink-0 select-none object-contain"
      draggable="false"
    />
  `,
})
export class KittoLogo {
  /** Rendered box in px. The art is square. */
  readonly size = input(32);

  /** Accessible name. Leave empty for decorative use beside a wordmark. */
  readonly label = input('');

  /** Set on the first mascot the page paints, so it is not lazy-loaded. */
  readonly eager = input(false);
}
