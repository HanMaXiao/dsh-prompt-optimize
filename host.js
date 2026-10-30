/**
 * Prompt Optimize — Host half.
 *
 * Contributes three tools and the self-iterating
 * `prompt-optimization-best-practices` skill:
 *
 * - `prompt_tune_guide` scores a draft against the seven-block standard and
 *   rewrites it deterministically — no model call, works offline, instant.
 * - `prompt_tune` does the semantic rewrite through the session's own model,
 *   under {@link TUNE_SYSTEM_PROMPT}.
 * - `prompt_tune_learn` appends a lesson to the skill.
 *
 * The module deliberately imports nothing from the Harness: the LLM arrives as
 * the injected `llm` service and the request is a plain object, so the bundle
 * keeps working without a build step or a declared dependency.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeLessonsSection, defaultLibraryDir, LESSON_CATEGORIES, LessonsStore } from './lib/lessons.js'
import { writeReceipt } from './lib/receipt.js'
import { runTune, TuneCallError } from './lib/tune-call.js'
import { analyzeDraft, BLOCKS, diagnose, renderProfessional } from './lib/tune.js'

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))
const SKILL_NAME = 'prompt-optimization-best-practices'
const SKILL_DIR = path.join(PACKAGE_DIR, 'skills')
const LESSONS_MARKER = '<!-- LESSONS -->'

const TOOL_GUIDE = 'prompt_tune_guide'
const TOOL_TUNE = 'prompt_tune'
const TOOL_LEARN = 'prompt_tune_learn'

const text = value => [{ type: 'text', text: String(value) }]

/** Model-facing result shape; `render` is mandatory or the tool never registers. */
const resultOutput = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => text(JSON.stringify(value, null, 2)),
}

/** Read the baseline skill body, falling back to a stub that names the failure. */
function readBaseline() {
  const file = path.join(SKILL_DIR, `${SKILL_NAME}.md`)
  try {
    return readFileSync(file, 'utf8')
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return [
      `# ${SKILL_NAME}`,
      '',
      `> 基线 skill 正文读取失败：${reason}`,
      '',
      LESSONS_MARKER,
      '',
    ].join('\n')
  }
}

/** Compose the served skill body: baseline plus the accumulated lessons. */
function composeSkillBody(baseline, store) {
  const lessons = store.readSync()
  const section = composeLessonsSection(lessons, store.problem)
  if (baseline.includes(LESSONS_MARKER)) return baseline.replace(LESSONS_MARKER, section)
  return `${baseline.trimEnd()}\n\n${section}`
}

/** Validate the row config; unknown keys fail loudly instead of being ignored. */
function resolveOptions(config) {
  const raw = config ?? {}
  const known = new Set(['libraryDir', 'provider', 'model', 'maxTokens', 'timeoutMs'])
  const unknown = Object.keys(raw).filter(key => !known.has(key))
  if (unknown.length > 0) {
    throw new Error(`@local/dsh-prompt-optimize has unknown config key(s) ${unknown.join(', ')} — config is { libraryDir?, provider?, model?, maxTokens?, timeoutMs? }`)
  }
  const libraryDir = typeof raw.libraryDir === 'string' && raw.libraryDir.trim() !== ''
    ? path.resolve(raw.libraryDir)
    : defaultLibraryDir()
  const provider = typeof raw.provider === 'string' && raw.provider.trim() !== '' ? raw.provider.trim() : undefined
  const model = typeof raw.model === 'string' && raw.model.trim() !== '' ? raw.model.trim() : undefined
  if ((provider === undefined) !== (model === undefined)) {
    throw new Error('@local/dsh-prompt-optimize: `provider` and `model` must be configured together')
  }
  const maxTokens = Number.isFinite(raw.maxTokens) && raw.maxTokens > 0 ? Math.floor(raw.maxTokens) : 2048
  const timeoutMs = Number.isFinite(raw.timeoutMs) && raw.timeoutMs > 0 ? Math.floor(raw.timeoutMs) : 120000
  return { libraryDir, provider, model, maxTokens, timeoutMs }
}

function requireString(args, key) {
  const value = args?.[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} must be a non-empty string`)
  }
  return value
}

function optionalString(args, key) {
  const value = args?.[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${key} must be a string when present`)
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Resolve the model route.
 *
 * Order: explicit tool arguments, then the row config, then the profile's own
 * default model (`ctx.agentDefaultModel`). The last step is what makes the
 * bundle work in a fresh profile without hardcoding a provider into the patch —
 * the optimizer simply runs on whatever model that profile defaults to.
 */
