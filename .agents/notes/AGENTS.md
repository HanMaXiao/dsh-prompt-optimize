# AGENTS.md — Agent Notes

Agent Notes are decision records written by agents: durable proposals and
decision records that preserve rationale, alternatives, consequences, and
required verification. They are the only place in this repository where *why*
and *what we gave up* are recorded; [README.md](../../README.md) holds what is
true, a note holds what was chosen over what. Follow the
[root instructions](../../AGENTS.md) and the
[Agent Note rules](README.md).

**Every new Agent Note triggers a supersession check.** Search the active tree
for older notes covering the same decision or mechanism, classify any full or
partial supersession, and archive or consolidate every qualifying implemented
note in the same change. Keep partial supersessions active and cross-linked. Do
not defer a known match to a later corpus audit.

Three facts decide most questions here:

1. **[README.md](../../README.md) is the contract.** A note that restates it is
   duplication, not rationale. Note the reasoning, the rejected neighbours, and
   the consequences; link the section that states the fact.
2. **`Status:` must match the lifecycle folder.** `proposed/`, `implemented/`,
   `rejected/` and `archived/` each have their own skeleton; a move rewrites the
   body in the same change.
3. **Alternatives are recorded, not invented.** One bold-led paragraph per real
   option that lost, naming why. This is the section readers come for.

Lifecycle instructions: [implemented/AGENTS.md](implemented/AGENTS.md). The
other lifecycles are described in [README.md](README.md#the-file-format) and are
created when a note first needs them.
