/**
 * Prompt Optimize — the client-facing Remote.
 *
 * The ✨ button lives in the browser, but the model route, the credentials and
 * the optimization system prompt all live in the Host. A Typert Remote is the
 * supported bridge: this service publishes one method, the gateway exposes it
 * as `ctx.remote.<namespace>.<method>` in the page, and the button writes the
 * returned prompt straight into the composer.
 *
 * Two deliberate departures from the shipped examples:
 *
 * - **No decorator syntax.** `@Remote` is TypeScript; this bundle is plain ESM
 *   with no build step. The protocol's `Remote` is an ordinary function whose
 *   factory form (`Remote({ mode })`) returns a decorator taking
 *   `(method, context)`, and a decorator context is just
 *   `{ private, static, name, addInitializer }`. Supplying that object by hand
 *   installs the very same prototype marker the compiler would — through the
 *   public API, not a copy of its internals.
 * - **`import` from the Harness by bare specifier.** Measured with a throwaway
 *   probe bundle in this profile: `@deepseek-ai/dsh-typert-protocol` and
 *   `@deepseek-ai/cordis` resolve from a `link:`-installed package, while
 *   third-party packages (`zod`) do not. The manifest below therefore avoids
 *   schemas entirely: a strict codec needs only `{ mode, typeSymbol }`.
 */
import { Remote, RemoteError, TypertRemoteService, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { runTune, TuneCallError } from './lib/tune-call.js'

/** Cordis service key: also the wire namespace, and the client's `ctx.remote` property. */
export const SERVICE_KEY = 'promptOptimize'

/** Methods this service publishes; the manifest below must describe the same set. */
const REMOTE_METHODS = [
  { method: 'optimizeDraft', options: {} },
]

/**
 * Install one Remote marker on an instance without decorator syntax.
 *
 * @param instance Live service instance.
 * @param method Public instance method name to mark.
 * @param options `{ mode?: 'stream', exportName?: string }`.
 */
function installRemoteMarker(instance, method, options = {}) {
  const pending = []
  const context = {
    private: false,
    static: false,
    name: method,
    addInitializer: initializer => pending.push(initializer),
  }
  const implementation = instance[method]
  if (typeof implementation !== 'function') {
    throw new Error(`prompt-optimize: cannot mark "${method}" — it is not a method`)
  }
  if (options.mode === 'stream') Remote({ mode: 'stream' })(implementation, context)
  else if (options.exportName === undefined) Remote(implementation, context)
  else Remote(options.exportName)(implementation, context)
  // The initializer reads the prototype off its `this`, exactly as the
  // compiler-generated one does at class definition time.
  for (const initializer of pending) initializer.call(instance)
}

/**
 * Install every marker this service publishes.
 *
 * Exported so the offline suite can check the marker through the protocol's own
 * reader on a bare class prototype — no Cordis context required.
 *
 * @param instance Service instance, or any object whose prototype should carry the markers.
 * @param methods `{ method, options? }[]`, defaulting to this service's set.
 */
export function installRemoteMarkers(instance, methods = REMOTE_METHODS) {
  for (const entry of methods) installRemoteMarker(instance, entry.method, entry.options ?? {})
}

/** A model route, or undefined when the deployment pins none. */
function routeOf(ctx) {
  const selection = ctx.agentDefaultModel?.currentSelection?.()
  if (selection?.provider !== undefined && selection?.model !== undefined) {
    return { provider: selection.provider, model: selection.model }
  }
  return undefined
}

/** The browser-facing surface: one model call, answered with the rewritten prompt. */
export class PromptOptimizeRemote extends TypertRemoteService {
  static inject = ['llm', 'agentDefaultModel']

  /**
   * @param ctx Host context carrying the LLM service and the profile default model.
   */
  constructor(ctx) {
    super(ctx, SERVICE_KEY, { namespace: SERVICE_KEY })
    installRemoteMarkers(this)
  }

  /** @returns The route this service will use, for diagnostics. */
  route() {
    return routeOf(this.ctx)
  }

  /**
   * Rewrite one draft with the configured model.
   *
   * @param draft The user's raw draft, verbatim.
   * @param intent One line about what the prompt is for, when the draft omits it.
   * @param signal Caller cancellation, supplied by the Remote carrier.
   * @returns The rewritten prompt, and nothing else — the caller replaces its draft with it.
   */
  async optimizeDraft(draft, intent, signal) {
    const text = typeof draft === 'string' ? draft.trim() : ''
    if (text === '') {
      throw new RemoteError('prompt-optimize/empty-draft', 'nothing to optimize: the draft is empty', {})
    }
    const route = routeOf(this.ctx)
    if (route === undefined) {
      throw new RemoteError(
        'prompt-optimize/no-route',
        'no model route: this profile supplies no `ctx.agentDefaultModel` and the bundle row pins none',
        {},
      )
    }
    try {
      // The same call `prompt_tune` makes: one implementation, so the offline
      // suite covers this path too.
      const { prompt } = await runTune(this.ctx.llm, {
        provider: route.provider,
        model: route.model,
        draft: text,
        intent,
        maxTokens: 2048,
        timeoutMs: 120000,
        signal,
      })
      return prompt
    }
    catch (error) {
      if (error instanceof TuneCallError) {
        throw new RemoteError(`prompt-optimize/${error.code}`, error.message, {})
      }
      throw error
    }
  }
}

export default PromptOptimizeRemote

/**
 * Describe the live Remote binding for the plugin's receipt.
 *
 * The marker is installed by hand (see the module doc), so the protocol's own
 * reader is the only authority on whether it landed: `remoteMethods()` returns
 * exactly what the gateway will export. A receipt that reported a mounted
 * service while the marker was missing would be worse than no receipt.
 *
 * @param ctx Host context the service was mounted on.
 * @returns Receipt fields describing the service, its binding and its markers.
 */
export function describeRemote(ctx) {
  const instance = ctx.get?.(SERVICE_KEY)
  if (instance === undefined) {
    return { service: SERVICE_KEY, mounted: false }
  }
  const markers = remoteMethods(instance)
  return {
    service: SERVICE_KEY,
    mounted: true,
    namespace: instance.typertRemote?.namespace ?? null,
    boundTo: instance.typertRemote?.serviceKey ?? null,
    methods: markers.map(marker => `${marker.method}${marker.exportName === undefined ? '' : `→${marker.exportName}`}${marker.mode === 'stream' ? ':stream' : ':direct'}`),
  }
}
