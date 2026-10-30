# Agent Note: serialized lesson writes and per-bundle stores

Status: implemented

## Problem

`prompt_tune_learn` appends one lesson to a JSON store behind the self-iterating
skill, and lessons are the one thing in this plugin the user asks to outlive
every session, project and restart. The original `add()` had two defects that
both lose data silently.

**The race.** `add()` reads `lessons.json`, derives the next id from the current
lesson count, and rewrites the file. That whole sequence has to behave as one
step. Two `prompt_tune_learn` calls that interleave between the read and the
write both derive their id from the same count, and the second write overwrites
the first — the first lesson is gone, with no error and no trace.

**The torn write.** `writeFileSync` truncates the target before the new bytes
land, so a failure half-way through leaves a torn file where a complete one used
to be. A torn `lessons.json` reads back as a corrupt store, and the store's
answer to corruption is to drop the whole history — so one interrupted append
could erase every prior lesson.

A third question is structural, not a bug: **why two bundles keep separate
stores.** This plugin and the sibling `@local/dsh-prompt-mode` (the
prompt-document bundle) each own a lessons store. Two capabilities, two lesson
sets, two readable mirrors — a shared store would make them fight over one file
and one skill section. The store's *code* is a separate copy too, and
deliberately: a bundle is installed and loaded as an independent package, so
`dsh-prompt-optimize` cannot import `dsh-prompt-mode/lib/lessons.js` (nor the
reverse) — there is no shared internal package between them.

## Decision

`add()` runs as one serialized, atomic unit, and every write goes through an
indivisible replace. Both live in [lib/lessons.js](../../../../lib/lessons.js).

**Serialize mutations inside the process.** A `MutationQueue` lets one unit run
to completion before the next starts. The unit is synchronous — it never
suspends between its read and its write — so the queue is idle whenever a caller
arrives, and that caller runs at once. A caller that finds the queue busy is
looking at a unit that yielded mid-flight; it cannot wait for a result
synchronously, so the call is **refused** with a retry message rather than
allowed to race the unit that holds the queue. A refused call is retried; a
raced one loses a lesson for good.

**Replace in one filesystem step.** `writeFileAtomic` writes a sibling temp file
and renames it onto the target, so a reader sees either the old content or the
new one, never a torn file. The temp file lives in the target's own directory,
because a rename across devices fails with `EXDEV`. On failure the temp file is
removed either way, and the thrown error names the target and the reason.

**Keep a per-bundle store and a per-bundle copy of the code.** The
`prompt-optimize` directory is this bundle's own, so it never contends with the
prompt-document bundle over one store. The serialized `add()` is therefore a
hand-mirrored duplicate of the one the sibling ships; changing one means
changing both, or the two plugins drift apart in the one place where a silent
difference costs real lessons.

## Alternatives considered

**Rely on Node's single-threaded event loop and add no queue.** `add()` looks
atomic because JavaScript does not preempt synchronous code. It loses the moment
any `await` enters the read-modify-write — a future async validation, an async
`mkdir` — at which point two calls interleave exactly as the race describes. The
queue makes the invariant explicit and enforced rather than incidental to the
current implementation happening to be synchronous, and it fails loud (a refused
call) instead of trusting that no future edit introduces a suspension point.

**Use a file lock (`flock` / a lockfile) instead of an in-process queue.** The
robust answer for multi-process writers. It loses because every writer here is
in one Host process — the `prompt_tune_learn` tool and the Remote — so a
cross-process lock adds a dependency and a stale-lock failure mode to solve a
concurrency that does not occur, and this package must not gain a dependency.
The in-process queue covers the real case; a second process writing the same
file is out of scope and would be a different persistence design.

**Write in place with `writeFileSync` and accept a torn file on crash.** The
simplest option, and the one already shipped. It loses because a torn
`lessons.json` reads back as corrupt and the store answers corruption by
dropping the entire history — a crash during one append would silently erase
every prior lesson. The temp-file rename costs one extra file in the same
directory and makes that class of loss impossible.

**Share one lesson store and one `lib/lessons.js` with `dsh-prompt-mode`.** It
removes the duplication outright. It loses because the two bundles are installed
and loaded as independent packages with no shared internal package between them,
so neither can import the other's module, and a shared directory would make two
capabilities fight over one file and one skill section. The duplication is
forced by the packaging model, not chosen, and the queue is the smaller half of
what has to be mirrored.

## Consequences

- A concurrent `prompt_tune_learn` can no longer silently drop a lesson; the
  loser is a refused call the caller retries, which is loud and recoverable.
- A crash mid-append leaves the previous store intact rather than a torn file
  that reads as "drop everything".
- The serialized `add()` and `writeFileAtomic` are general; any future mutator
  on this store should route through them rather than reopen the race.
- The store's code is now a hand-mirrored duplicate of the sibling bundle's.
  That is a standing cost: a change to the write path is a change to two files
  in two repositories, or the plugins drift where drift is silent and expensive.

## Testing

The suite covers the atomic replacement — the temp-file rename, the
same-directory requirement, and the debris-free failure that names the target —
and the queue's refuse-when-busy behavior. `readSync()` still treats a missing
file as an empty store and a corrupt one as a reported problem surfaced through
the skill body, never a throw during `apply()`.

## Related

- [README.md](../../../../README.md) §五 and §七 — the file map and the
  maintenance notes that reference this store; this note owns the write-path
  reasoning behind them.
- [Agent Note: the seven-block analyzer tightened](2026-10-30-seven-block-analyzer-tightened.md)
  — the other half of the same change; the lesson store and the analyzer shipped
  together but are independent decisions.
