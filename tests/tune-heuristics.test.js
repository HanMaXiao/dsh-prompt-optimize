/**
 * Section 8–10 of the offline suite: the analyzer's edge cases, and the lesson
 * store's write serialization.
 *
 * Sections 1–2 pin the analyzer's happy path. What came out of tightening the
 * seven block patterns is a set of decisions about drafts that used to be scored
 * wrongly, so every case here is one of those drafts: a bare 项目 no longer
 * proves a data source, 实现 no longer proves a goal, and the path evidence that
 * replaced the dropped nouns has to keep dates and CJK slashes out. Section 9
 * then drives `LessonsStore` against a scratch directory, because the one
 * property `prompt_tune_learn` cannot see from a single result is that a
 * concurrent write keeps every lesson.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { LessonsStore, writeFileAtomic } from '../lib/lessons.js'
import { analyzeDraft, BLOCKS, diagnose, renderProfessional } from '../lib/tune.js'

const PACKAGE_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// This file's own scratch library: `node --test` runs test files in parallel, so
// two files must never share one scratch directory.
const testLibrary = path.join(PACKAGE_DIR, 'prompt-optimize-selftest', 'tune-heuristics')
rmSync(testLibrary, { recursive: true, force: true })
after(() => rmSync(testLibrary, { recursive: true, force: true }))

/** One assertion; see `tune.test.js` for why the shape is kept. */
function check(label, ok, detail) {
  assert.ok(ok, `${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const richZh = [
  '你是资深前端工程师，负责修复登录流程。',
  '目标：让 /login 在密码错误时给出明确提示，而不是白屏。',
  '上下文：先读 src/auth/login.tsx 与 src/api/session.ts；技术栈是 Next.js 15 + pnpm。',
  '交付物：修改这两个文件，并把改动写到 docs/login-fix.md。',
  '硬性约束：不要动 src/api/session.ts 的导出签名；不确定先问。',
  '验收标准：pnpm test auth 全绿，且 ctrl+Z 后不再白屏。',
  '输出格式：先给结论，再给关键取舍，不超过 3 行。',
].join('\n')

const richEn = [
  'You are a senior frontend engineer.',
  'Goal: /login shows a clear error on a bad password instead of a white screen.',
  'Context: read src/auth/login.tsx and src/api/session.ts first; the stack is Next.js 15.',
  'Deliverable: modify these two files and write the change to docs/login-fix.md.',
  'Constraints: do not change the export signature of src/api/session.ts; ask when unsure.',
  'Acceptance: pnpm test auth passes and the white screen is gone.',
  'Format: conclusion first, then the trade-offs, at most 3 lines.',
].join('\n')

/**
 * Drafts the tightened patterns must score as exactly this set of blocks.
 *
 * Each entry is a false positive the old single-word patterns reported: the
 * reason names what the draft actually says, so a failure reads as the old
 * behaviour coming back.
 */
const AMBIGUOUS = [
  ['帮我优化这个项目的提示词', [], 'a bare 项目 names no source, so the data-source block stays missing'],
  ['这个实现有 bug，帮我看看', [], '实现 names code, not a result, so the goal block stays missing'],
  ['这个模块负责解析 token，帮我加点日志', [], '负责 describes the module, not the speaker, so the role block stays missing'],
  ['特别注意并发问题', [], '别 is part of 特别, so the constraint block stays missing'],
  ['分别是两个分支', [], '别 is part of 分别, so the constraint block stays missing'],
  ['在测试环境复现一下', [], '测试环境 is a place, so the acceptance block stays missing'],
  ['通过 API 获取会话', [], '通过 here means "via", so the acceptance block stays missing'],
  ['按团队标准来', [], '标准 alone is not a verdict, so the acceptance block stays missing'],
  ['console 里 output 是空的', [], 'output here is a symptom, so the deliverable block stays missing'],
  ['把配置改成 json', [], 'json here is a data shape, so the format block stays missing'],
  ['写成 markdown 文档', ['deliverable'], 'markdown here is the artifact, so the format block stays missing while the deliverable lands'],
  ['列表页打不开', [], '列表 here is a UI noun, so the format block stays missing'],
  ['作为替代方案，先试缓存', [], '作为 here is "as an alternative", so the role block stays missing'],
  ['看下这次产出', ['deliverable'], '产出 is the deliverable\'s word, so it no longer proves a goal as well'],
]

/** Drafts the tightened patterns must still score, with their exact block set. */
const KEPT = [
  ['先读 lib/tune.js，再改登录', ['context']],
  ['Read src/auth/login.tsx first', ['context']],
  ['看下 D:\\XiaoProject\\src\\login.tsx 的报错', ['context']],
  ['对照 ../../文件 的写法', ['context']],
  ['项目的技术栈是 Vue 3', ['context']],
  ['Repo: HanMaXiao/dsh-prompt-optimize', ['context']],
  ['我想让登录页不再白屏', ['goal']],
  ['I want the login page to stop going white', ['goal']],
  ['我负责登录模块的改造', ['role']],
  ["I'm a backend engineer", ['role']],
  ['You are an engineer reviewing this diff', ['role']],
  ['Act as a code reviewer', ['role']],
  ['别动 src/api/session.ts 的导出签名', ['context', 'constraints']],
  ['Only modify the lib directory', ['constraints']],
  ['跑一下测试', ['acceptance']],
  ['Acceptance: `node --test` passes', ['acceptance']],
  ['用表格对比两个方案', ['format']],
  ['Format: bullet list', ['format']],
  ['以 json 返回结果', ['format']],
  ['新建 docs/login-fix.md 并把结论写进去', ['context', 'deliverable']],
  ['交付物：一份可读的 md', ['deliverable']],
]

/** Tokens that look path-shaped to a naive `[\w.-]+\/[\w.-]+` but carry no location. */
const NOT_A_PATH = [
  ['2024/10/30 上线', 'a date has no extension in its last segment'],
  ['和/或 分支都要覆盖', 'a CJK slash is not a path separator'],
  ['做一次 A/B 测试', 'a ratio is not a path'],
]

describe('8. the analyzer on drafts that used to be mis-scored', () => {
  it('an empty draft reports nothing and breaks nothing', () => {
    for (const draft of ['', '   \n\t  ', undefined, null]) {
      const report = analyzeDraft(draft)
      check(`an empty draft scores 0/7 (${JSON.stringify(draft)})`,
        report.present.length === 0 && report.missing.length === BLOCKS.length && report.score === 0,
        `${report.present.length}/${BLOCKS.length}`)
    }
    const report = analyzeDraft('')
    check('an empty draft counts no characters and no words', report.characters === 0 && report.words === 0,
      `${report.characters} chars, ${report.words} words`)
  })

  it('an empty draft still gets the full deterministic rewrite', () => {
    const rewritten = renderProfessional('')
    check('the rewrite carries all seven headings', BLOCKS.every(block => rewritten.includes(`## ${block.title}`)))
    check('the rewrite asks for the goal instead of inventing one', rewritten.includes('⟨待确认：要拿到什么结果⟩'))
    check('the diagnosis says the draft carries nothing', diagnose('').lines[0].includes('没有任何一块标准信息'))
    check('the diagnosis lists every missing block', diagnose('').lines.length === BLOCKS.length + 1,
      String(diagnose('').lines.length))
  })

  it('an English-only draft covers every block', () => {
    const report = analyzeDraft(richEn)
    check('the English draft covers every block', report.missing.length === 0, report.missing.join(','))
    check('the English draft scores full marks', report.score === 1, String(report.score))
  })

  it('a Chinese draft with all seven blocks covers every block', () => {
    const report = analyzeDraft(richZh)
    check('the Chinese draft covers every block', report.missing.length === 0, report.missing.join(','))
    check('the diagnosis names every block as present',
      diagnose(richZh).lines[0] === `已具备：${BLOCKS.map(block => block.title).join('、')}。`,
      diagnose(richZh).lines[0])
  })

  for (const [draft, expected, reason] of AMBIGUOUS) {
    it(`refuses: ${reason}`, () => {
      const report = analyzeDraft(draft)
      check(`"${draft}" reports exactly ${expected.length === 0 ? 'no block' : expected.join(',')}`,
        report.present.join(',') === expected.join(','), report.present.join(','))
    })
  }

  for (const [draft, expected] of KEPT) {
    it(`keeps: ${draft}`, () => {
      const report = analyzeDraft(draft)
      check(`"${draft}" reports ${expected.join(',')}`, report.present.join(',') === expected.join(','), report.present.join(','))
    })
  }

  for (const [draft, reason] of NOT_A_PATH) {
    it(`does not read a path into: ${reason}`, () => {
      const report = analyzeDraft(draft)
      check(`"${draft}" reports no data source`, !report.present.includes('context'), report.present.join(','))
    })
  }
})

