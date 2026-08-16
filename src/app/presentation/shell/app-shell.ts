import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';

/**
 * The desktop frame: a fixed navigation rail and a fluid content column.
 *
 * The content column is capped rather than fully fluid. A matters table
 * stretched across a 34" monitor puts the title and the due date so far apart
 * that reading one row takes a head movement — the cap is a legibility measure,
 * not a stylistic one, and the calendar opts out of it because a month grid
 * genuinely wants every pixel it can get.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, CommandPalette],
  template: `
    <div class="flex min-h-dvh bg-canvas">
      <app-sidebar />
      <main class="min-w-0 flex-1">
        <router-outlet />
      </main>
    </div>
    <!-- Mounted here, not per page: the shortcut has to work on every route,
         and one instance means the command list cannot drift between them. -->
    <app-command-palette />
  `,
})
export class AppShell {}
