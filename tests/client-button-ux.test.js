/**
 * The ✨ button's hand-off: cancel, progress, preview, retry.
 *
 * Same technique as `client-button-harness.test.js` — a stub browser module
 * table plus a minimal React drive the real `client.js` — pointed at the paths
 * that file predates: the in-flight call with its abort wiring, the before/
 * after preview that gates the only `setDraft` the deep path performs, the
 * retry out of a failed attempt, and the no-Remote fallback that must stay
 * untouched by all of it.
 *
 * The Remote stub here is a plain function standing in for the mounted
 * namespace method, so the third argument it receives is exactly what the
 * manifest's `cancellation: { parameter: 'signal' }` promises the Host call.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/** One migrated assertion; the shape matches the harness file's own. */
function check(label, ok, detail) {
  assert.ok(ok, `${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

// `window` must exist before the module is imported: client.js reads
// `__ModuleLoader__` at module scope.
const loaded = []
globalThis.window = { __ModuleLoader__: { load: entry => { loaded.push(entry) } } }
await import('../client.js')

const draft = '把那个登录页改好看点，顺便把报错修了'
const rewrite = `已改写：${draft}`

/** Keys this change adds to both dictionaries. */
const NEW_KEYS = [
  'menu.deep.busy.hint',
  'menu.deep.cancel',
  'menu.deep.cancelled',
  'menu.deep.retry',
  'menu.preview.title',
  'menu.preview.before',
  'menu.preview.after',
  'menu.preview.delta',
  'menu.preview.confirm',
  'menu.preview.cancel',
  'menu.preview.kept',
]

// The package's single documented exception is the ✨ in the trigger; the
// dictionaries themselves stay free of glyphs.
const GLYPH = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u

describe('the ✨ hand-off: cancel, progress, preview, retry', () => {
  // Per-mount hook state, so two mounted instances never share their writes.
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
   * `carrier: false` is a composition with no Remote at all — the fallback
   * path. Otherwise the namespace arrives as its own `remote.promptOptimize`
   * service, exactly as the gateway installs it.
   */
  const applyClient = async (options = {}) => {
    const registration = { options: undefined, component: undefined, plugin: undefined, mounts: [], dictionaries: undefined }
    const namespace = typeof options.optimizeDraft === 'function' ? { optimizeDraft: options.optimizeDraft } : undefined
    const carrier = options.carrier === false ? undefined : {
      async $mount(contribution) {
        registration.mounts.push(contribution)
        return async () => {}
      },
    }
    const fakeCtx = {
      effect: callback => { callback(); return () => {} },
      get: name => {
        if (name === 'remote') return carrier
        if (name === 'remote.promptOptimize') return namespace
        return undefined
      },
      locale: {
        register: (ns, dicts) => { registration.dictionaries = { ns, dicts }; return () => {} },
        bind: ns => key => registration.dictionaries?.dicts?.zh?.[key] ?? key,
      },
      logger: { warn: () => {} },
      slots: {
        inject: (key, callback) => { registration.key = key; return callback() },
        register: (options, component) => { registration.options = options; registration.component = component; return () => {} },
      },
    }
    const plugin = loaded[0].factory(name => {
      if (name === 'react') return React
      throw new Error(`unexpected require(${name})`)
    })
    registration.plugin = plugin
    await plugin.apply(fakeCtx)
    return registration
  }

  /** One mounted button with a recording `setDraft`. */
  const mountedWith = async (optimizeDraft, writes = []) => {
    const registration = await applyClient({ optimizeDraft })
    const record = mount(registration.component, {
      useInput: selector => selector({ draft }),
      inputActions: { setDraft: value => writes.push(value), focus: () => {} },
    })
    click(buttonsOf(record.tree)[0])
    return { record, writes, buttons: () => buttonsOf(record.tree) }
  }

  /** Flush the microtasks a Remote answer settles in. */
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))

  it('both dictionaries gain the new keys with identical key sets', async () => {
    const registration = await applyClient({ carrier: false })
    const { ns, dicts } = registration.dictionaries
    const zh = Object.keys(dicts.zh).sort()
    const en = Object.keys(dicts.en).sort()
    check('both dictionaries gain the new keys with identical key sets',
      ns === 'prompt-optimize'
        && JSON.stringify(zh) === JSON.stringify(en)
        && NEW_KEYS.every(key => key in dicts.zh && key in dicts.en),
      `${zh.length} zh / ${en.length} en keys`)
  })

  it('the new copy carries no glyph beyond the trigger exception', async () => {
    const { dicts } = (await applyClient({ carrier: false })).dictionaries
    const glyphs = NEW_KEYS.filter(key => GLYPH.test(String(dicts.zh[key])) || GLYPH.test(String(dicts.en[key])))
    check('the new copy carries no glyph beyond the trigger exception', glyphs.length === 0, glyphs.join(','))
  })

  it('waiting shows its own copy and a cancel control, and writes nothing', async () => {
    let seen = undefined
    const { record, writes } = await mountedWith((text, intent, signal) => {
      seen = signal
      return new Promise(() => {})
    })
    click(buttonsOf(record.tree)[2])
    const tree = texts(record.tree).join('')
    check('waiting shows its own copy and a cancel control, and writes nothing',
      tree.includes('正在改写') && tree.includes('模型调用进行中')
        && buttonsOf(record.tree).length === 2 && writes.length === 0,
      `${buttonsOf(record.tree).length} button(s), ${writes.length} write(s)`)
    check('the cancel control reaches the Remote as an abort signal',
      seen !== undefined && typeof seen.aborted === 'boolean', String(seen))
  })

  it('the trigger does not drop the in-flight call', async () => {
    const { record } = await mountedWith(() => new Promise(() => {}))
    click(buttonsOf(record.tree)[2])
    click(buttonsOf(record.tree)[0])
    check('the trigger does not drop the in-flight call',
      buttonsOf(record.tree).length === 2 && texts(record.tree).join('').includes('正在改写'),
      String(buttonsOf(record.tree).length))
  })

  it('cancel aborts the call, returns to idle with a note, and leaves the draft', async () => {
    let seen = undefined
    const { record, writes, buttons } = await mountedWith((text, intent, signal) => {
      seen = signal
      return new Promise(() => {})
    })
    click(buttons()[2])
    click(buttons()[1])
    check('cancel aborts the call', seen?.aborted === true, String(seen?.aborted))
    check('cancel returns to idle with a note and leaves the draft',
      writes.length === 0 && buttons().length === 3
        && texts(record.tree).join('').includes('已取消，草稿没有改动'),
      `${buttons().length} button(s)`)
  })

  it('an answer that arrives after the cancel writes nothing', async () => {
    let release = () => {}
    const { record, writes, buttons } = await mountedWith(() => new Promise(resolve => {
      release = () => resolve({ ok: true, value: rewrite })
    }))
    click(buttons()[2])
    click(buttons()[1])
    release()
    await settle()
    check('an answer that arrives after the cancel writes nothing',
      writes.length === 0 && buttons().length === 3, `${writes.length} write(s)`)
  })

  it('a successful rewrite waits in a preview instead of replacing the draft', async () => {
    const { record, writes, buttons } = await mountedWith(async text => ({ ok: true, value: rewrite }))
    click(buttons()[2])
    await settle()
    const tree = texts(record.tree).join('')
    check('a successful rewrite waits in a preview instead of replacing the draft',
      writes.length === 0 && tree.includes('改写结果预览') && tree.includes(draft) && tree.includes(rewrite),
      `${writes.length} write(s)`)
    check('the preview reports the character delta', tree.includes('+4'), tree.match(/字符增量[^ ]*/)?.[0])
    check('the preview keeps the Ctrl+Z note', tree.includes('Ctrl+Z'))
  })

  it('confirming the preview is the only thing that replaces the draft', async () => {
    const { record, writes, buttons } = await mountedWith(async text => ({ ok: true, value: rewrite }))
    click(buttons()[2])
    await settle()
    const [confirm] = buttons().slice(1)
    click(confirm)
    check('confirming the preview is the only thing that replaces the draft',
      writes.length === 1 && writes[0] === rewrite, String(writes.at(-1)).slice(0, 30))
    check('the confirmation closes the panel', buttons().length === 1, String(buttons().length))
  })

  it('cancelling the preview keeps the original draft', async () => {
    const { record, writes, buttons } = await mountedWith(async text => ({ ok: true, value: rewrite }))
    click(buttons()[2])
    await settle()
    const cancel = buttons()[2]
    click(cancel)
    check('cancelling the preview keeps the original draft',
      writes.length === 0 && buttons().length === 3
        && texts(record.tree).join('').includes('已保留原稿'),
      `${buttons().length} button(s), ${writes.length} write(s)`)
  })

  it('a failed rewrite offers a retry that then reaches the preview', async () => {
    let attempt = 0
    const { record, writes, buttons } = await mountedWith(async (text, intent) => {
      attempt += 1
      return attempt === 1 ? { ok: false, error: new Error('boom') } : { ok: true, value: rewrite }
    })
    click(buttons()[2])
    await settle()
    check('the failure reports itself and leaves the draft alone',
      writes.length === 0 && texts(record.tree).join('').includes('boom'), `${writes.length} write(s)`)
    check('the failed panel offers the retry', texts(record.tree).join('').includes('重试'))
    // The deep item is now the retry: the same click runs the call again.
    click(buttons()[2])
    await settle()
    check('the retry runs the call again and waits in the preview',
      texts(record.tree).join('').includes('改写结果预览'), String(attempt))
    click(buttons()[1])
    check('the retried rewrite is confirmed like any other',
      writes.length === 1 && writes[0] === rewrite, String(writes.at(-1)).slice(0, 30))
  })

  it('the no-Remote fallback still writes the prompt_tune instruction', async () => {
    const registration = await applyClient({ carrier: false })
    const writes = []
    const record = mount(registration.component, {
      useInput: selector => selector({ draft }),
      inputActions: { setDraft: value => writes.push(value), focus: () => {} },
    })
    click(buttonsOf(record.tree)[0])
    click(buttonsOf(record.tree)[2])
    await settle()
    check('the no-Remote fallback still writes the prompt_tune instruction',
      writes.length === 1 && writes[0].includes('prompt_tune') && writes[0].includes(draft),
      String(writes.at(-1)).split('\n')[0])
  })

  it('the fallback path never opens a preview', async () => {
    const registration = await applyClient({ carrier: false })
    const writes = []
    const record = mount(registration.component, {
      useInput: selector => selector({ draft }),
      inputActions: { setDraft: value => writes.push(value), focus: () => {} },
    })
    click(buttonsOf(record.tree)[0])
    click(buttonsOf(record.tree)[2])
    await settle()
    check('the fallback path never opens a preview',
      buttonsOf(record.tree).length === 1 && !texts(record.tree).join('').includes('改写结果预览'),
      String(buttonsOf(record.tree).length))
  })
})
