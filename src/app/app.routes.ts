import { Routes } from '@angular/router';

import { authGuard, guestGuard } from '@application/auth/auth.guards';

/**
 * Every feature route is lazy.
 *
 * Not premature optimisation: the calendar pulls a month of matters and the
 * insights page pulls a twelve-week window and draws charts. Neither has any
 * business being in the bundle that renders a sign-in form. The shell is eager
 * because it IS the frame every child paints into.
 */
export const routes: Routes = [
  {
    path: 'sign-in',
    canActivate: [guestGuard],
    loadComponent: () => import('@presentation/auth/sign-in.page').then((m) => m.SignInPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('@presentation/shell/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: 'calendar',
        loadComponent: () =>
          import('@presentation/calendar/calendar.page').then((m) => m.CalendarPage),
      },
      {
        path: 'matters',
        loadComponent: () =>
          import('@presentation/matters/matters.page').then((m) => m.MattersPage),
      },
      {
        path: 'insights',
        loadComponent: () =>
          import('@presentation/insights/insights.page').then((m) => m.InsightsPage),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('@presentation/profile/profile.page').then((m) => m.ProfilePage),
      },
      // The calendar is the landing surface, not a dashboard summary. It
      // answers "what is coming at me", which is the question a desktop visit
      // almost always opens with.
      { path: '', pathMatch: 'full', redirectTo: 'calendar' },
    ],
  },
  { path: '**', redirectTo: '' },
];
