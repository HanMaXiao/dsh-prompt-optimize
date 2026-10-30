# AGENTS.md

`@local/dsh-prompt-optimize` is a Cordis plugin: it rewrites a rough draft into
a professional, standard prompt — a composer ✨ button, three Host tools, the
optimization system prompt, a selectable preset mode, and a self-iterating
skill. **[README.md](README.md) is the source of truth and outranks any
restatement of it here.** Read it before changing anything. Every measured
fact, count, seat id and file path lives there; this file carries only the
rules that bind future work, the commands, and the pointers.

## Repository layout

```
dsh-prompt-optimize/
├── package.json      exports, files, dsh.bundle.patch, dsh.client
├── cordis.patch.yml  two rows: prompt-tune-core (Host) + preset-prompt-tune (preset)
├── host.js           three tools + the self-iterating skill + status.json receipt
├── mode.js           preset-scoped policy section (prompt:tune-policy) + preset.json receipt
├── client.js         Client: the ✨ button in the composer card's top-right corner
├── remote.js         PromptOptimizeRemote — the button's model path over a Typert Remote
├── typert.js         TYPERT manifest mirroring remote.js
├── lib/              pure logic: tune.js (standard + analyzer), tune-call.js (model call), lessons.js (store), receipt.js
├── skills/           prompt-optimization-best-practices.md baseline body
├── scripts/          check-preset-drift.mjs — preset drift guard
├── tests/            node --test coverage — repo-only, not in `files`
├── locale/           zh.json / en.json — meta.title / meta.description for the Plugin Manager
└── .agents/          agent notes and skills
```

`README.md` §五 is the authority for what each file does; the tree above is
navigation only. `host.js`, `mode.js`, `client.js`, `remote.js`, `typert.js`,
`lib/*`, `cordis.patch.yml`, `package.json`, `locale/*`, `tests/*`, `.github/*`
and `scripts/*` are runtime files: a documentation change does not touch them.

## Commands

```sh
node --test              # the only verification command; runs tests/
```

There is no build, bundler, typecheck or lint stage. The Loader imports these
files from disk as written, so `node --test` or running the plugin is the only
way a bug surfaces. The preset-drift guard
([scripts/check-preset-drift.mjs](scripts/check-preset-drift.mjs)) is
informational and is not part of this command.

**Reload rules.** Node's ESM cache keys the module table by resolved URL, so a
Host-side change needs a **process restart**; a Client-side change needs only a
**page refresh**. Reinstalling, changing a row id, repointing `exports`, a
subpath specifier and even a new directory each fail to reload a Host module.
The full measurement lives in [README.md](README.md) §八.

## Plugin rules

These are the constraints that actually bind this package. Each has a concrete
reason; drop none of them for style.

- **The README is the source of truth.** Do not restate its measured facts,
  counts or paths here. When a fact changes, change it in the README first;
  this file keeps the rule, never the value.
- **`node_modules` is a runtime necessity, not a build leftover.** The bundle
  is installed with `link:`, which does not install the target's dependencies,
  so `@deepseek-ai/dsh-typert-protocol` resolves from this directory's own
  `node_modules`. Never delete it and never "clean" it with an install — the
  evidence is [README.md](README.md) §八, constraint 3.
- **The Client mounts its own Remote contribution.** `dsh-typert-loader`
  discovers `./typert` on the Host only; nothing mounts a third-party namespace
  for the Client, so [client.js](client.js) calls `ctx.remote.$mount()` itself
  and reads the namespace as `ctx.get('remote.promptOptimize')` — never as a
  property of `ctx.get('remote')`, which only carries `$mount`, `$stream`,
  `$host` and `$on`. A mounted method answers a `RemoteResult` envelope and
  never throws a business failure. A missing Remote is the designed agent-tool
  fallback, not a broken button. The five measured constraints behind this are
  [README.md](README.md) §八.
- **The Client's seven-block mirror stays in lockstep with
  [lib/tune.js](lib/tune.js).** The browser module table cannot reach a sibling
  module, so [client.js](client.js) carries its own copy of the block patterns
  for the coverage line. [tests/client-pattern-lockstep.test.js](tests/client-pattern-lockstep.test.js)
  holds the two equal: every Host pattern must appear verbatim, in order, and no
  pattern the Host does not ship. Change one, change both, in the same commit.
- **The preset list is a verbatim replica plus one own row.**
  `preset-prompt-tune`'s `plugins` list is the shipped `standard` preset copied
  line-for-line, followed by this package's `prompt-tune-policy` row. After a
  DSH upgrade, re-check it against the **release the user actually runs**, not a
  source checkout, with `node scripts/check-preset-drift.mjs --dsh-root <running
  release>`. [README.md](README.md) §七 #2 has the extraction procedure; CI runs
  the same check informationally (`continue-on-error`, its own job name).
- **Zero emoji, anywhere — except the one documented ✨.** Every other
  affordance is an inline SVG with an `aria-label`. No Unicode pictographs in
  copy, comments, commit messages or identifiers.
- **Files end with exactly one trailing newline.**

## Testing

`node --test` is the whole gate; there is no build step. The files that need
machinery to say anything:

- **[tests/client-pattern-lockstep.test.js](tests/client-pattern-lockstep.test.js)**
  reads `client.js` as text and holds its seven-block mirror to
  [lib/tune.js](lib/tune.js); it is the guard named above.
- **[tests/client-button-harness.test.js](tests/client-button-harness.test.js)**
  and **[tests/client-button-ux.test.js](tests/client-button-ux.test.js)** drive
  the real `client.js` through a stub module table and a minimal React (plus a
  real-React render), covering the preview-before-replace hand-off.
- **[tests/remote-manifest.test.js](tests/remote-manifest.test.js)** validates
  the hand-written manifest with the real loader and activates the Client entry
  under real Cordis.
- **[tests/tune.test.js](tests/tune.test.js)** and
  **[tests/tune-heuristics.test.js](tests/tune-heuristics.test.js)** pin the
  Host analyzer and the deterministic rewrite.

Tests describe behavior, not correctness — change obsolete behavior with its
tests. The suite reads the bundle's own `node_modules` the way the runtime
resolves it, which is what lets the Host half be imported offline.

## Agent Notes

Durable decision rationale lives in
[`.agents/notes/`](.agents/notes/README.md) as **Agent Notes**: the *why* and
*what we gave up* that code and [README.md](README.md) cannot carry. Write one
for lasting rationale only; mechanical and local edits are exempt. Never edit
an existing note into a different decision — supersede it with a new note and
cross-link both.

## Editing these instructions

Edit `AGENTS.md` at the repository root; there is no symlinked copy. Keep each
rule self-contained while linking the authority instead of restating it: one
fact, one home. [README.md](README.md) outranks this file, and this file
outranks the Agent Notes.
