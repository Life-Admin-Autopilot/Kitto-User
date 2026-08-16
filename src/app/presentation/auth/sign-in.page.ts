import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { SessionStore } from '@application/auth/session.store';
import { AuthRejectedError } from '@domain/auth/auth-errors';
import { ApiError } from '@infrastructure/http/api-error';
import { KittoLogo } from '@presentation/shared/kitto-logo';

@Component({
  selector: 'app-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, KittoLogo],
  template: `
    <div class="grid min-h-dvh place-items-center bg-canvas px-6">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-3">
          <app-kitto-logo [size]="88" [eager]="true" label="Kitto" />
          <h1 class="font-display text-display-md text-ink">Kitto</h1>
          <p class="text-body-sm text-ink-muted">Sign in to your dashboard.</p>
        </div>

        <form
          [formGroup]="form"
          (ngSubmit)="submit()"
          class="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-card"
        >
          <label class="flex flex-col gap-1.5">
            <span class="text-caption text-ink-muted">Email</span>
            <input
              type="email"
              formControlName="email"
              autocomplete="email"
              class="rounded-lg bg-surface-sunken px-3 py-2.5 text-body-sm text-ink outline-none focus:ring-2 focus:ring-accent"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-caption text-ink-muted">Password</span>
            <input
              type="password"
              formControlName="password"
              autocomplete="current-password"
              class="rounded-lg bg-surface-sunken px-3 py-2.5 text-body-sm text-ink outline-none focus:ring-2 focus:ring-accent"
            />
          </label>

          @if (error(); as message) {
            <p role="alert" class="rounded-lg bg-danger-soft px-3 py-2 text-body-sm text-danger">
              {{ message }}
            </p>
          }

          <button
            type="submit"
            [disabled]="busy() || form.invalid"
            class="rounded-pill bg-solid px-4 py-3 text-body-sm font-bold text-solid-ink transition-opacity disabled:opacity-40"
          >
            {{ busy() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class SignInPage {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);

    try {
      await this.session.signIn(this.form.getRawValue());
      // Return the visitor to whatever they were trying to reach. Falls back to
      // the calendar rather than to "/" so a stale returnTo cannot bounce them
      // through the guard a second time.
      const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
      await this.router.navigateByUrl(returnTo ?? '/calendar');
    } catch (failure: unknown) {
      this.error.set(messageFor(failure));
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * Say the true thing about why this failed.
 *
 * Three cases, three sentences, because they need three different actions from
 * the person reading them: fix your typing, wait, or check the server is
 * running. Collapsing them into "Something went wrong" is what makes a
 * dashboard feel broken when it is merely offline.
 */
function messageFor(failure: unknown): string {
  if (failure instanceof AuthRejectedError) return 'Email or password is incorrect.';
  if (failure instanceof ApiError) {
    // Status 0 is every failure where no response arrived: the server is down,
    // the DNS lookup failed, or CORS rejected the request before the browser
    // would show it to us. Those are genuinely indistinguishable from
    // JavaScript — the fetch spec deliberately hides which one it was — so the
    // message names both plausible causes rather than guessing one and sending
    // someone to restart a server that was running the whole time.
    if (failure.isNetworkFailure) {
      return 'No response from the server. Check that it is running, and that this origin is allowed by its CORS configuration.';
    }
    if (failure.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
    return failure.message;
  }
  return 'Sign-in failed. Try again.';
}
