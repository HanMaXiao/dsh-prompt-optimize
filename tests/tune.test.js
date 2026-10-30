/**
 * Sections 1–2 of the migrated offline suite: the seven-block standard and the
 * deterministic analyzer.
 *
 * Everything under test is a pure function of its arguments — no `node:`
 * imports, no Cordis, no clock — so this file needs no harness at all. Migrated
 * from `check-optimize.mjs` sections 1–2.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeDraft, BLOCKS, diagnose, renderProfessional, TUNE_SYSTEM_PROMPT } from '../lib/tune.js'

/**
 * One migrated assertion.
 *
 * `check-optimize.mjs` reported every assertion through
 * `check(label, ok, detail)`; keeping that shape means each migrated assertion
 * keeps its original label and its diagnostic detail verbatim, so a failure
 * reads exactly as it did before the migration.
 */
function check(label, ok, detail) {
  assert.ok(ok, `${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const vague = '帮我看看登录那个问题'
const rich = [
  '你是资深前端工程师，负责修复登录流程。',
  '目标：让 /login 在密码错误时给出明确提示，而不是白屏。',
  '上下文：先读 src/auth/login.tsx 与 src/api/session.ts；技术栈是 Next.js 15 + pnpm。',
  '交付物：修改这两个文件，并把改动写到 docs/login-fix.md。',
  '硬性约束：不要动 src/api/session.ts 的导出签名；不确定先问。',
  '验收标准：pnpm test auth 全绿，且 ctrl+Z 后不再白屏。',
  '输出格式：先给结论，再给关键取舍，不超过 3 行。',
].join('\n')

describe('1. the seven-block standard', () => {
  const vagueReport = analyzeDraft(vague)
  const richReport = analyzeDraft(rich)

  it('the standard has seven blocks', () => {
    check('the standard has seven blocks', BLOCKS.length === 7, BLOCKS.map(b => b.title).join(','))
  })

  it('the optimizer system prompt states the output contract', () => {
    check('the optimizer system prompt states the output contract',
      TUNE_SYSTEM_PROMPT.includes('只输出改写后的提示词正文') && TUNE_SYSTEM_PROMPT.includes('不许编'))
  })

  it('a one-liner scores below a fully specified draft', () => {
    check('a one-liner scores below a fully specified draft', vagueReport.score < richReport.score,
      `${vagueReport.present.length}/${BLOCKS.length} vs ${richReport.present.length}/${BLOCKS.length}`)
  })

  it('the rich draft covers every block', () => {
    check('the rich draft covers every block', richReport.missing.length === 0, richReport.missing.join(','))
  })

  it('diagnosis names the missing blocks', () => {
    check('diagnosis names the missing blocks', diagnose(vague).lines.some(line => line.includes('硬性约束')))
  })
})

describe('2. deterministic rewrite', () => {
  const rewritten = renderProfessional(vague, { intent: '修复登录' })

  it('the rewrite carries all seven headings', () => {
    check('the rewrite carries all seven headings', BLOCKS.every(block => rewritten.includes(`## ${block.title}`)))
  })

  it('the rewrite keeps the draft verbatim', () => {
    check('the rewrite keeps the draft verbatim', rewritten.includes(vague))
  })

  it('the rewrite never invents a value, it asks for one', () => {
    check('the rewrite never invents a value, it asks for one', rewritten.includes('⟨待确认：'))
  })

  it('a rich draft is not stripped of its own blocks', () => {
    check('a rich draft is not stripped of its own blocks', renderProfessional(rich).includes('你是资深前端工程师'))
  })
})