function resolveRoute(options, args, defaultSelection) {
  const fallback = typeof defaultSelection === 'function' ? defaultSelection() : undefined
  const provider = optionalString(args, 'provider') ?? options.provider ?? fallback?.provider
  const model = optionalString(args, 'model') ?? options.model ?? fallback?.model
  if (provider === undefined || model === undefined) {
    throw new Error([
      'prompt_tune needs a model route and none could be resolved.',
      'Tried, in order: tool arguments `provider`/`model`; the bundle row config; `ctx.agentDefaultModel`.',
      'Set `provider` and `model` together in cordis.patch.yml → row `prompt-tune-core` → config.',
    ].join('\n'))
  }
  return { provider, model }
}

/**
 * Run one semantic rewrite through the injected LLM service.
 *
 * The call itself lives in `lib/tune-call.js` so the Remote behind the ✨ button
 * runs the very same implementation — and so the offline suite covers it.
 */
async function rewrite(llm, options, { draft, intent, provider, model, signal }) {
  try {
    const { prompt, finish } = await runTune(llm, {
      provider,
      model,
      draft,
      intent,
      maxTokens: options.maxTokens,
      timeoutMs: options.timeoutMs,
      signal,
    })
    return { prompt, route: `${provider}/${model}`, finish }
  }
  catch (error) {
    if (error instanceof TuneCallError) throw new Error(`prompt_tune: ${error.message}`)
    throw error
  }
}

/** Deterministic rewrite: score the draft, then fill the standard without a model. */
function guideTool(options) {
  return {
    name: TOOL_GUIDE,
    description: [
      'Score a rough prompt draft against the seven-block standard and rewrite it deterministically.',
      'No model call: instant, offline, and repeatable, so it is the right first pass before spending tokens.',
      `Returns which of the ${BLOCKS.length} blocks the draft already carries, what each missing block needs, and a rewritten prompt.`,
      'Use this to show a user why their draft is thin; use prompt_tune when the wording itself must improve.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        draft: { type: 'string', description: 'The user\'s raw input, verbatim. Do not clean it up first.' },
        intent: { type: 'string', description: 'One line about what the prompt is for, when the draft does not say.' },
      },
      required: ['draft'],
      additionalProperties: false,
    },
    output: {
      ...resultOutput,
      // A renderer must never throw: it runs on the UI path, and a throw there
      // blanks the tool card. Every field is therefore read defensively.
      render: (_args, value) => text([
        `score: ${(value?.present ?? []).length}/${BLOCKS.length} blocks (${Math.round((value?.score ?? 0) * 100)}%)`,
        `present: ${(value?.present ?? []).join(', ') || '(none)'}`,
        `missing: ${(value?.missing ?? []).join(', ') || '(none)'}`,
        '',
        ...(value?.findings ?? []).map(line => `- ${line}`),
        '',
        '--- rewritten draft ---',
        String(value?.prompt ?? ''),
      ].join('\n')),
    },
    execute(args) {
      const draft = requireString(args, 'draft')
      const intent = optionalString(args, 'intent')
      const { report, lines } = diagnose(draft)
      return {
        present: report.present,
        missing: report.missing,
        score: report.score,
        characters: report.characters,
        findings: lines,
        prompt: renderProfessional(draft, { intent }),
      }
    },
    presentCall: args => ({ card: 'generic', title: `规范输入 · ${String(args?.draft ?? '').slice(0, 48)}`, kind: 'search', rawInput: args }),
    presentResult: (_args, result) => {
      const value = result?.value ?? {}
      return {
        card: 'generic',
        title: `七块标准 ${value.present?.length ?? 0}/${BLOCKS.length}`,
        content: text(`已具备：${(value.present ?? []).join('、') || '无'}\n缺失：${(value.missing ?? []).join('、') || '无'}`),
      }
    },
  }
}

