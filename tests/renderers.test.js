/**
 * The renderer half of section 4 of the migrated offline suite: the three tool
 * renderers must never throw.
 *
 * `output.render` runs on the UI path, so a throw there blanks the tool card
 * instead of failing a test. Migrated from the `rendered output is a text
 * content block` assertion of `check-optimize.mjs` section 4 — which is why this
 * file exists on its own, even though the rest of that section (the live
 * `dsh-tools` registry preconditions) lives beside the Host half in
 * `host-tools.test.js`.
 *
 * The minimal fake Cordis context below is a deliberate copy of the one in
 * `host-tools.test.js`: each test file stays self-contained rather than reaching
 * into a sibling's harness.
 */
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { apply: applyHost } = await import('../host.js')

const PACKAGE_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// This file's own scratch library: `node --test` runs test files in parallel, so
// two files must never share one scratch directory.
const testLibrary = path.join(PACKAGE_DIR, 'prompt-optimize-selftest', 'renderers')
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

describe('the tool renderers never throw', () => {
  let host
  before(async () => {
    host = fakeContext()
    applyHost(host.ctx, { libraryDir: testLibrary })
    // The Remote module is imported lazily; let its isolated failure settle.
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  it('rendered output is a text content block', () => {
    check('rendered output is a text content block',
      host.registered.tools.every((tool) => {
        const blocks = tool.output.render({}, { ok: true })
        return Array.isArray(blocks) && blocks.length > 0 && blocks.every(block => typeof block?.text === 'string')
      }))
  })
})
