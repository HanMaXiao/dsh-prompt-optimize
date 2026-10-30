# Agent Note: the seven-block analyzer tightened

Status: implemented

## Problem

`prompt_tune_guide` scores a draft against the seven-block standard with a
regex per block, and the missing blocks drive the 补法 list the author reads.
The patterns started as loose single words, and a loose single word matches
prose that states nothing at all. A bare `项目` turned
"帮我优化这个项目的提示词" into a declared data source; `实现` matched its own
noun in "这个实现有 bug"; `别` matched 特别 / 分别 / 级别. The result was not a
cosmetic miscount: the analyzer reported blocks the draft never declared, and
the guide then **skipped the very 补法 the author needed** — telling them their
上下文与数据源 was covered when nothing named a source.

Every block had its own version of this, and each one is named in the code:

- **角色** — `负责` alone is code describing itself ("这个模块负责解析 token"),
  not a speaker claiming the work.
- **目标** — `实现` is an action verb whose noun form names code, and `产出` is
  the deliverable's own word, so one token used to prove two different blocks.
- **上下文与数据源** — `项目` / `文件` / `目录` / `路径` appear in constraints
  ("只动 lib 目录", "路径必须真实存在") and deliverables ("修改这两个文件"),
  none of which names a source.
- **交付物** — a bare `output` was a symptom ("console 里 output 是空的"), not a
  deliverable.
- **硬性约束** — `别` matched 特别 / 分别 / 级别; a bare English `only` matched
  "the only issue is…".
- **验收标准** — `通过` matched "通过 API 获取会话" (a data flow), `测试` matched
  "测试环境" (a place).
- **输出格式** — `表格` / `列表` matched UI ("列表页打不开"), `markdown` / `json`
  matched data ("把配置改成 json").

The failure is silent in the worst direction: a false "present" suppresses
guidance, and the model-side rewrite never sees the missing list to correct it.

## Decision

Each block's pattern is now the set of forms that **actually declare** the
block, in Chinese and in English, and a pattern matches a *statement*, not a
noun. The comment above each pattern names the false positive it refuses, so
the next editor does not "simplify" it back into a bare word. Three shapes
carry a real location for 上下文与数据源 — a drive letter, a `./`-style relative
path, or a token with an internal slash whose last segment has an extension —
so "2024/10/30" and "和/或" stay out while "src/auth/login.tsx" counts. The
patterns live in [lib/tune.js](../../../../lib/tune.js) and are the single
source the Host analyzer, the deterministic rewrite, and the Client mirror all
read.

## Alternatives considered

**Keep the loose single-word matches and let the model-side rewrite absorb the
error.** The loose patterns were "good enough" for a quick coverage count, and
`prompt_tune` does the real semantic work anyway. It loses because the coverage
count is the first thing the user sees (`0/7` to `7/7`) and the guide's 补法
list is derived from the *missing* blocks — a false "present" silently removes
the exact line the author needed, and the model pass never receives the missing
list to fix it. The cheap path and the expensive path were both wrong in the
same direction.

**Require two hits per block instead of tightening the patterns.** A blunt way
to cut coincidences without touching the word lists. It loses because the false
positives are about *which words*, not *how many*: a genuine one-token
declaration ("目标是 X") still hits once and would be dropped, while a two-word
coincidence ("通过 API") still passes. The threshold trades one wrong answer for
another and leaves the real defect — matching nouns — in place.

**Move detection to the model entirely and drop the offline analyzer.** One
authoritative judge, no regex maintenance. It loses because `prompt_tune_guide`
is the instant, no-model path and its whole value is a *deterministic* `0/7`
score plus `⟨待确认⟩` rendering that never invents a path or a number — the one
property a model cannot provide, since the system prompt forbids it from
guessing. A model judge would make the fast path slow and the honest path
dishonest.

## Consequences

- The `0/7` score is trustworthy: a "present" block now means the draft actually
  declared it, so the missing-block 补法 list is complete and no author is told
  a fine draft is missing a block.
- The patterns are larger and more specific, and each carries a comment naming
  the false positive it refuses — the rationale travels with the code so the
  tightening is not undone by a later "cleanup".
- A genuine but unusually-phrased declaration can now under-count, which errs
  toward *showing* 补法. That is the safe direction: ask, do not assume.
- This is an observable behavior change; a draft that used to score `5/7` may
  now score `3/7`. The Host half is pinned by
  [tests/tune.test.js](../../../../tests/tune.test.js) and
  [tests/tune-heuristics.test.js](../../../../tests/tune-heuristics.test.js).
- The Client carries a mirror of these patterns; porting the tightening there is
  a separate decision — see [the client mirror note](../architecture/2026-10-30-client-mirror-lockstep.md).

## Related

- [README.md](../../../../README.md) §二 — the seven-block standard the analyzer
  scores against; this note owns why the matching tightened, not the standard.
- [Agent Note: the client mirror stays in lockstep](../architecture/2026-10-30-client-mirror-lockstep.md)
  — the Client's copy of these patterns and the test that holds it to this file.
