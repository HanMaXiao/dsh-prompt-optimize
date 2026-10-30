# Agent Notes

One kind of design doc lives here. An **Agent Note** records a decision or
proposal that affects this codebase — the *why* and *what we gave up*, the
parts code and [README.md](../../README.md) can't carry. This file defines
where Agent Notes live, when to write one, and [the in-file format](#the-file-format).

These rules were adapted from the `dsh-hub` pattern to a single-package plugin.
Where they differ, [Differences from the source pattern](#differences-from-the-source-pattern)
is authoritative.

## Layout and naming

Every Agent Note has two axes, both encoded in its **path** —
`{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`:

- **Lifecycle** (the top-level folder) is the Agent Note's status, and an Agent
  Note moves between folders as that status changes:
  - **`proposed/`** — proposals reviewed before implementation; not yet built
    (or only partly).
  - **`implemented/`** — the decision shipped. The file records what was
    decided and what was rejected, and is **kept current with what actually
    shipped**: when the code later moves a file, renames a seat id, or changes a
    field or default, the Agent Note is updated in the same change to match
    (facts only — paths, names, structure — not the decision itself). See
    [implemented/AGENTS.md](implemented/AGENTS.md).
  - **`rejected/`** — the proposal was considered and declined. Keep it only
    while its rationale prevents a tempting, meaningful mistake; otherwise
    delete the file outright.
  - **`archived/`** — implemented notes frozen as historical snapshots.
- **Class** (the nested folder) is the *kind* of decision — see
  [Classification](#classification).

The date in the filename is when the topic was **first proposed**. A note that
later moves between lifecycles keeps its original date: the lifecycle folder
already says what changed. Cross-references between Agent Notes use relative
markdown links (`[topic](../bug-fix/2026-…-….md)`) — never bare prose or
numbers — so they are mechanically checkable and survive moves between folders.

The active lifecycle tree is the working inventory: browse its lifecycle/class
folders or search the repository. Do not add a centralized `INDEX.md`: it
duplicates path metadata and makes unrelated note changes contend on one
generated file.

## Classification

Each Agent Note belongs to one path-encoded class from this closed set. Adding a
class requires updating this table and the directory tree.

| Class | What it covers |
|---|---|
| `feature` | A new user-facing capability: an action, a panel, a mode. |
| `bug-fix` | Corrects a defect or closes a gap. |
| `simplification` | Removes code, behavior, or surface area without adding a capability. |
| `architecture` | A structural decision about the **shipped source** — which half holds what, what the bridge is, what may be split or duplicated. |
| `process` | Tooling, policy, or workflow **around** the code — the Agent Note process itself, verification habits, ownership of files — not runtime behavior. |
| `testing` | Test infrastructure and strategy. |

The `architecture` / `process` line: **architecture** is about the source we
ship; **process** is the surrounding tooling and workflow. (`refactor` is
deliberately absent — it overlaps `simplification`, whose discriminator,
"does observable behavior change?", already covers it.)

## When to write one

Add or update an Agent Note in the same change only for lasting decision
rationale that code, tests, and [README.md](../../README.md) do not explain.
A proposal for substantial future work starts in `proposed/`; a decision
already made starts in `implemented/`. Pick the class folder that matches the
decision (see [Classification](#classification)).

Updating the Agent Note that already owns the decision satisfies the rule; do
not create a duplicate. Mechanical or local edits are exempt, including local
UI presentation and interaction changes. An Agent Note is never edited into a
*different decision*: supersede it with a new one, and keep both notes
cross-linked. Editing an `implemented/` Agent Note to track where its existing
decision lives is required, not forbidden; see
[implemented/AGENTS.md](implemented/AGENTS.md).

A note that would restate [README.md](../../README.md) is not an Agent Note —
the README is the authority, the note is the reasoning behind a slice of it. In
practice the notes own *why this shape was chosen over the plausible neighbour*,
which the README states as fact without litigating.

An implemented Agent Note that is fully superseded may be consolidated into the
current owning note and deleted. Before deletion, the owner must preserve every
unique rationale, alternative, consequence, and named coverage gap, and repair
every inbound link. Partial supersession does not qualify: keep both notes
cross-linked and update every fact that remains current. Consolidation must not
rewrite the old file into its opposite or rely on version-control history as
the only copy of the rationale.

## Archiving and deletion

Delete an implemented Agent Note that only describes small UI adjustments or
purely mechanical changes, and repair or remove inbound links. A local bug
fix, a performance change, a new capability, or a substantive behavior decision
does not qualify merely because its implementation is small. Archive other
implemented notes only when the shipped decision is complete, its rationale is
unlikely to guide future work, and the record still has historical decision
value. Keep it active when its alternatives, ownership boundary, negative
guarantee, or reintroduction condition remains useful. Never archive a proposed
note: reject an obsolete proposal. Keep a rejected note only while it prevents
a plausible mistake; otherwise delete it.

The archive is path-encoded as `archived/{class}/yyyy-mm-dd-topic-title.md`;
`implemented` is deliberately absent from the archive path because only
implemented notes can enter it. An archival change moves the file, retains
`Status: implemented`, inserts an `Archived: YYYY-MM-DD` line immediately below
that status, and repairs or deletes inbound links. These are the only permitted
content changes during archival.

Once sealed, every archived note is permanently frozen. Do not edit,
reformat, update, move, or delete it, and do not treat it as authority for
current behavior. Active prose may still link into an archived note when it
intentionally cites history.

## The file format

Every active Agent Note follows one in-file format.

### The header block

The first three lines of every Agent Note are exactly:

```markdown
# Agent Note: <title>

Status: <status>
```

followed by a blank line. The `Status:` value is one of three forms, and must
agree with the lifecycle folder the file sits in:

- `Status: proposed`
- `Status: implemented`
- `Status: rejected — <why, in one line>`

The status carries no dates and no parentheticals: the filename holds the
first-proposed date and the lifecycle folder holds everything else. An
"accepted in amended form" note is body content — state the amendment where the
decision is stated. The rejection reason is the one status with content,
because a rejected Agent Note's verdict is the fact readers come for.

An archived note carries one extra line, immediately below the status:

```markdown
Archived: YYYY-MM-DD
```

### The body skeleton

Every Agent Note opens its body with `## Problem` — the motivation, written to
stand without the solution. What follows depends on the lifecycle; recurring
sections use these canonical names and nothing else, while genuinely bespoke
technical sections (the data model, the bridge, the file layout) remain
free-form between the required ones.

#### `implemented/`

```markdown
## Problem
## Decision
…bespoke sections…
## Alternatives considered
## Consequences
```

`## Decision` describes shipped reality in the present tense, and the whole
file is kept current with it per
[implemented/AGENTS.md](implemented/AGENTS.md). `## Consequences` records what
the trade-off cost **and** bought. Proposal-era headings are spec-speak here
and must not appear: `## Proposal`, `## Plan`, `## Migration plan`, and
`## Acceptance criteria` may not appear in an implemented Agent Note. A
`## Testing`, `## Deferred`, or `## Related` section is fine where it states
present-tense fact.

#### `proposed/`

```markdown
## Problem
## Proposal
…bespoke sections…
## Alternatives considered
## Acceptance criteria
## Risks
```

#### `rejected/`

A rejected Agent Note is the proposal, frozen: it keeps whatever proposal-time
sections it had (including `## Acceptance criteria` or `## Plan`), and the
verdict lives on the `Status:` line. Only the header block, the `## Problem`
opener, a `## Proposal` section, and the Alternatives-considered mandate below
apply.

### Alternatives considered — mandatory

Every Agent Note carries an `## Alternatives considered` section: each genuine
alternative and why it lost, **one bold-led paragraph per alternative** or a
`### Why not <X>?` subsection per contested one. A decision recorded without
what it beat invites re-litigation — the failure Agent Notes exist to prevent.

Write the paragraph so it names the loser and the reason in the bold lead:

```markdown
**Store items in browser `localStorage`.** The obvious cheap answer …
```

Alternatives are recorded, never invented. Do not reconstruct an alternative
that was never actually weighed, and do not pad the section with options a
reasonable implementer would never have chosen — the section documents the
debate that happened.

## Moving between lifecycles

Moving a file between lifecycle folders means updating the `Status:` line and
re-satisfying that folder's skeleton in the same change. Concretely,
`proposed/` → `implemented/` rewrites `## Proposal` into a present-tense
`## Decision`, folds `## Acceptance criteria` and `## Risks` into
`## Consequences` (or a present-tense `## Testing` section for what now pins
the behavior), and drops plans in favor of what shipped. `proposed/` →
`rejected/` only adds the reason to the `Status:` line and freezes the file.
`implemented/` → `archived/` moves the file and inserts the archive-date line.

## Chinese counterparts — recommended, not mandatory

A `.zh.md` counterpart **may** mirror an English note's structure
section-for-section. Write one when the note records a decision that a
Chinese-reading maintainer is likely to have to defend or revisit — a
rationale, a rejected alternative, a boundary. Skip it for narrow factual
records whose content is paths, field names, and byte limits.

When you do write one, keep the machine-checked header tokens (`# Agent Note: `
and the `Status:` line) in English verbatim, mirror the section order exactly,
and translate the body only. Update both files in the same change; never let a
pair drift.

## Differences from the source pattern

This contract is adapted from the `dsh-hub` Agent Note pattern. Three
differences were deliberate.

- **The authority is [README.md](../../README.md), not a `DESIGN.md`.** The
  source pattern pairs its notes with a separate design contract; this plugin
  keeps one user-facing README that already states what is true. A note here
  therefore reasons behind a slice of the README, and the README outranks the
  note exactly as `DESIGN.md` does there.
- **`.zh.md` counterparts are recommended, not mandatory.** The source pattern
  (and DeepSeek Harness above it) leans on bilingual twins with a checker; here
  it is a judgment call. The corpus is a handful of notes read by whoever is
  editing this plugin, and forcing a translated twin doubles write cost without
  adding a reader who would not read the English.
- **No executable format gate.** The source pattern can run a checker that
  cross-checks the `Status:` line against the lifecycle folder and rejects
  proposal-era headings in implemented notes. Here those are review rules: read
  them, apply them, and review them in a second pass before finishing a change.
