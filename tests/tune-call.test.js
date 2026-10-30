/**
 * Section 9 of the migrated offline suite: the shared model call.
 *
 * `lib/tune-call.js` is the one implementation both `prompt_tune` (a Host tool)
 * and `optimizeDraft` (the Remote behind the ✨ button) run, so covering it here
 * covers the Remote's core without a Harness process. Migrated from
 * `check-optimize.mjs` section 9.
 */
import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runTune, TuneCallError } from '../lib/tune-call.js'
import { TUNE_SYSTEM_PROMPT } from '../lib/tune.js'

/** One migrated assertion; see `tune.test.js` for why the shape is kept. */
function check(label, ok, detail) {
  assert.ok(ok, `${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

describe('9. the shared model call (the Remote\'s core)', () => {
  const seen = []
  const fakeLlm = chunks => ({
    stream(options) {
      seen.push(options)
      return (async function* run() { yield* chunks })()
    },
  })
  const call = stream => ({ provider: 'p', model: 'm', draft: '帮我看看登录', ...stream })
  const failure = async (chunks, stream = {}) => {
    try {
      await runTune(fakeLlm(chunks), call(stream))
      return undefined
    }
    catch (error) {
      return error
    }
  }

  let delta
  before(async () => {
    delta = await runTune(fakeLlm([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '第一段' },
      { type: 'text-delta', index: 0, text: '第二段' },
      { type: 'finish', reason: { kind: 'stop' } },
    ]), call({}))
  })

  it('accumulates deltas and reports the finish reason', () => {
    check('accumulates deltas and reports the finish reason',
      delta.prompt === '第一段第二段' && delta.finish === 'stop', `${delta.prompt}/${delta.finish}`)
  })

  it('sends the plugin\'s own system prompt', () => {
    check('sends the plugin\'s own system prompt',
      seen[0].system === TUNE_SYSTEM_PROMPT && seen[0].system.includes('只输出改写后的提示词正文'))
  })

  it('frames the draft verbatim in the user message', () => {
    check('frames the draft verbatim in the user message',
      seen[0].messages[0].content[0].text.includes('帮我看看登录')
        && seen[0].messages[0].content[0].text.includes('<草稿>'))
  })

  it('sends the resolved route and a cancellation signal', () => {
    check('sends the resolved route and a cancellation signal',
      seen[0].provider === 'p' && seen[0].model === 'm' && seen[0].signal instanceof AbortSignal,
      String(seen[0].signal?.constructor?.name))
  })

  it('an empty draft is refused before any model call', async () => {
    // Ordered before the failure probes below on purpose: `seen` must still hold
    // only the successful call, which is what proves no model call was made.
    const empty = await runTune(fakeLlm([]), { provider: 'p', model: 'm', draft: '   ' }).catch(error => error)
    check('an empty draft is refused before any model call',
      empty instanceof TuneCallError && empty.code === 'empty-draft' && seen.length === 1, empty?.code)
  })

  it('a terminal error finish becomes a typed failure', async () => {
    const modelFailed = await failure([{ type: 'finish', reason: { kind: 'error', failure: { message: 'boom', code: 'X' } } }])
    check('a terminal error finish becomes a typed failure',
      modelFailed?.code === 'model-failed' && modelFailed.message.includes('boom'), modelFailed?.message)
  })

  it('a token cap is reported as its own code', async () => {
    const capped = await failure([{ type: 'finish', reason: { kind: 'max-tokens' } }])
    check('a token cap is reported as its own code', capped?.code === 'max-tokens', capped?.code)
  })

  it('a tool request is refused', async () => {
    const toolCall = await failure([{ type: 'finish', reason: { kind: 'tool-calls' } }])
    check('a tool request is refused', toolCall?.code === 'tool-calls', toolCall?.code)
  })

  it('blank output is a failure, not a success', async () => {
    const blank = await failure([
      { type: 'text-delta', index: 0, text: '   ' },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    check('blank output is a failure, not a success', blank?.code === 'empty-result', blank?.code)
  })
})
