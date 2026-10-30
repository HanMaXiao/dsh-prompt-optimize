/**
 * Sections 10–11 of the migrated offline suite: the Remote wiring and the real
 * Cordis activation.
 *
 * Both sections deliberately run against the **real** Harness packages, resolved
 * through this bundle's own `node_modules` the way the runtime resolves them —
 * which is the whole point of W1: no reliance on the profile's transitive
 * dependencies. Section 10 reads the hand-installed marker back through the real
 * protocol and validates the hand-written manifest with the real loader, plus a
 * negative control proving the validation is not a no-op. Section 11 runs the
 * client entry under the real Cordis, because the boot failure it guards can only
 * be produced by an actual activation.
 *
 * Migrated from `check-optimize.mjs` sections 10–11.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'

/** One migrated assertion; see `tune.test.js` for why the shape is kept. */
function check(label, ok, detail) {
  assert.ok(ok, `${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

// The bundle carries its own `node_modules` (pnpm install in the package dir), so
// both Harness packages resolve from here exactly as they do at runtime.
const bundleRequire = createRequire(new URL('../package.json', import.meta.url))
/** Import a Harness package the way the bundle itself resolves it. */
const fromBundle = specifier => import(pathToFileURL(bundleRequire.resolve(specifier)).href)

const remote = await import('../remote.js')
const { TYPERT } = await import('../typert.js')
const { remoteMethods } = await fromBundle('@deepseek-ai/dsh-typert-protocol')
// The manifest is validated with the loader the Host actually runs.
const { validateTypertManifest } = await fromBundle('@deepseek-ai/dsh-typert-loader')

describe('10. the Remote wiring, against the real protocol and loader', () => {
  let markers, manifestProblem = '', controlRejected = false, described, bindingOk = false, bindingDetail = 'skipped: cordis not reachable'

  before(async () => {
    // A bare class stands in for the service: the marker must land on its
    // prototype, which is all the gateway reads.
    class Fake {
      optimizeDraft() { return '' }
    }
    remote.installRemoteMarkers(new Fake())
    markers = remoteMethods(new Fake())

    try {
      validateTypertManifest('@local/dsh-prompt-optimize', TYPERT)
    }
    catch (error) {
      manifestProblem = String(error.message)
    }

    // Control: the same validation must reject a codec without a schema factory.
    const brokenCodec = {
      ...TYPERT,
      invocations: [{ ...TYPERT.invocations[0], result: { mode: 'strict', typeSymbol: 'x' } }],
    }
    controlRejected = false
    try {
      validateTypertManifest('@local/dsh-prompt-optimize', brokenCodec)
    }
    catch (error) {
      controlRejected = String(error.message).includes('create() factory')
    }

    described = remote.describeRemote({ get: key => (key === 'promptOptimize' ? new Fake() : undefined) })

    // The field the gateway's source-mode discovery reads, on a real service
    // instance from the real base class. Cordis is reachable only through the
    // protocol's own dependency, which is why it is resolved that way.
    try {
      const protocolRequire = createRequire(bundleRequire.resolve('@deepseek-ai/dsh-typert-protocol'))
      const { Context } = await import(pathToFileURL(protocolRequire.resolve('@deepseek-ai/cordis')).href)
      const service = new remote.PromptOptimizeRemote(new Context())
      bindingOk = service.typertRemote?.service === service
        && service.typertRemote?.serviceKey === 'promptOptimize'
        && service.typertRemote?.namespace === 'promptOptimize'
        && remoteMethods(service).length === 1
      bindingDetail = JSON.stringify({
        serviceKey: service.typertRemote?.serviceKey,
        namespace: service.typertRemote?.namespace,
        methods: remoteMethods(service).map(marker => marker.method),
      })
    }
    catch (error) {
      bindingOk = false
      bindingDetail = `failed: ${String(error.message ?? error)}`
    }
  })

  it('the Remote module exports the service, its key and its diagnostics', () => {
    check('the Remote module exports the service, its key and its diagnostics',
      typeof remote.PromptOptimizeRemote === 'function'
        && remote.SERVICE_KEY === 'promptOptimize'
        && typeof remote.describeRemote === 'function'
        && typeof remote.installRemoteMarkers === 'function')
  })

  it('the hand-installed marker is what the protocol reads back', () => {
    check('the hand-installed marker is what the protocol reads back',
      markers.length === 1 && markers[0].method === 'optimizeDraft'
        && markers[0].invocation.kind === 'direct' && markers[0].mode === undefined,
      JSON.stringify(markers))
  })

  it('the hand-written manifest passes the real loader validation', () => {
    check('the hand-written manifest passes the real loader validation', manifestProblem === '', manifestProblem.split('\n')[0])
  })

  it('the manifest check is not a no-op (a codec without create() is rejected)', () => {
    check('the manifest check is not a no-op (a codec without create() is rejected)', controlRejected)
  })

  // Drift guard: the manifest must describe exactly what the service publishes.
  it('every published method is declared in the manifest, and vice versa', () => {
    const declared = TYPERT.invocations.map(entry => `${entry.implementation}${entry.namespace === entry.service ? '' : '!'}@${entry.namespace}`)
    const published = markers.map(marker => `${marker.method}@${TYPERT.invocations.find(entry => entry.implementation === marker.method)?.namespace ?? '?'}`)
    check('every published method is declared in the manifest, and vice versa',
      declared.length === published.length && TYPERT.invocations.every(entry => markers.some(marker => marker.method === entry.implementation)),
      `${published.join(',')} vs ${TYPERT.invocations.map(entry => entry.implementation).join(',')}`)
  })

  it('every invocation declares its cancellation parameter as the signal', () => {
    check('every invocation declares its cancellation parameter as the signal',
      TYPERT.invocations.every(entry => entry.cancellation?.parameter === 'signal'))
  })

  it('the manifest is owned by this package and faces the host', () => {
    check('the manifest is owned by this package and faces the host',
      TYPERT.package === '@local/dsh-prompt-optimize' && TYPERT.face === 'host')
  })

  it('the receipt reads the binding back through the protocol', () => {
    check('the receipt reads the binding back through the protocol',
      described.mounted === true && described.namespace === null && described.methods.length === 1,
      JSON.stringify(described))
  })

  it('an unmounted service is reported as such, not as a throw', () => {
    check('an unmounted service is reported as such, not as a throw',
      remote.describeRemote({ get: () => undefined }).mounted === false)
  })

  it('a real service instance exposes the binding the gateway discovers', () => {
    check('a real service instance exposes the binding the gateway discovers', bindingOk, bindingDetail)
  })
})

// Reached through the protocol's own dependency, the way section 10 does, so no
// absolute Harness path is baked in.
let RealContext
try {
  const protocolRequire = createRequire(bundleRequire.resolve('@deepseek-ai/dsh-typert-protocol'))
  ;({ Context: RealContext } = await import(pathToFileURL(protocolRequire.resolve('@deepseek-ai/cordis')).href))
}
catch { /* reported as a skip below */ }

if (RealContext === undefined) {
  describe('11. the real Cordis activation (the path that failed at boot)', () => {
    it('the client entry activates under the real Cordis (skipped: cordis not reachable)', () => {
      check('the client entry activates under the real Cordis (skipped: cordis not reachable)', true, 'skipped')
    })
  })
}
else {
  describe('11. the real Cordis activation (the path that failed at boot)', () => {
    // The regression this guards, in its on-screen wording:
    //   "web boot: 1 entry did not activate — @local/dsh-prompt-optimize: failed"
    // Cordis throws on a service property read whose name the plugin did not
    // declare in `inject`; the throw lands the fiber in FAILED and the page's
    // boot audit then refuses to start. Static checking cannot see that — only
    // running the activation can, which is why this section exists.

    // The bundled lib inlines `FiberState` away and exports no enum, so the
    // number comes from vendor/cordis/src/fiber.ts: ACTIVE = 2.
    const ACTIVE = 2

    let declared, declaredError, undeclared, undeclaredError
    before(async () => {
      // Capture the module the way the browser module table does.
      let captured
      globalThis.window = { __ModuleLoader__: { load: entry => { captured = entry } } }
      new Function(readFileSync(new URL('../client.js', import.meta.url), 'utf8'))()

      /** Activate one plugin object against a composition providing the three services. */
      const activate = plugin => {
        const seen = {}
        const root = new RealContext()
        root.plugin({
          name: 'web-composition-stub',
          apply(scope) {
            scope.provide('slots', {
              inject(key, callback) { seen.slotName = key; return callback() },
              register(options) { seen.cell = options; return () => {} },
            })
            scope.provide('locale', {
              register(ns, dictionaries) { seen.dictionary = `${ns}:${Object.keys(dictionaries).join(',')}`; return () => {} },
              bind: ns => key => `${ns}:${key}`,
            })
            scope.provide('remote', {
              async $mount(contribution) {
                seen.contribution = `${contribution.package}:${contribution.descriptors.map(d => d.method).join(',')}`
                return async () => {}
              },
            })
            scope.provide('remote.promptOptimize', { optimizeDraft: async text => ({ ok: true, value: text }) })
          },
        })
        const fiber = root.plugin(plugin)
        // `await()` rethrows the startup error, so this is the boot failure verbatim.
        // On success it gives the fiber one more turn: an `apply` that awaits its
        // own Remote mount is still settling when the startup error is known, and
        // only reaches ACTIVE on the next turn.
        const settled = fiber.await()
          .then(() => new Promise(resolve => setTimeout(resolve, 0)))
          .then(() => '', error => String(error?.message ?? error))
        return { seen, fiber, settled }
      }

      const client = captured.factory(name => {
        if (name === 'react') return { createElement: () => null, useState: value => [value, () => {}] }
        throw new Error(`unexpected require(${name})`)
      })
      declared = activate(client)
      declaredError = await declared.settled
      // Control: the same activation without the declaration is the original boot
      // failure's exact shape, so this section can never quietly go vacuous.
      undeclared = activate({ ...client, inject: [] })
      undeclaredError = await undeclared.settled
    })

    it('the client entry activates under the real Cordis', () => {
      check('the client entry activates under the real Cordis',
        declared.fiber.state === ACTIVE && declaredError === '',
        `state ${declared.fiber.state}${declaredError === '' ? '' : ` — ${declaredError}`}`)
    })

    it('the activation reached the slot registry, the cell and the dictionaries', () => {
      check('the activation reached the slot registry, the cell and the dictionaries',
        declared.seen.slotName === 'conversation.input.overlay'
          && declared.seen.cell?.id === 'prompt-tune-button'
          && declared.seen.cell?.label() === 'prompt-optimize:button.label'
          && declared.seen.dictionary === 'prompt-optimize:zh,en',
        `${declared.seen.slotName} / ${declared.seen.cell?.id} / ${declared.seen.dictionary}`)
    })

    // The namespace arrives only if the entry mounted its own contribution on
    // the carrier; activation alone would leave the button permanently in its
    // fallback path with nothing to show for it.
    it('activation mounted the Remote contribution on the real carrier', () => {
      check('activation mounted the Remote contribution on the real carrier',
        declared.seen.contribution === '@local/dsh-prompt-optimize:optimizeDraft',
        String(declared.seen.contribution))
    })

    it('the check is not a no-op (undeclared service reads fail the fiber)', () => {
      check('the check is not a no-op (undeclared service reads fail the fiber)',
        undeclared.fiber.state !== ACTIVE && undeclaredError.includes('without inject'),
        `state ${undeclared.fiber.state} — ${undeclaredError}`)
    })
  })
}
