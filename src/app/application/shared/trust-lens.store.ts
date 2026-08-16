import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

import type { Matter } from '@domain/matters/matter';

/**
 * The trust lens — one switch that turns the whole dashboard into a review
 * queue, and back.
 *
 * When it is on, everything the system is confident about recedes and only the
 * values it GUESSED stay lit: low-confidence extractions, and times nobody
 * actually chose (`dateOnly` / `floating`).
 *
 * A mode rather than a screen, deliberately. The product's stated first risk is
 * a wrong extracted value — a renewal date read off a bill, "1/12" parsed as
 * January 12 instead of 1 December — and the honest answer to that is not a
 * separate page you have to remember to visit. It is the ability to ask "what
 * here did you make up?" of whatever you are already looking at, and get the
 * answer in place.
 *
 * Implemented as a class on <html> plus a data attribute per element, so the
 * dimming is one CSS rule rather than a conditional class binding repeated
 * across every component that renders a matter. Components mark their elements
 * with `[attr.data-trust]`; the stylesheet decides what that means.
 */
@Injectable({ providedIn: 'root' })
export class TrustLensStore {
  private readonly document = inject(DOCUMENT);
  private readonly activeSignal = signal(false);

  readonly active = this.activeSignal.asReadonly();

  constructor() {
    effect(() => {
      this.document.documentElement.classList.toggle('trust-lens', this.activeSignal());
    });
  }

  toggle(): void {
    this.activeSignal.update((on) => !on);
  }
}

/**
 * What the lens should say about one matter.
 *
 * `guessed` — the system inferred something here that nobody confirmed.
 * `certain` — every value on it was either typed by a person or extracted with
 * high confidence.
 *
 * Exported as a pure function rather than a method so templates and the store
 * cannot disagree about the rule, and so it stays testable without Angular.
 */
export function trustOf(matter: Matter): 'guessed' | 'certain' {
  const assumedTime = matter.timePrecision === 'dateOnly' || matter.timePrecision === 'floating';
  const lowConfidence = matter.confidence === 'low' || matter.confidence === 'medium';
  return assumedTime || lowConfidence ? 'guessed' : 'certain';
}