describe('9. concurrent lesson writes keep every lesson', () => {
  const store = new LessonsStore(path.join(testLibrary, 'lessons'))

  it('records every lesson, in order, with stable ids', () => {
    const ids = []
    const totals = []
    for (let index = 1; index <= 6; index += 1) {
      const result = store.add({
        lesson: `lesson ${index}`,
        category: index % 2 === 0 ? 'format' : 'structure',
        ...(index === 1 ? { evidence: '帮我看看登录' } : {}),
      })
      ids.push(result.record.id)
      totals.push(result.total)
    }
    check('six adds report six running totals', totals.join(',') === '1,2,3,4,5,6', totals.join(','))
    check('six adds derive six distinct ids', new Set(ids).size === 6, ids.join(','))
    check('the store reads all six back', store.readSync().length === 6, String(store.readSync().length))
  })

  it('keeps the lessons.json format and the synchronous add() contract', () => {
    const raw = readFileSync(store.file, 'utf8')
    const parsed = JSON.parse(raw)
    check('the file carries version 1', parsed.version === 1, String(parsed.version))
    check('the file carries every lesson, oldest first',
      parsed.lessons.map(lesson => lesson.lesson).join('|') === 'lesson 1|lesson 2|lesson 3|lesson 4|lesson 5|lesson 6',
      parsed.lessons.map(lesson => lesson.lesson).join('|'))
    check('an unknown category is not invented', parsed.lessons[0].category === 'structure' && parsed.lessons[1].category === 'format')
    check('an absent evidence is omitted rather than stored empty',
      parsed.lessons[0].evidence === '帮我看看登录' && parsed.lessons[1].evidence === undefined)
    check('the file ends with exactly one newline', raw.endsWith('}\n') && !raw.endsWith('}\n\n'))
    const immediate = store.add({ lesson: '同步返回' })
    check('add() hands back the record without a promise', immediate.record.id === 'T007' && immediate.total === 7,
      `${immediate.record.id}/${immediate.total}`)
  })

  it('a blank lesson is refused before the queue runs', () => {
    assert.throws(() => store.add({ lesson: '   ' }), /non-empty/)
    check('the refused call wrote nothing', store.readSync().length === 7, String(store.readSync().length))
  })

  it('an interleaved add is refused instead of racing the unit that holds the queue', () => {
    const before = store.readSync().length
    const realRead = store.readSync.bind(store)
    let armed = true
    let refusal
    // Re-enter the store from inside a unit that is still running: the second
    // caller sees the same lesson count as the first, which is exactly the race
    // that used to drop a lesson.
    store.readSync = () => {
      const lessons = realRead()
      if (armed) {
        armed = false
        try {
          store.add({ lesson: 'interleaved' })
        }
        catch (error) {
          refusal = error
        }
      }
      return lessons
    }
    const outer = store.add({ lesson: 'outer' })
    delete store.readSync

    check('the interleaved call is refused, naming the file it would have raced',
      refusal instanceof Error && refusal.message.includes('still in flight') && refusal.message.includes('lessons.json'),
      refusal?.message)
    check('the interleaved call wrote nothing of its own', store.readSync().length === before + 1,
      `${before} -> ${store.readSync().length}`)
    check('the call that held the queue completed', outer.record.id === 'T008' && outer.total === before + 1,
      `${outer.record.id}/${outer.total}`)

    const retried = store.add({ lesson: 'interleaved' })
    check('the retried call lands and keeps every lesson', store.readSync().length === before + 2,
      String(store.readSync().length))
    check('every id in the store is distinct',
      new Set(store.readSync().map(lesson => lesson.id)).size === store.readSync().length,
      store.readSync().map(lesson => lesson.id).join(','))
    check('the retried call derived its id from the new count', retried.record.id === 'T009', retried.record.id)
  })

  it('a burst of adds loses none of them', () => {
    const burst = new LessonsStore(path.join(testLibrary, 'burst'))
    for (let index = 1; index <= 50; index += 1) burst.add({ lesson: `burst ${index}` })
    const lessons = burst.readSync()
    check('all fifty survive', lessons.length === 50, String(lessons.length))
    check('all fifty ids are distinct', new Set(lessons.map(lesson => lesson.id)).size === 50)
    check('the last id follows the count', lessons[49].id === 'T050', lessons[49].id)
  })
})

describe('10. the atomic replacement leaves no debris', () => {
  const directory = path.join(testLibrary, 'atomic')
  const target = path.join(directory, 'lessons.json')

  it('replaces the target in one step', () => {
    mkdirSync(directory, { recursive: true })
    writeFileSync(target, 'old', 'utf8')
    writeFileAtomic(target, 'new')
    check('the target carries the new content', readFileSync(target, 'utf8') === 'new')
    check('no temp file is left beside it', readdirSync(directory).join(',') === 'lessons.json',
      readdirSync(directory).join(','))
  })

  it('a failed write names the target and leaves nothing behind', () => {
    const missing = path.join(testLibrary, 'never-created', 'lessons.json')
    assert.throws(() => writeFileAtomic(missing, 'x'),
      error => error.message.includes(missing) && !existsSync(path.dirname(missing)))
  })
})
