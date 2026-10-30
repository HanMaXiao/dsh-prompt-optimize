/**
 * Section 8 of the migrated offline suite: the Client half — the ✨ button.
 *
 * A minimal browser module table plus a minimal React drive the real
 * `client.js`, which proves the registration shape and the click paths — the
 * parts a page refresh would otherwise be the only way to see. A real-React
 * render of the same component closes the gap: the mini harness does not
 * validate React semantics, while a real render catches problems that only show
 * up in a page (it caught the component binding an injected React
 * implementation once). Migrated from `check-optimize.mjs` section 8.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCKS } from '../lib/tune.js'

/** One migrated assertion; see `tune.test.js` for why the shape is kept. */
function check(label, ok, detail) {
  assert.ok(ok, `${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

// The bundle carries its own `node_modules` (pnpm install in the package dir), so
// Harness and React packages resolve from here exactly as they do at runtime.
const bundleRequire = createRequire(new URL('../package.json', import.meta.url))
/** Import a package the way the bundle itself resolves it. */
const fromBundle = specifier => import(pathToFileURL(bundleRequire.resolve(specifier)).href)

// `window` must exist before the module is imported: client.js reads
// `__ModuleLoader__` at module scope.
const loaded = []
globalThis.window = { __ModuleLoader__: { load: entry => { loaded.push(entry) } } }
await import('../client.js')

const draft = '把那个登录页改好看点，顺便把报错修了'

describe('8. Client half: the ✨ button, without a browser', () => {
  // Per-mount hook state: two mounted instances must not share it, or the
  // second mount's render would own the first one's state writes.
  let active
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false) }
    },
    useState(initial) {
      const record = active
      const index = record.cursor++
      if (record.hooks.length <= index) record.hooks[index] = initial
      return [record.hooks[index], value => {
        record.hooks[index] = typeof value === 'function' ? value(record.hooks[index]) : value
        record.render()
      }]
    },
  }
  const mount = (Component, props) => {
    const record = {
      hooks: [],
      cursor: 0,
      tree: undefined,
      render: () => {
        record.cursor = 0
        active = record
        record.tree = Component(props)
      },
    }
    record.render()
    return record
  }
  const find = (node, predicate) => {
    if (node === null || typeof node !== 'object') return undefined
    if (predicate(node)) return node
    for (const child of node.children ?? []) {
      const hit = find(child, predicate)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  const texts = node => (node === null || node === undefined
    ? []
    : [typeof node === 'string' ? node : '', ...(node.children ?? []).flatMap(texts)])
  const click = node => node.props.onClick()
  const buttonsOf = node => {
    const out = []
    const walk = current => {
      if (current?.type === 'button') out.push(current)
      for (const child of current?.children ?? []) walk(child)
    }
    walk(node)
    return out
  }

  /**
   * Mount the client half once per scenario; `apply` binds the Remote each time.
   *
   * `carrier: false` is a composition with no Remote at all. Otherwise the
   * stub has the gateway's real shape — `remote` carries `$mount`, and the
   * namespace it installs arrives as its own `remote.promptOptimize` service.
   * Hanging a `promptOptimize` property off the carrier instead is exactly the
   * mistake this bundle shipped with, so the harness must not model it.
   */
  const applyClient = async (options = {}, react = React) => {
    const registration = { options: undefined, component: undefined, plugin: undefined, mounts: [] }
    const dictionaries = new Map()
    const namespace = typeof options.optimizeDraft === 'function' ? { optimizeDraft: options.optimizeDraft } : undefined
    const carrier = options.carrier === false ? undefined : {
      async $mount(contribution) {
        registration.mounts.push(contribution)
        return async () => {}
      },
    }
    const fakeCtx = {
      effect: callback => { callback(); return () => {} },
      // The real client reads the optional Remote services through `ctx.get`,
      // because a service property read without a matching `inject` throws.
      get: name => {
        if (name === 'remote') return carrier
        if (name === 'remote.promptOptimize') return namespace
        return undefined
      },
      // Dictionary-aware on purpose: a bind that returned the raw key would let
      // a missing ZH entry pass every assertion below.
      locale: {
        register: (ns, dicts) => { dictionaries.set(ns, dicts); return () => {} },
        bind: ns => key => dictionaries.get(ns)?.zh?.[key] ?? key,
      },
      logger: { warn: () => {} },
      slots: {
        inject: (key, callback) => { registration.key = key; return callback() },
        register: (options, component) => { registration.options = options; registration.component = component; return () => {} },
      },
    }
    const plugin = loaded[0].factory(name => {
      if (name === 'react') return react
      throw new Error(`unexpected require(${name})`)
    })
    registration.plugin = plugin
    await plugin.apply(fakeCtx)
    return registration
  }

  const writes = []
  const props = {
    useInput: selector => selector({ draft }),
    inputActions: { setDraft: value => writes.push(value), focus: () => {} },
  }

  let registration
  let mounting
  let contribution
  let mounted, closed, empty, open, local, deep, broken, noReader
  let remoteRegistration, remoteWrites, remoteMounted, remoteButtons
  let failingWrites, failingMounted
  let markup, brokenMarkup, realRegistration

  it('the client half registers one module under the bundle name', () => {
    check('the client half registers one module under the bundle name',
      loaded.length === 1 && loaded[0].id === '@local/dsh-prompt-optimize', loaded[0]?.id)
  })

  it('declares the services it reads, so the fiber waits instead of throwing', async () => {
    registration = await applyClient({ carrier: false })
    check('declares the services it reads, so the fiber waits instead of throwing',
      Array.isArray(registration.plugin?.inject)
        && registration.plugin.inject.includes('slots') && registration.plugin.inject.includes('locale'),
      JSON.stringify(registration.plugin?.inject))
  })

  // The namespace exists only once something mounts the contribution: the
  // loader discovers `./typert` on the Host, and no first-party client assembly
  // mounts a third-party package's namespace for it.
  it('the entry mounts its own Remote contribution on the carrier', async () => {
    mounting = await applyClient({ optimizeDraft: async () => '' })
    ;[contribution] = mounting.mounts
    check('the entry mounts its own Remote contribution on the carrier',
      mounting.mounts.length === 1 && contribution?.package === '@local/dsh-prompt-optimize',
      `${mounting.mounts.length} mount(s)`)
  })

  it('the mounted descriptor matches the host manifest', () => {
    check('the mounted descriptor matches the host manifest',
      contribution?.descriptors?.length === 1
        && contribution.descriptors[0].method === 'optimizeDraft'
        && contribution.descriptors[0].namespace === 'promptOptimize'
        && contribution.descriptors[0].cancellation?.parameter === 'signal'
        && contribution.descriptors[0].parameters.map(p => p.wire).join(',') === 'draft,intent',
      JSON.stringify(contribution?.descriptors?.map(d => `${d.method}(${d.parameters.map(p => p.wire)})`)))
  })

  it('every mounted field carries a strict codec with a create() factory', () => {
    check('every mounted field carries a strict codec with a create() factory',
      contribution.descriptors.every(d => d.result.mode === 'strict'
        && typeof d.result.create === 'function'
        && d.parameters.every(p => p.codec.mode === 'strict' && typeof p.codec.create === 'function')))
  })

  it('registers into conversation.input.overlay', () => {
    check('registers into conversation.input.overlay',
      registration.key === 'conversation.input.overlay' && registration.options?.name === 'conversation.input.overlay', registration.key)
  })

  it('uses its own cell id at order 30 with a thunk label', () => {
    check('uses its own cell id at order 30 with a thunk label',
      registration.options?.id === 'prompt-tune-button' && registration.options?.order === 30
        && typeof registration.options?.label === 'function',
      `${registration.options?.id}@${registration.options?.order}`)
  })

  it('renders one trigger while closed', () => {
    mounted = mount(registration.component, props)
    closed = buttonsOf(mounted.tree)
    check('renders one trigger while closed', closed.length === 1, String(closed.length))
  })

  it('the trigger carries an accessible name', () => {
    check('the trigger carries an accessible name', typeof closed[0].props['aria-label'] === 'string')
  })

  it('the icon trigger carries the action as its accessible name', () => {
    check('the icon trigger carries the action as its accessible name',
      closed[0].props['aria-label'] === '优化提示词' && String(closed[0].props.title ?? '').length > 0,
      `${closed[0].props['aria-label']} / ${String(closed[0].props.title ?? '').slice(0, 24)}…`)
  })

  // An empty draft must not open the menu.
  it('an empty draft opens nothing', () => {
    empty = mount(registration.component, {
      useInput: selector => selector({ draft: '   ' }),
      inputActions: props.inputActions,
    })
    click(buttonsOf(empty.tree)[0])
    check('an empty draft opens nothing', buttonsOf(empty.tree).length === 1)
  })

  it('clicking opens a two-action panel', () => {
    click(closed[0])
    open = buttonsOf(mounted.tree)
    check('clicking opens a two-action panel', open.length === 3, String(open.length))
  })

  it('the panel reports how much of the standard the draft covers', () => {
    check('the panel reports how much of the standard the draft covers',
      texts(mounted.tree).join('').includes('七块覆盖'))
  })

  it('规范补全 writes the seven-block standard into the draft', () => {
    click(open[1])
    local = writes.at(-1) ?? ''
    check('规范补全 writes the seven-block standard into the draft',
      BLOCKS.every(block => local.includes(`## ${block.title}`)) && local.includes(draft), `${local.length} chars`)
  })

  it('规范补全 never invents a value, it asks for one', () => {
    check('规范补全 never invents a value, it asks for one', local.includes('⟨待确认：'))
  })

  it('an applied action closes the panel', () => {
    check('an applied action closes the panel', buttonsOf(mounted.tree).length === 1)
  })

  it('深度优化 hands the rewrite to the agent tool', async () => {
    click(buttonsOf(mounted.tree)[0])
    click(buttonsOf(mounted.tree)[2])
    // The click asks for the mount before it falls back, so the write lands a
    // microtask later even when there is nothing to mount.
    await new Promise(resolve => setTimeout(resolve, 0))
    deep = writes.at(-1) ?? ''
    check('深度优化 hands the rewrite to the agent tool',
      deep.includes('prompt_tune') && deep.includes(draft), deep.split('\n')[0])
  })

  // A slot without inputActions must say so, not throw.
  it('a slot without inputActions renders a diagnostic instead of throwing', () => {
    broken = mount(registration.component, { useInput: selector => selector({ draft }), inputActions: undefined })
    check('a slot without inputActions renders a diagnostic instead of throwing',
      texts(broken.tree).join('').includes('inputActions'))
  })

  it('a slot without useInput says so instead of showing a dead button', () => {
    noReader = mount(registration.component, { inputActions: props.inputActions })
    check('a slot without useInput says so instead of showing a dead button',
      texts(noReader.tree).join('').includes('useInput'))
  })

  it('two mounted buttons keep independent state', () => {
    check('two mounted buttons keep independent state', buttonsOf(empty.tree).length === 1 && buttonsOf(mounted.tree).length === 1)
  })

  // With a Remote, the deep action rewrites in place instead of writing an
  // instruction for the user to send. A mounted method answers with a
  // `RemoteResult` envelope, never by throwing a business failure.
  it('with a Remote the panel offers the in-place rewrite', async () => {
    remoteRegistration = await applyClient({
      optimizeDraft: async text => ({ ok: true, value: `已改写：${text}` }),
    })
    remoteWrites = []
    remoteMounted = mount(remoteRegistration.component, {
      useInput: selector => selector({ draft }),
      inputActions: { setDraft: value => remoteWrites.push(value), focus: () => {} },
    })
    click(buttonsOf(remoteMounted.tree)[0])
    check('with a Remote the panel offers the in-place rewrite',
      texts(remoteMounted.tree).join('').includes('原地改写'))
  })

  it('the Remote scenario still renders exactly two actions', () => {
    remoteButtons = buttonsOf(remoteMounted.tree)
    check('the Remote scenario still renders exactly two actions', remoteButtons.length === 3, String(remoteButtons.length))
  })

  it('the Remote answer replaces the draft in place', async () => {
    click(remoteButtons[2])
    await new Promise(resolve => setTimeout(resolve, 0))
    check('the Remote answer replaces the draft in place',
      remoteWrites.at(-1) === `已改写：${draft}`, String(remoteWrites.at(-1)).slice(0, 30))
  })

  it('the in-place path never falls back to the agent instruction', () => {
    check('the in-place path never falls back to the agent instruction',
      !String(remoteWrites.at(-1)).includes('prompt_tune'))
  })

  it('the in-place path closes the panel after applying', () => {
    check('the in-place path closes the panel after applying', buttonsOf(remoteMounted.tree).length === 1)
  })

  // A failing Remote must report, and must not touch the draft. The gateway
  // folds a Host rejection into the envelope's error branch rather than
  // throwing, so that is the shape under test.
  it('a failing Remote writes nothing and reports why', async () => {
    const failingRegistration = await applyClient({
      optimizeDraft: async () => ({ ok: false, error: new Error('boom') }),
    })
    failingWrites = []
    failingMounted = mount(failingRegistration.component, {
      useInput: selector => selector({ draft }),
      inputActions: { setDraft: value => failingWrites.push(value), focus: () => {} },
    })
    click(buttonsOf(failingMounted.tree)[0])
    click(buttonsOf(failingMounted.tree)[2])
    await new Promise(resolve => setTimeout(resolve, 0))
    check('a failing Remote writes nothing and reports why',
      failingWrites.length === 0 && texts(failingMounted.tree).join('').includes('boom'),
      `${failingWrites.length} write(s)`)
  })

  // A real-React render of the same component. The mini harness above proves
  // the behaviour; this proves the element tree is a legal React render with
  // real hooks and real props — the last thing checkable before a browser.
  // The module binds `h` at factory time, so it must be re-applied with the
  // real React rather than reusing the mini one.
  it('renders under real React, labelled and accessible', async () => {
    const RealReact = await fromBundle('react')
    const { renderToStaticMarkup } = await fromBundle('react-dom/server')
    realRegistration = await applyClient({ carrier: false }, RealReact)
    markup = renderToStaticMarkup(RealReact.createElement(realRegistration.component, props))
    check('renders under real React, labelled and accessible',
      markup.includes('优化提示词') && markup.includes('aria-label'), markup.slice(0, 110))
  })

  it('the missing-actions diagnostic also survives a real React render', async () => {
    const RealReact = await fromBundle('react')
    const { renderToStaticMarkup } = await fromBundle('react-dom/server')
    brokenMarkup = renderToStaticMarkup(RealReact.createElement(realRegistration.component, {
      useInput: selector => selector({ draft }),
      inputActions: undefined,
    }))
    check('the missing-actions diagnostic also survives a real React render',
      brokenMarkup.includes('inputActions'))
  })
})
