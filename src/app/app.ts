import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeStore } from '@application/theme/theme.store';

/**
 * The root. Nothing but an outlet — the shell that draws navigation is a routed
 * component behind the auth guard, so the sign-in page can render without it.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  /**
   * Instantiated here and nowhere else, so the palette applies to EVERY route.
   * Injecting it in the shell would leave the sign-in page — the one screen a
   * signed-out visitor ever sees — stuck on light.
   */
  private readonly theme = inject(ThemeStore);
}
