# Kitto — Dashboard

The desktop companion to the Kitto mobile app. Angular 21, standalone components,
signals, zoneless change detection, Tailwind v4.

It talks to the same .NET backend as the phone app and shows the surfaces a
390px screen cannot: a month calendar, the full backlog as a filterable table,
and behavioural insights.

## Running it

```bash
npm install
npm start          # http://localhost:4200
```

The backend must be running on `http://localhost:4000` first — see
`docs/RUNNING.md` in the backend repo. Without it every request fails and the
sign-in form says so rather than pretending to be broken.

`src/environments/environment.development.ts` holds the dev API URL.
Production has no default on purpose: a build that ships without a real
`apiBaseUrl` should fail loudly rather than quietly point somewhere plausible.

```bash
npm run build      # production bundle into dist/
npm test           # Vitest
```

## Architecture

Clean Architecture, four layers, dependencies pointing strictly inward.

```
src/app/
  domain/          entities, repository PORTS, pure rules.  Imports NOTHING.
  application/     stores, use-cases, orchestration.        Imports domain.
  infrastructure/  HTTP adapters, DTO mappers, interceptor. Imports domain.
  presentation/    standalone components and pages.         Imports application.
```

The dependency rule is enforced by path aliases (`@domain/*`, `@application/*`,
`@infrastructure/*`, `@presentation/*`) declared in `tsconfig.json`. They are not
cosmetic: an import of `@infrastructure/…` inside a domain file is a one-line
review catch, whereas the same violation written as `../../infrastructure/…`
disappears into the noise.

**`app.config.ts` is the composition root** — the only file that knows both a
port and its adapter. Every binding reads "this abstraction is satisfied by that
implementation". Swapping one line swaps an implementation app-wide: an
in-memory repository for a demo without a backend, a mocked auth adapter for
tests. Nothing above that file changes.

### Why ports are abstract classes

An abstract class is *both* the compile-time type and a runtime DI token, so the
binding in the composition root cannot drift from the type the store consumes.
An interface erases at runtime and would force a hand-maintained `InjectionToken`
beside it — two things to keep in sync, and nothing to catch you when they stop
being.

### Why ports return Promises, not Observables

RxJS is a framework dependency and `domain/` has none. Promises also drop
straight into Angular's `resource()` loader, which hands you an `AbortSignal` —
so cancelling a stale request is free and explicit rather than a subscription
lifecycle nobody owns.

## Authentication

The server rotates refresh tokens and invalidates the presented one
**immediately**, so a refresh token is single-use. Two callers presenting the
same token get back 200 and 401 — measured against the live server, not
theorised.

`application/auth/token-rotator.ts` is the only place a refresh token is ever
spent, and it holds three rules that each exist because breaking it signs a
perfectly healthy user out:

1. **One rotation in flight.** A cold load opening the calendar, the counts and
   the tag list produces three simultaneous 401s. Three rotations means two
   guaranteed losers.
2. **Losing the race is not a dead session.** If the stored token changed while
   this attempt was running, a concurrent rotation already installed a good pair.
3. **A network failure costs nothing.** Only an explicit refusal —
   `AuthRejectedError`, raised by the adapter for a 401/403 and nothing else —
   ends a session. A 5xx or an offline moment must not.

The HTTP interceptor depends on the `SessionRefresher` *port*, not on the class
that implements it, so the transport layer never reaches upward into application
code.

## Design

The tokens in `src/styles.css` are ported verbatim from the mobile app's
`app/globals.css` — same near-white lilac canvas, same coral, same six domain
pastels, same Fraunces/Nunito pairing. Copied rather than re-picked: two surfaces
of one product drifting to two near-identical corals is worse than either coral.

Rules carried over from the phone app:

- **Semantic tokens only.** No hex literals, no `text-[15px]`, no `gray-500`.
- **Two fills carry meaning and never swap.** `accent` (coral) means *live* —
  active, selected, in progress. `solid` (near-black, inverting in dark) is the
  primary CTA.
- **Nothing is sharp.** Every corner is a pill or a large round.
- **The domain pastels are theme-invariant.** They are the one place hue carries
  meaning, so they are deliberately absent from the `.dark` block.
- **The product noun is "matters", not "tasks".** The API says `/me/tasks` for
  historical reasons; `infrastructure/matters/matter.mapper.ts` is the only place
  those two names meet.

Colour utilities that vary by data are written out in full in
`presentation/shared/domain-meta.ts`, never composed as `` `bg-domain-${domain}` ``.
Tailwind v4 finds classes by scanning source text, so an interpolated name is
invisible to it and the utility is simply never generated — the element renders
with no background and nothing warns you.

Charts are CSS bars rather than SVG or a charting library. They inherit the theme
tokens, mirror correctly in Arabic with no axis maths, and stay legible to a
screen reader as real elements.

## Known limits

- **Client-side aggregation.** The API has no analytics endpoint, so Insights
  buckets matters in the browser. Every window pages with a hard ceiling and the
  page *says so* when it hits one — a chart drawn from a silently truncated set
  is a confident wrong answer. At real scale this becomes a server aggregation
  endpoint.
- **Tokens live in `localStorage`,** which is readable by any script on the
  origin. This matches the mobile app today; `TokenStore` is a port precisely so
  the swap is one adapter.
- **English only.** The mobile app ships English + Arabic with full RTL across
  705 keys. This app uses logical CSS properties throughout so the layout will
  mirror, but the strings are not yet extracted.
- **Financial insights are not built.** They need `amount` and `currency` on the
  matter, which do not exist in the backend today — the document extractor reads
  amounts but discards the structure into a free-text subtitle.
