# Agent Note: the client mirror stays in lockstep

Status: implemented

## Problem

The ✨ button counts seven-block coverage locally and renders a structural fill,
and both need the block patterns. But `client.js` runs in the browser module
table, which serves one entry per package and cannot reach `lib/tune.js` or
`./typert` — so the Client carries its own copy of the patterns. A copy that
nothing holds to the original drifts, and it did: a bare `项目` counted as a data
source in the Client long after the Host analyzer stopped accepting it. The
seven-block analyzer was tightened on the Host
([the analyzer note](../bug-fix/2026-10-30-seven-block-analyzer-tightened.md)),
and the Client kept the loose patterns — so the coverage line reported a block
the Host's own guide refused, and the two halves of one feature disagreed about
the same draft.

The drift is the expensive kind: invisible until someone reads both files side
by side, and it already happened once.

## Decision

The Client's seven-block patterns are a **deliberate mirror** of
[lib/tune.js](../../../../lib/tune.js), kept in lockstep. The mirror exists
because the platform forces it — the browser module table cannot import a
sibling module — and the compensation is a test, not discipline.
[tests/client-pattern-lockstep.test.js](../../../../tests/client-pattern-lockstep.test.js)
reads `client.js` as text and asserts that every Host pattern appears verbatim,
in the Host order, and that the Client carries no pattern the Host does not
ship. Change one, change both, in the same commit, or the suite goes red.

This is the same technique the sibling `dsh-hub` bundle uses for its duplicated
Remote roster: a test that reads the client as text because the assertion is
about the source's shape, which is the only place a browser bundle's duplicate
can be checked.

## Alternatives considered

**Import the patterns from `lib/tune.js` into `client.js`.** It removes the
duplication outright and is the obvious first ask. It loses because the browser
module table serves one entry per package and cannot reach a sibling module —
there is no import to share, exactly as `dsh-hub`'s Remote roster cannot be
imported into its client. The mirror is forced by the platform, not chosen, so
the only real question is how it is kept honest.

**Let the Client ask the Host for coverage instead of counting locally.** One
source of truth, no mirror. It loses because coverage counting is the instant,
offline half of the button — a Host round-trip for a regex test would make
"规范补全（本地·即时）" neither local nor instant, and would couple the button's
every render to a Remote that is optional by design. The whole point of the
local pass is that it needs nothing.

**Keep the copy and check it by hand, in review.** No test, no maintenance. It
loses because the drift is invisible until a human reads both files together,
and it already shipped once (the bare `项目`). A text-reading test is the only
thing that catches the drift on the change that causes it, which is the only
time it is cheap to fix.

**Generate the client's copy from `lib/tune.js` at build time.** A single source
with no runtime duplication. It loses because the package has no build step by
design — the Loader reads these files as written — and adding one to deduplicate
a seven-regex array trades the package's core simplicity for a generated
artifact that can silently disagree with the tree on any commit that forgot to
rebuild.

## Consequences

- A tightened or renamed Host pattern must be ported to `client.js` in the same
  commit or the suite goes red. The coupling is now enforced by
  `tests/client-pattern-lockstep.test.js`, not remembered.
- The Client carries a second copy of the block patterns — seven regexes and
  seven titles. That is the whole cost, and the lockstep test is what keeps it
  from becoming a second, divergent standard.
- The coverage line and the Host's guide now agree on which blocks a draft
  carries, so the button's `n/7` and `prompt_tune_guide`'s score tell the same
  story.
- Adding or renaming a block moves two files — `lib/tune.js` and `client.js`.
  The lockstep test derives its expectation from `lib/tune.js`, so it does not
  need a third edit; it fails until the Client catches up.

## Testing

`tests/client-pattern-lockstep.test.js` is the guard. It reads `client.js` as
text for the same reason `dsh-hub`'s bridge test does: the file is a browser
bundle that calls `window.__ModuleLoader__` and keeps its copy inside the
factory closure, so the assertion has to be about the source's shape.

## Related

- [README.md](../../../../README.md) §二 and §五 — the seven-block standard and
  the file map; this note owns why the Client duplicates the patterns and how
  the duplicate is held to the original.
- [Agent Note: the seven-block analyzer tightened](../bug-fix/2026-10-30-seven-block-analyzer-tightened.md)
  — the Host tightening this mirror must track; that note changed the source,
  this one changed the copy and added the guard.
- [Agent Note: the deep rewrite hands off through a preview](../feature/2026-10-30-preview-before-replace.md)
  — the other change to the same file, on the action the coverage line labels.