/** Semantic rewrite through the session's model. */
function tuneTool(getLlm, options, getDefaultSelection) {
  return {
    name: TOOL_TUNE,
    description: [
      'Rewrite a rough prompt draft into a professional, standard prompt using the configured model.',
      'Runs one model call under this plugin\'s own system prompt: the model sees the draft plus the seven-block standard and returns only the rewritten prompt.',
      'Facts the draft does not contain are never invented — missing values become explicit "confirm this first" lines.',
      'Prefer prompt_tune_guide when structure alone is missing; use this when the wording, logic or tone must improve.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        draft: { type: 'string', description: 'The user\'s raw input, verbatim.' },
        intent: { type: 'string', description: 'One line about what the prompt is for, when the draft does not say.' },
        provider: { type: 'string', description: 'Provider route override. Defaults to the row config.' },
        model: { type: 'string', description: 'Model id override. Defaults to the row config.' },
      },
      required: ['draft'],
      additionalProperties: false,
    },
    output: {
      ...resultOutput,
      render: (_args, value) => text([
        `rewritten by ${value?.route ?? '?'} (finish: ${value?.finish ?? '?'})`,
        '',
        String(value?.prompt ?? ''),
      ].join('\n')),
    },
    async execute(args, exec) {
      const draft = requireString(args, 'draft')
      const llm = getLlm()
      if (llm === undefined) {
        throw new Error('prompt_tune: the `llm` service is not available in this composition, so no model call can run')
      }
      const route = resolveRoute(options, args, getDefaultSelection)
      return rewrite(llm, options, { draft, intent: optionalString(args, 'intent'), ...route, signal: exec?.signal })
    },
    presentCall: args => ({ card: 'generic', title: `语义优化 · ${String(args?.draft ?? '').slice(0, 48)}`, kind: 'search', rawInput: args }),
    presentResult: (_args, result) => {
      const value = result?.value ?? {}
      return {
        card: 'generic',
        title: `已改写（${value.route ?? '?'}）`,
        content: text(String(value.prompt ?? '').slice(0, 800)),
      }
    },
  }
}

/** Append one lesson to the self-iterating skill. */
function learnTool(store) {
  return {
    name: TOOL_LEARN,
    description: [
      'Record one lesson about prompt optimization so the shared skill improves for every future session.',
      'Call it after a rewrite that a human had to fix, or after a draft shape this bundle handled badly.',
      'The lesson is appended to the skill body and mirrored to disk immediately; the next session that loads the skill reads it.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        lesson: { type: 'string', description: 'One concrete, actionable sentence. What to do differently next time.' },
        category: { type: 'string', enum: LESSON_CATEGORIES, description: 'Where the lesson belongs in the skill.' },
        evidence: { type: 'string', description: 'The observation that produced it: the draft, the output, the user\'s correction.' },
      },
      required: ['lesson'],
      additionalProperties: false,
    },
    output: {
      ...resultOutput,
      render: (_args, value) => text([
        `recorded ${value?.id ?? '?'} (${value?.category ?? '?'}); ${value?.total ?? 0} lesson(s) total`,
        `store: ${value?.file ?? '(unknown)'}`,
        value?.mirror === undefined ? 'mirror: not written (read-only directory)' : `mirror: ${value.mirror}`,
        'The skill now carries it; the next session loading it will read the lesson.',
      ].join('\n')),
    },
    execute(args, exec) {
      const { record, total, file } = store.add({
        lesson: requireString(args, 'lesson'),
        category: optionalString(args, 'category'),
        evidence: optionalString(args, 'evidence'),
      })
      const body = composeSkillBody(readBaseline(), store)
      const mirror = store.writeMirror(body)
      if (typeof exec?.onProgress === 'function') {
        // Keep the refresh observable without inventing a session event type.
        exec.onProgress(`skill refreshed (${body.length} bytes)`)
      }
      return { ...record, total, file, mirror }
    },
    presentCall: args => ({ card: 'generic', title: `记一条教训 · ${String(args?.lesson ?? '').slice(0, 48)}`, kind: 'search', rawInput: args }),
    presentResult: (_args, result) => {
      const value = result?.value ?? {}
      return { card: 'generic', title: `已记 ${value.id ?? '?'}`, content: text(String(value.lesson ?? '')) }
    },
  }
}

/** Write the plugin's own receipt: which generation ran and what it registered. */
function writeStatus(options, fields) {
  return writeReceipt(options.libraryDir, 'status.json', {
    libraryDir: options.libraryDir,
    skill: SKILL_NAME,
    provider: options.provider ?? null,
    model: options.model ?? null,
    ...fields,
  })
}
/**
 * Register the three tools, reporting every failure together.
 *
 * A throw inside an injection fiber is silent, and that once turned a missing
 * `output.render` into four invisible tools — hence the aggregate.
 */
