# Working conventions

Notes for anyone making changes in this repo, human or assistant.

## Attribution

**Commits and pull requests carry no tool attribution.**

- No `Co-Authored-By:` trailer naming an AI assistant or any other tool.
- No "generated with", "created by \<tool\>", or similar notice in a commit
  message, a pull-request body, a file header or a code comment.
- A commit's author is the person who made it. Nothing else is added.

This holds on every branch, including ones nobody expects to read again. If a
tool appends a trailer by default, strip it before committing — do not leave it
for someone else to clean up, and do not offer to add one.

## Running the tests

Use `npm test`. It runs `ng test`, which is the `@angular/build:unit-test`
builder driving vitest.

**Do not run `npx vitest run` directly.** There is no `vitest.config.ts` in this
repo — the path aliases (`@domain/*`, `@application/*`, `@infrastructure/*`,
`@presentation/*`, `@env/*`) come from `tsconfig.json` by way of the Angular
builder. Invoked on its own, vitest resolves none of them and reports a pile of
"Cannot find package" failures in specs that are perfectly fine.

## Layout

`domain/` → `application/` → `infrastructure/` → `presentation/`, with the
composition root in `src/app/app.config.ts`. Dependencies point inward only:
`domain/` holds interfaces and types and knows nothing about the layers outside
it, and `infrastructure/` supplies the implementations that `app.config.ts`
binds to those interfaces.

Mapping between the wire and the domain happens in one place per feature — the
`*.mapper.ts` in `infrastructure/`. That makes it the one spot where a field can
go missing with nothing failing, so mappers are worth a spec.
