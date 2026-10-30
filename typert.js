/**
 * The TYPERT host manifest.
 *
 * `typert-loader` resolves a package's `exports["./typert"]`, imports it and
 * registers the exported manifest; the gateway then exposes every described
 * invocation to the page as `ctx.remote.<namespace>.<method>`. The manifest must
 * be owned by the package that exports it (`package` must equal the package
 * name) and pass `validateTypertManifest`, whose requirements are:
 *
 * - `schemas`: an array (empty is fine — the field exists for the generated
 *   client stubs, which this hand-written package does not ship).
 * - `model`: `{ services, events, objects }`, each an array (all empty here:
 *   the model tree only feeds generated typings).
 * - `invocations`: one descriptor per Remote method. A strict codec needs only
 *   `{ mode: 'strict', typeSymbol }` — `decode`, `encode` and `create` are all
 *   optional, which is what lets this manifest stay free of zod.
 *
 * Keep this in step with `remote.js`: the `implementation` field must name the
 * method the service actually exposes.
 */

/** The package name, which the manifest must declare as its owner. */
const PACKAGE = '@local/dsh-prompt-optimize'

/** Wire namespace promised by `remote.js` (`SERVICE_KEY`). */
const NAMESPACE = 'promptOptimize'

/**
 * One strict codec with a pass-through schema.
 *
 * The loader *requires* `create()` on every codec, and the gateway really does
 * call it — `gateway/lib/index.js`: `value = codec.create().parse(value)` — but
 * the generated manifests build that schema with `zod`, which a `link:`-installed
 * bundle cannot resolve (measured). A plain object exposing `parse` satisfies
 * both: the loader only checks `typeof codec.create === 'function'`, and a
 * pass-through `parse` is honest for values this service already constrains
 * itself (strings, and the draft guard in `remote.js`). `encode` stays absent,
 * which the gateway treats as pass-through.
 */
const codec = typeSymbol => ({
  mode: 'strict',
  typeSymbol,
  create: () => ({ parse: value => value }),
})

export const TYPERT = {
  package: PACKAGE,
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: `${PACKAGE}#${NAMESPACE}/optimizeDraft`,
      service: NAMESPACE,
      namespace: NAMESPACE,
      method: 'optimizeDraft',
      implementation: 'optimizeDraft',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'draft', wire: 'draft', source: 'json', codec: codec(`${PACKAGE}#draft`) },
        { name: 'intent', wire: 'intent', source: 'json', codec: codec(`${PACKAGE}#intent`) },
      ],
      cancellation: { parameter: 'signal' },
      result: codec(`${PACKAGE}#optimizeDraft:result`),
    },
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
}

export default TYPERT