function registerTools(ctx, { store, options, getLlm, getDefaultSelection, state }) {
  const definitions = [
    guideTool(options),
    tuneTool(getLlm, options, getDefaultSelection),
    learnTool(store),
  ]
  const failures = []
  const registered = []
  for (const definition of definitions) {
    try {
      ctx.tools.register(definition)
      registered.push(definition.name)
    }
    catch (error) {
      failures.push(`${definition.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  state.tools = registered
  state.toolsFailed = failures
  writeStatus(options, state)
  if (failures.length > 0) {
    throw new Error(`@local/dsh-prompt-optimize registered ${registered.length}/${definitions.length} tools; these failed:\n- ${failures.join('\n- ')}`)
  }
}

/** Register the evolving skill and keep the readable mirror in step. */
function registerSkill(ctx, { store, baseline }) {
  ctx.skills.register({
    name: SKILL_NAME,
    description: '提示词优化最佳实践：把一句草稿改写成专业、规范、可执行的提示词——七块标准、该补什么、怎么验收，以及本插件工具的用法。写提示词、优化用户输入、或判断该不该先补全输入时先加载本 skill。',
    source: 'runtime',
    resourceBase: { kind: 'directory', path: SKILL_DIR },
    content: composeSkillBody(baseline, store),
  })
  store.writeMirror(composeSkillBody(baseline, store))
}

/**
 * Mount the Host half.
 *
 * @param ctx Host context.
 * @param config `{ libraryDir?, provider?, model?, maxTokens?, timeoutMs? }` from the row.
 */
export function apply(ctx, config = {}) {
  const options = resolveOptions(config)
  const store = new LessonsStore(options.libraryDir)
  const baseline = readBaseline()

  let llm
  try {
    ctx.inject(['llm'], (llmCtx) => { llm = llmCtx.llm })
  }
  catch (error) {
    ctx.logger?.warn?.(`@local/dsh-prompt-optimize: llm service unavailable — ${String(error)}`)
  }

  // The profile's own default model: the portable route source that keeps this
  // bundle from hardcoding a provider into its patch.
  let defaultSelection
  try {
    ctx.inject(['agentDefaultModel'], (modelCtx) => {
      // Read through optional chaining: the service can be disposed between the
      // injection and the call, and a route lookup must never throw here.
      defaultSelection = () => modelCtx.agentDefaultModel?.currentSelection?.()
    })
  }
  catch (error) {
    ctx.logger?.warn?.(`@local/dsh-prompt-optimize: agentDefaultModel unavailable — ${String(error)}`)
  }

  try {
    ctx.inject(['skills'], (skillCtx) => registerSkill(skillCtx, { store, baseline }))
  }
  catch (error) {
    ctx.logger?.warn?.(`@local/dsh-prompt-optimize: skill registration failed — ${String(error)}`)
  }

  // The client-facing Remote the ✨ button calls.
  //
  // Its module is imported lazily and its mount is isolated on purpose: it
  // needs the `@deepseek-ai/dsh-typert-protocol` package, and this bundle's
  // tools, skill and button must all keep working if that import ever fails.
  // The client half checks for the namespace before calling it and falls back
  // to handing the rewrite to `prompt_tune`, so a missing Remote degrades into
  // the older behaviour instead of breaking the button.
  const state = { tools: [], toolsFailed: [], remote: 'pending' }
  void (async () => {
    try {
      const module = await import('./remote.js')
      ctx.plugin(module.PromptOptimizeRemote)
      // Read the binding back through the protocol's own reader: the marker is
      // installed by hand, so only `remoteMethods` knows whether it landed.
      state.remote = module.describeRemote(ctx)
    }
    catch (error) {
      state.remote = `failed: ${error instanceof Error ? error.message : String(error)}`
      ctx.logger?.warn?.(`@local/dsh-prompt-optimize: remote unavailable — ${String(error)}`)
    }
    writeStatus(options, state)
  })()

  try {
    ctx.inject(['tools'], (toolCtx) => registerTools(toolCtx, {
      store,
      options,
      getLlm: () => llm,
      getDefaultSelection: () => defaultSelection?.(),
      state,
    }))
  }
  catch (error) {
    ctx.logger?.warn?.(`@local/dsh-prompt-optimize: tool registration failed — ${String(error)}`)
    state.toolsFailed = [String(error)]
    writeStatus(options, state)
  }
}

/** Static description of what this half contributes; used by the README and tests. */
export const contributions = {
  skill: SKILL_NAME,
  tools: [TOOL_GUIDE, TOOL_TUNE, TOOL_LEARN],
  blocks: BLOCKS.map(block => block.title),
  libraryDir: defaultLibraryDir(),
  hasBaseline: existsSync(path.join(SKILL_DIR, `${SKILL_NAME}.md`)),
}
