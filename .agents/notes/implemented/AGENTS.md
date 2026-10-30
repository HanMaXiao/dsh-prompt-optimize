# AGENTS.md — Implemented Agent Notes

These Agent Notes describe decisions that shipped. Follow the
[root instructions](../../../AGENTS.md) and the
[Agent Note format](../README.md#the-file-format).

## Keep an implemented Agent Note current with what actually shipped

Keep paths, seat ids, field names, defaults, and mechanisms current in the same
change that alters them. Rewrite stale facts in place; do not append change
history.

When a shipped note is unlikely to guide future work, archive it rather than
continuing to maintain it: move the file to `archived/{class}/`, insert an
`Archived: YYYY-MM-DD` line below the status, and repair or delete inbound
links. Those are the only permitted content changes during archival.

## This is not a license to rewrite the *decision*

Update factual realization in place. A reversal of the decision or its
rationale requires a new Agent Note and a cross-link; a fully superseded old
note may be deleted or archived only through the rules in
[the Agent Note rules](../README.md).

## Read the body for present-tense fact

`## Decision` describes what exists now, not what was planned. Proposal-era
headings — `## Proposal`, `## Plan`, `## Migration plan`,
`## Acceptance criteria` — do not appear here. `## Testing`, `## Deferred` and
`## Related` are fine where they state present-tense fact.

Alternatives stay as written. An alternative that lost against a design that no
longer exists is exactly what this folder preserves: do not delete it because it
reads oddly, and do not rewrite it to flatter the current design.
