/**
 * The model call both halves make.
 *
 * `prompt_tune` (a Host tool) and `optimizeDraft` (the Remote behind the ✨
 * button) ask for exactly the same thing: one completion under
 * {@link TUNE_SYSTEM_PROMPT}, returning the rewritten prompt and nothing else.
 * Keeping that in one pure helper means the offline suite covers the Remote's
 * core — the Remote module itself cannot be imported outside a Harness process,
 * because it needs the protocol package.
 *
 * Streaming chunks are accumulated by hand: a `text-delta` carries text and a
 * `finish` chunk carries the terminal reason, which is the whole contract this
 * needs. No Harness import, no `BlockAssembler`.
 */
import { TUNE_SYSTEM_PROMPT, tuneInstruction } from './tune.js'

/** A failure the caller should translate into its own error type. */
export class TuneCallError extends Error {
  /**
   * @param code Stable code, e.g. `model-failed`.
   * @param message Human-readable cause, including the provider's own message.
   */
  constructor(code, message) {
    super(message)
    this.name = 'TuneCallError'
    this.code = code
  }
}

/**
 * Combine the caller's cancellation with a deadline.
 *
 * @param signal Caller cancellation, when it has one.
 * @param timeoutMs Deadline in milliseconds.
 * @returns A signal that aborts on either.
 */
export function callSignal(signal, timeoutMs) {
  const deadline = AbortSignal.timeout(timeoutMs)
  if (signal === undefined) return deadline
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, deadline]) : signal
}

/**
 * Run one rewrite.
 *
 * @param llm The injected `llm` service.
 * @param options `{ provider, model, draft, intent?, maxTokens?, timeoutMs?, signal? }`.
 * @returns `{ prompt, finish }` — the rewritten text and the terminal reason.
 * @throws TuneCallError for an empty draft, a terminal model failure, a token cap, or empty output.
 */
export async function runTune(llm, options) {
  const draft = typeof options.draft === 'string' ? options.draft.trim() : ''
  if (draft === '') throw new TuneCallError('empty-draft', 'nothing to optimize: the draft is empty')
  const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : 2048
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120000
  const chunks = llm.stream({
    provider: options.provider,
    model: options.model,
    system: TUNE_SYSTEM_PROMPT,
    maxTokens,
    messages: [{ role: 'user', content: [{ type: 'text', text: tuneInstruction(draft, { intent: options.intent }) }] }],
    signal: callSignal(options.signal, timeoutMs),
  })
  let output = ''
  let finish
  for await (const chunk of chunks) {
    if (chunk?.type === 'text-delta') output += chunk.text
    else if (chunk?.type === 'finish') finish = chunk.reason
  }
  const reason = finish?.kind
  if (reason === 'error' || reason === 'aborted') {
    throw new TuneCallError('model-failed', `model call failed: ${finish.failure?.message ?? reason} (${finish.failure?.code ?? 'unknown'})`)
  }
  if (reason === 'max-tokens') {
    throw new TuneCallError('max-tokens', `output hit maxTokens (${maxTokens}); raise it or shorten the draft`)
  }
  if (reason === 'tool-calls') {
    throw new TuneCallError('tool-calls', 'the model requested a tool; this call must return text only')
  }
  const prompt = output.trim()
  if (prompt === '') throw new TuneCallError('empty-result', 'the model returned no text')
  return { prompt, finish: reason ?? 'unknown' }
}
