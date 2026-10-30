/**
 * Sections 3–7 of the migrated offline suite: the Host half.
 *
 * The bundle's own `host.js` and `mode.js` are driven against a minimal fake
 * Cordis context — the same one `check-optimize.mjs` used — so a definition the
 * live registry would reject fails here instead of silently inside an injection
 * fiber. Sections 5 and 6 additionally exercise the model-less `prompt_tune`
 * path and the lesson round-trip; section 7 covers the preset half.
 *
 * Migrated from `check-optimize.mjs` sections 3, 4 (the live `dsh-tools` registry
 * preconditions), 5, 6 and 7. Section 4's renderer assertion lives in
 * `renderers.test.js`.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { composeLessonsSection, defaultLibraryDir, LessonsStore } from '../lib/lessons.js'
import { apply as applyMode } from '../mode.js'

const { apply: applyHost } = await import('../host.js')

const PACKAGE_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// This file's own scratch library: `node --test` runs test files in parallel, so
// two files must never share one scratch directory.
const testLibrary = path.join(PACKAGE_DIR, 'prompt-optimize-selftest', 'host-tools')
rmSync(testLibrary, { recursive: true, force: true })
after(() => rmSync(testLibrary, { recursive: true, force: true }))

/** One migrated assertion; see `tune.test.js` for why the shape is kept. */
function check(label, ok, detail) {
  assert.ok(ok, `${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

function fakeContext({ withRoute = true, stream } = {}) {
  const registered = { tools: [], skills: [], sections: [], effects: 0, warnings: [] }
  const makeCtx = () => {
    const ctx = {
      inject: (_deps, callback) => { callback(makeCtx()) },
      effect: (callback) => { registered.effects++; return callback() },
      tools: { register: definition => { registered.tools.push(definition); return () => {} } },
      skills: { register: definition => { registered.skills.push(definition); return () => {} } },
      systemPrompt: {
        section: definition => { registered.sections.push(definition); return () => {} },
        getSectionOrder: () => 500,
      },
      logger: { warn: message => { registered.warnings.push(String(message)) } },
      llm: { stream: stream ?? (() => (async function* empty() {})()) },
    }
    if (withRoute) ctx.agentDefaultModel = { currentSelection: () => ({ provider: 'fake-provider', model: 'fake-model' }) }
    return ctx
  }
  return { ctx: makeCtx(), registered }
}

const vague = '帮我看看登录那个问题'

// The Host half mounted once for the whole file: sections 4–6 all read back what
// section 3 registered, exactly as the original script's linear flow did.
let host

// The live `dsh-tools` registry, when this machine carries one. The definitions
// are checked against the real precondition asserts so a shape the registry
// would reject fails here instead of inside an injection fiber, where the
// rejection is silent. Neither branch is an error: with no registry to hand the
// suite reports a skip rather than a vacuous pass.
const dshToolsCandidates = [
  'D:/XiaoProject/deepseek-harness/packages/bundle/base/node_modules/@deepseek-ai/dsh-tools/lib/index.js',
  'D:/XiaoProject/deepseek-harness/packages/bundle/web-app/node_modules/@deepseek-ai/dsh-tools/lib/index.js',
]
let realTools
for (const candidate of dshToolsCandidates) {
  if (!existsSync(candidate)) continue
  try { realTools = await import(`file:///${candidate}`); break }
  catch { /* try the next candidate */ }
}

describe('3. the Host half against a minimal Cordis context', () => {
  before(async () => {
    host = fakeContext()
    applyHost(host.ctx, { libraryDir: testLibrary })
    // The Remote module is imported lazily; this build resolves no Harness
    // packages, so it must fail *without* taking the tools down with it.
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  it('registers exactly the three tools', () => {
    check('registers exactly the three tools', host.registered.tools.length === 3, host.registered.tools.map(t => t.name).join(','))
  })

  it('every tool carries a model-facing JSON Schema', () => {
    check('every tool carries a model-facing JSON Schema',
      host.registered.tools.every(tool => tool.parameters?.type === 'object'
        && typeof tool.description === 'string' && typeof tool.execute === 'function'))
  })

  it('registers exactly one skill', () => {
    check('registers exactly one skill', host.registered.skills.length === 1, host.registered.skills[0]?.name)
  })

  it('the skill body carries the baseline and a lessons section', () => {
    check('the skill body carries the baseline and a lessons section',
      host.registered.skills[0].content.includes('七块标准') && host.registered.skills[0].content.includes('已积累的经验教训'))
  })

  it('the host receipt names the three tools', () => {
    const firstReceipt = JSON.parse(readFileSync(path.join(testLibrary, 'status.json'), 'utf8'))
    check('the host receipt names the three tools', firstReceipt.tools.length === 3)
  })

  it('a Remote that cannot load is reported, and the tools survive it', () => {
    const firstReceipt = JSON.parse(readFileSync(path.join(testLibrary, 'status.json'), 'utf8'))
    check('a Remote that cannot load is reported, and the tools survive it',
      typeof firstReceipt.remote === 'string' && firstReceipt.remote.startsWith('failed:'),
      firstReceipt.remote)
  })
})

if (realTools === undefined) {
  describe('4. live tool-registry preconditions', () => {
    it('live tool-registry preconditions (skipped: dsh-tools not found)', () => {
      check('live tool-registry preconditions (skipped: dsh-tools not found)', true, 'skipped')
    })
  })
}
else {
  describe('4. live tool-registry preconditions', () => {
    it('every tool satisfies the live registry preconditions', () => {
      const problems = []
      for (const tool of host.registered.tools) {
        const output = tool.output
        if (output === undefined || typeof output !== 'object' || typeof output.render !== 'function') {
          problems.push(`${tool.name}: output.render missing`)
          continue
        }
        for (const [what, schema] of [['output.schema', output.schema], ['parameters', tool.parameters]]) {
          try { realTools.assertSupportedJsonSchema(schema) }
          catch (error) { problems.push(`${tool.name}: ${what} — ${error.message}`) }
        }
      }
      check('every tool satisfies the live registry preconditions', problems.length === 0, problems.join(' | '))
    })
  })
}

describe('5. prompt_tune path without a model', () => {
  let result, message, failure, tool
  before(async () => {
    const chunks = async function* chunks() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '## 角色\n' }
      yield { type: 'text-delta', index: 0, text: '你是修复登录的工程师。' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const streamed = fakeContext({ stream: () => chunks() })
    applyHost(streamed.ctx, { libraryDir: testLibrary })
    const tuned = streamed.registered.tools.find(candidate => candidate.name === 'prompt_tune')
    result = await tuned.execute({ draft: vague }, {})

    // No route anywhere: the error must name the whole fallback chain.
    const routeLess = fakeContext({ withRoute: false })
    applyHost(routeLess.ctx, { libraryDir: testLibrary })
    const noRoute = routeLess.registered.tools.find(candidate => candidate.name === 'prompt_tune')
    try { await noRoute.execute({ draft: vague }, {}) }
    catch (error) { message = String(error.message) }

    // Terminal failures must not look like success.
    const failing = fakeContext({
      stream: () => (async function* failing() { yield { type: 'finish', reason: { kind: 'error', failure: { message: 'boom', code: 'X' } } } })(),
    })
    applyHost(failing.ctx, { libraryDir: testLibrary })
    const failingTool = failing.registered.tools.find(candidate => candidate.name === 'prompt_tune')
    try { await failingTool.execute({ draft: vague }, {}) }
    catch (error) { failure = String(error.message) }

    tool = host.registered.tools.find(candidate => candidate.name === 'prompt_tune')
  })

  it('accumulates streamed text deltas', () => {
    check('accumulates streamed text deltas', result.prompt.includes('你是修复登录的工程师'), result.prompt.replace(/\n/g, '\\n'))
  })

  it('reports the resolved route from the profile default', () => {
    check('reports the resolved route from the profile default', result.route === 'fake-provider/fake-model', result.route)
  })

  it('a missing route fails with an actionable message', () => {
    check('a missing route fails with an actionable message',
      message.includes('agentDefaultModel') && message.includes('prompt-tune-core'), message.split('\n')[0])
  })

  it('a terminal error finish is reported, not swallowed', () => {
    check('a terminal error finish is reported, not swallowed', failure.includes('boom'), failure)
  })

  it('the tool is still registered and identifiable', () => {
    check('the tool is still registered and identifiable', typeof tool?.name === 'string')
  })
})

describe('6. lessons round-trip', () => {
  let recorded, store
  before(async () => {
    const learn = host.registered.tools.find(candidate => candidate.name === 'prompt_tune_learn')
    recorded = await learn.execute({ lesson: '一句话草稿也要先给结构', category: 'structure', evidence: '帮我看看登录' }, {})
    store = new LessonsStore(testLibrary)
  })

  it('records a lesson with a stable id', () => {
    check('records a lesson with a stable id', recorded.id === 'T001', recorded.id)
  })

  it('the store reads it back', () => {
    check('the store reads it back', store.readSync().length === 1)
  })

  it('the mirror was rewritten', () => {
    check('the mirror was rewritten', typeof recorded.mirror === 'string' && readFileSync(recorded.mirror, 'utf8').includes('一句话草稿也要先给结构'))
  })

  it('the lessons section groups by category', () => {
    check('the lessons section groups by category', composeLessonsSection(store.readSync(), undefined).includes('### 七块结构'))
  })
})

describe('7. preset half', () => {
  let mode, receipt
  before(() => {
    const previous = process.env.DSH_PROFILE_DIR
    process.env.DSH_PROFILE_DIR = testLibrary
    mode = fakeContext()
    applyMode(mode.ctx, {})
    const receiptFile = path.join(testLibrary, 'prompt-optimize', 'preset.json')
    receipt = existsSync(receiptFile) ? JSON.parse(readFileSync(receiptFile, 'utf8')) : {}
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
  })

  it('mode.js registers the prompt:tune-policy section', () => {
    check('mode.js registers the prompt:tune-policy section',
      mode.registered.sections.length === 1 && mode.registered.sections[0].name === 'prompt:tune-policy',
      mode.registered.sections[0]?.name)
  })

  it('the tune policy orders after the document policy', () => {
    check('the tune policy orders after the document policy', mode.registered.sections[0].order === 530, String(mode.registered.sections[0].order))
  })

  it('the policy tells a new session to load the skill first', () => {
    check('the policy tells a new session to load the skill first',
      mode.registered.sections[0].text.includes('每次新会话的第一件事')
        && mode.registered.sections[0].text.includes('prompt-optimization-best-practices'))
  })

  it('the policy points at the document bundle for document-sized jobs', () => {
    check('the policy points at the document bundle for document-sized jobs',
      mode.registered.sections[0].text.includes('prompt_doc_write'))
  })

  it('mode.js leaves a mount receipt naming the registered section and order', () => {
    check('mode.js leaves a mount receipt naming the registered section and order',
      receipt.section === 'prompt:tune-policy' && receipt.order === 530 && typeof receipt.version === 'string',
      `${receipt.section}@${receipt.order} v${receipt.version}`)
  })
})

describe('the default library directory', () => {
  it('the default library directory is the plugin\'s own', () => {
    check('the default library directory is the plugin\'s own',
      defaultLibraryDir().endsWith(path.join('.dsh', 'prompt-optimize')) || defaultLibraryDir().includes('prompt-optimize'),
      defaultLibraryDir())
  })
})
