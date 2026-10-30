# Agent Note: the deep rewrite hands off through a preview

Status: implemented

## Problem

The ✨ button's "深度优化" (deep rewrite) originally wrote the model's answer
straight into the composer — or, with no Host Remote, wrote a `prompt_tune`
instruction and waited for the user to press Enter. Writing blind has three
failure modes the user cannot see coming:

- **No feedback and no way out.** A model call can take many seconds. The old
  panel showed nothing while it ran and offered no cancel; the only escape was
  to wait.
- **No checkpoint before the write.** The answer landed in the input before the
  user had compared it to their own draft. A rewrite that dropped a path or a
  number — the exact failure the system prompt forbids — became the user's draft
  with nothing to catch it.
- **Three endings, one appearance.** A call that failed, a call that was
  cancelled, and a call that was still running all looked the same, so "was my
  draft changed?" had no visible answer.

## Decision

The deep action is a four-phase state machine in
[client.js](../../../../client.js), and the phase decides what the panel shows:

- **`busy`** — the in-flight call, with a status line and one Cancel control.
  The call carries an `AbortController` whose signal is the manifest's declared
  third parameter (`cancellation: { parameter: 'signal' }` in
  [typert.js](../../../../typert.js)), so aborting reaches the Host call itself,
  not just the panel.
- **`preview`** — a before/after comparison with the character delta, gated
  behind an explicit confirmation. This is the contract: **the answer never
  reaches the input on its own.** Only the confirmation calls `setDraft`.
- **`failed`** — reports the error and offers a retry; the deep item becomes the
  retry and the footer keeps the error line.
- **`idle`** — the two-action menu.

Only two paths ever write the draft outright: the structural fill (规范补全) and
the no-Remote agent-tool fallback, and both replace it in one step that is one
Ctrl+Z from being undone. A cancelled call, a cancelled preview, and a failed
call all leave the input exactly as the user typed it. A mounted method answers
a `RemoteResult` envelope (`{ ok: true, value }` / `{ ok: false, error }`) and
never throws a business failure, so the branch on `ok` is what separates a real
rewrite from a rejected one.

Two migrated offline assertions were deliberately **restated against this
contract** in the same change: the old "「深度优化」写回 `prompt_tune` 指令"
became "no Remote falls back to the instruction; with a Remote the answer stops
in a preview and only the confirmation writes". The suite was updated so it pins
the new behavior, not the deleted one.

## Alternatives considered

**Keep writing the answer straight into the input.** Fewer clicks, and the
result is immediately sendable. It loses because the user cannot compare the
rewrite to their own draft before it replaces it, and a dropped path or number
becomes their draft with no checkpoint. The preview is the one place that
failure is catchable, and it is the reason the button can promise the draft is
untouched on every non-confirming path.

**Stream tokens into the input as they arrive.** The most fluid, and the one a
user would ask for next. It loses on the platform, not on effort: the invocation
descriptor carries no stream marker (`InstalledMethod` is `direct` / `scoped`
only), and "this method is a stream" exists only in the build-time-generated
client stub — which a hand-written, build-step-free bundle does not ship.
Expressing it would mean hand-writing a second client-side descriptor manifest
and stacking an unverified mechanism on a client half that had not yet run in a
real page. The feel is not worth that risk, so the deep rewrite is "one call,
one replace". This is the same conclusion [README.md](../../../../README.md) §八
records for token-level streaming.

**Auto-confirm the preview after a short delay.** Removes the click. It loses
because a timed auto-accept is a write the user did not authorize on a timer
they did not set; the preview's whole value is that the decision is explicit and
reversible, and a countdown turns a mis-timed glance into an irreversible
replace.

**Make cancellation throw and surface it as an error.** Simpler state handling.
It loses because cancellation is not a failure — it ends the call, not the draft
— and reporting it as an error would teach the user that pressing Cancel did
something wrong. It ends the attempt, says so in the footer, and leaves the
draft alone.

## Consequences

- The user always sees the rewrite beside their draft before it replaces
  anything, and can decline it; the draft is provably untouched on cancel,
  keep-original, and failure.
- An in-flight rewrite is cancellable at the Host, and the abort reaches the
  model call rather than only hiding the panel.
- The footer distinguishes cancel / keep-original / failure, so "was my draft
  changed?" always has a visible answer.
- The no-Remote fallback is unchanged and still useful: with no Host Remote the
  deep item writes the `prompt_tune` instruction for the session model, exactly
  as before. The preview only exists where a Remote is present.
- Both locale dictionaries grew the busy / preview / cancel / retry keys;
  [tests/client-button-ux.test.js](../../../../tests/client-button-ux.test.js)
  asserts both carry them.

## Testing

`tests/client-button-ux.test.js` drives the four phases and the no-Remote
fallback through the real `client.js` — the in-flight call with its abort
wiring, the preview that gates the only `setDraft` the deep path performs, the
retry out of a failed attempt, and the fallback that must stay untouched by all
of it. `tests/client-button-harness.test.js` keeps the registration shape and
the structural-fill path.

## Related

- [README.md](../../../../README.md) §三 and §八 — the button's placement and the
  Remote bridge the preview sits on; this note owns the hand-off decision.
- [Agent Note: the client mirror stays in lockstep](../architecture/2026-10-30-client-mirror-lockstep.md)
  — the same file's coverage line, the other half of the button that changed
  around this one.
