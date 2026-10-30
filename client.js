/**
 * Prompt Optimize — Client half.
 *
 * One registration: the ✨ button in the composer card's top-right corner,
 * contributed to `conversation.input.overlay` ("Floating entries rendered
 * inside the resident composer card"), which is the same seat the shipped `/`
 * command popup and the feedback dialog use.
 *
 * That seat matters because the session-scope slot kit hands every entry the
 * standard session props — `useInput` (a selector hook over the input state)
 * and `inputActions` (`setDraft`, `insertText`, `submit`). So the button can
 * read the user's draft and write the improved prompt straight back into the
 * input box, which is what the Trae button does. No remote, no session, no
 * model call for the structural pass: it runs here, instantly.
 *
 * The deep rewrite hands off explicitly instead of writing blind: the call is
 * cancelable while it is in flight, and its answer lands in a before/after
 * preview that only calls `setDraft` once the user confirms it.
 *
 * The deep rewrite deliberately stays on the Host (`prompt_tune`): this half
 * inserts the ready-to-send request instead of pretending to own a model route.
 * Where the Host half has mounted, it is reached through a Typert Remote whose
 * namespace this half mounts for itself and reads as `ctx.get('remote.promptOptimize')`.
 *
 * Styles use only `--dsw-alias-*` theme tokens. No Harness Client package is
 * imported: React comes from the browser module table.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-prompt-optimize',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState } = React

    /** Bound by `apply` once the locale namespace is registered. */
    let translate = () => ''
    const NS = 'prompt-optimize'

    /** This package's own manifest identity; `typert.js` declares the same one. */
    const PACKAGE = '@local/dsh-prompt-optimize'

    /** Wire namespace promised by `remote.js` (`SERVICE_KEY`). */
    const NAMESPACE = 'promptOptimize'

    /** Cordis service key of the gateway's client carrier. */
    const REMOTE_KEY = 'remote'

    /** Cordis service key the gateway gives the namespace it mounts. */
    const NAMESPACE_KEY = `${REMOTE_KEY}.${NAMESPACE}`

    /**
     * A strict codec with a pass-through schema — the same zero-zod shape
     * `typert.js` publishes. The registry and the gateway both require
     * `mode: 'strict'` plus a `create()` factory and nothing more.
     *
     * @param typeSymbol Stable identity of the described value.
     * @returns A strict codec.
     */
    const codec = typeSymbol => ({
      mode: 'strict',
      typeSymbol,
      create: () => ({ parse: value => value }),
    })

    /**
     * The Host-for-Client contribution this file mounts for itself.
     *
     * `dsh-typert-loader` discovers a package's `./typert` export on the **Host**
     * only, and the client-side mounts shipped in the base are the generated
     * first-party ones inside `@deepseek-ai/dsh-api-remotes`. Nothing mounts a
     * third-party package's namespace for it, so a hand-written bundle calls
     * `ctx.remote.$mount()` itself — the technique
     * `@deepseek-ai/dsh-experimental-client-ui-voice-input` uses for `speech`.
     * Without this the namespace service is never created and the deep action
     * silently falls back forever.
     *
     * The roster is spelled out here rather than imported because the browser
     * module table serves one entry per package and cannot reach `./typert`;
     * the offline self-test (`check-optimize.mjs`) holds it to the manifest.
     */
    const CONTRIBUTION = {
      package: PACKAGE,
      descriptors: [
        {
          id: `${PACKAGE}#${NAMESPACE}/optimizeDraft`,
          service: NAMESPACE,
          namespace: NAMESPACE,
          method: 'optimizeDraft',
          implementation: 'optimizeDraft',
          invocation: { kind: 'direct' },
          parameters: ['draft', 'intent'].map(name => ({
            name,
            wire: name,
            source: 'json',
            codec: codec(`${PACKAGE}#${NAMESPACE}/${name}`),
          })),
          cancellation: { parameter: 'signal' },
          result: codec(`${PACKAGE}#optimizeDraft:result`),
        },
      ],
    }

    /**
     * The `promptOptimize` namespace service, re-read at call time.
     *
     * The gateway does not hang namespaces off the `remote` carrier: `$mount()`
     * installs each one as its own traced Cordis service under
     * `remote.<namespace>` (`dsh-api-gateway/src/client/index.ts`,
     * `remoteServiceKey`). So the namespace is `ctx.get('remote.promptOptimize')`,
     * never a property of `ctx.get('remote')` — that carrier only ever carries
     * `$mount`, `$stream`, `$host` and `$on`.
     */
    let readNamespace = () => undefined

    /** Mounts the contribution if it is not mounted yet; rebound by `apply`. */
    let ensureRemote = async () => {}

    /** The contribution `apply` disposes, or `null` while it was never mounted. */
    let disposeRemote = null

    /** The in-flight mount, so two callers join one attempt instead of racing it. */
    let mounting = null

    const ZH = {
      'button.label': '优化提示词',
      'button.empty': '先写点东西，再来优化',
      'button.noInput': '提示词优化：此插槽没有注入 useInput，读不到输入框内容',
      'menu.local': '规范补全（本地·即时）',
      'menu.local.hint': '按七块标准把缺失的部分补成待确认项，直接替换输入框内容',
      'menu.deep': '深度优化（原地改写）',
      'menu.deep.hint': '一次模型调用改写用词与逻辑，结果直接落回输入框，不用再按回车',
      'menu.deep.busy': '正在改写…',
      'menu.deep.busy.hint': '模型调用进行中，可随时取消',
      'menu.deep.cancel': '取消',
      'menu.deep.cancelled': '已取消，草稿没有改动',
      'menu.deep.retry': '重试',
      'menu.deep.failed': '改写失败：',
      'menu.deep.fallback': '深度优化（交给 Agent）',
      'menu.deep.fallback.hint': '这个组合里没有 Remote，改为把 prompt_tune 指令写进输入框，由会话模型改写',
      'menu.coverage': '七块覆盖',
      'menu.undo': '替换后可 Ctrl+Z 撤回',
      'menu.preview.title': '改写结果预览',
      'menu.preview.before': '原稿',
      'menu.preview.after': '改写后',
      'menu.preview.delta': '字符增量',
      'menu.preview.confirm': '替换输入框',
      'menu.preview.cancel': '保留原稿',
      'menu.preview.kept': '已保留原稿，输入框没有改动',
      'broken': '提示词优化：此插槽没有注入 inputActions，按钮无法写回输入框',
    }
    const EN = {
      'button.label': 'Optimize prompt',
      'button.empty': 'Write something first',
      'button.noInput': 'Prompt Optimize: this slot injected no useInput, so the draft cannot be read',
      'menu.local': 'Complete the structure (local, instant)',
      'menu.local.hint': 'Fill the missing blocks of the seven-block standard as explicit to-confirm items, replacing the input',
      'menu.deep': 'Deep rewrite (in place)',
      'menu.deep.hint': 'One model call rewrites wording and logic, and the result goes straight back into the input — no Enter needed',
      'menu.deep.busy': 'Rewriting…',
      'menu.deep.busy.hint': 'The model call is running; cancel any time',
      'menu.deep.cancel': 'Cancel',
      'menu.deep.cancelled': 'Cancelled; the draft is untouched',
      'menu.deep.retry': 'Retry',
      'menu.deep.failed': 'Rewrite failed: ',
      'menu.deep.fallback': 'Deep rewrite (hand to the agent)',
      'menu.deep.fallback.hint': 'No Remote in this composition: the prompt_tune instruction goes into the input instead',
      'menu.coverage': 'Blocks covered',
      'menu.undo': 'Ctrl+Z undoes the replacement',
      'menu.preview.title': 'Rewrite preview',
      'menu.preview.before': 'Original',
      'menu.preview.after': 'Rewrite',
      'menu.preview.delta': 'Character delta',
      'menu.preview.confirm': 'Replace the input',
      'menu.preview.cancel': 'Keep the original',
      'menu.preview.kept': 'Original kept; the input is unchanged',
      'broken': 'Prompt Optimize: this slot injected no inputActions, so the button cannot write back',
    }

    /**
     * The seven blocks, with the words that betray them.
     *
     * A deliberately small mirror of `lib/tune.js`: the client cannot import a
     * sibling module from the browser table, and the button only needs coverage
     * counting and a structural fill — the scoring, diagnosis and the model
     * pass live on the Host.
     */
    const BLOCKS = [
      { title: '角色', match: /你是|作为|扮演|我是一名|负责|act as|you are/i },
      { title: '目标', match: /目标|想要|目的是|实现|完成|拿到|产出|goal|objective/i },
      { title: '上下文与数据源', match: /背景|上下文|现状|技术栈|项目|代码库|仓库|文件|目录|路径|context|repo/i },
      { title: '交付物', match: /交付|输出到|产出|生成到|写到|保存到|新建|deliverable|output/i },
      { title: '硬性约束', match: /不要|不准|禁止|必须|只能|不得|限制|约束|避免|别|must|never|do not|avoid|only/i },
      { title: '验收标准', match: /验收|通过|测试|跑通|自测|标准|判据|acceptance|criteria|test passes|verified/i },
      { title: '输出格式', match: /格式|表格|列表|markdown|json|字数|不超过|分点|format|bullet/i },
    ]

    /** Which blocks the draft already carries. */
    function coverage(draft) {
      return BLOCKS.filter(block => block.match.test(draft)).map(block => block.title)
    }

    /**
     * Structural fill: keep the draft as the goal, name every missing block.
     *
     * This is the structural pass only. It never invents a path or a number —
     * a missing value becomes an explicit `⟨待确认：…⟩` the user must resolve,
     * which is the whole point of showing it.
     */
    function structure(draft) {
      const body = String(draft ?? '').trim()
      const has = new Set(coverage(body))
      const pending = what => `⟨待确认：${what}⟩`
      return [
        '## 角色',
        has.has('角色') ? '按已经写明的身份执行。' : '你是这项任务的执行者。⟨待确认：身份 / 专长 / 立场⟩',
        '',
        '## 目标',
        body === '' ? pending('要拿到什么结果') : body,
        '',
        '## 上下文与数据源',
        has.has('上下文与数据源')
          ? '按点名的文件与来源读取事实；路径逐个确认存在后再用。'
          : `先定位相关文件与现有约定再动手。${pending('真实路径 / 技术栈 / 现状')}`,
        '',
        '## 交付物',
        has.has('交付物') ? '按写明的形态与位置交付。' : pending('交出什么、什么形态、放在哪个路径'),
        '',
        '## 硬性约束',
        '- 不确定的信息先问，不要猜；路径必须真实存在。',
        '- 只改这项任务需要的部分，不顺手重构无关代码。',
        '- 已有的具体信息（路径、名字、数字、约束）一个都不能丢。',
        '',
        '## 验收标准',
        has.has('验收标准') ? '按写明的判据验收。' : `一条可判定的判据：${pending('跑什么命令、看什么输出算通过')}`,
        '',
        '## 输出格式',
        has.has('输出格式') ? '按写明的格式回答。' : '先给结论或产出，再给关键取舍，最多 3 行，不贴全文。',
        '',
        '**现在从「上下文与数据源」那一块开始：先读事实，再动手。**',
      ].join('\n')
    }

    /** The ready-to-send request that hands the deep rewrite to the Host tool. */
    function deepRequest(draft) {
      return [
        '请用 prompt_tune 把下面这段草稿改写成专业、规范、可直接执行的提示词，',
        '只把改写后的正文给我，不要解释：',
        '',
        String(draft ?? '').trim(),
      ].join('\n')
    }

    // Placement, verified against the owner's own CSS rather than guessed:
    // `conversation.input.overlay`'s anchor is `position: absolute; inset: 0 0
    // auto; height: 0` inside `.card`, which is `position: relative` and sets no
    // `overflow`, so an entry can sit inside the card's top-right corner (where
    // the Trae screenshot puts its ✨) and still open a panel that extends past
    // the card without being clipped. Shipped entries instead anchor *above* the
    // card with `bottom: 100%`; this one is the in-card case.
    const S = {
      wrap: { position: 'absolute', top: '6px', right: '8px', zIndex: 2 },
      button: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '26px', height: '26px', padding: 0, borderRadius: '13px',
        border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.35))',
        background: 'transparent', color: 'var(--dsw-alias-text-secondary, inherit)',
        cursor: 'pointer', fontSize: '13px', lineHeight: 1,
      },
      buttonDisabled: { opacity: 0.45, cursor: 'default' },
      panel: {
        position: 'absolute', top: '30px', right: 0, width: '302px',
        maxWidth: 'calc(100vw - 32px)', padding: '6px', borderRadius: '10px',
        border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.35))',
        background: 'var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-primary, #1c1c1c))',
        boxShadow: '0 8px 24px rgba(0,0,0,.28)', textAlign: 'left',
      },
      item: {
        display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px',
        borderRadius: '7px', border: 'none', background: 'transparent',
        color: 'var(--dsw-alias-text-primary, inherit)', cursor: 'pointer',
        fontSize: '12.5px', lineHeight: '1.45',
      },
      hint: { display: 'block', marginTop: '2px', color: 'var(--dsw-alias-text-tertiary, rgba(127,127,127,.9))', fontSize: '11.5px' },
      foot: { padding: '5px 8px 3px', color: 'var(--dsw-alias-text-tertiary, rgba(127,127,127,.9))', fontSize: '11px' },
      note: { color: 'var(--dsw-alias-text-tertiary, inherit)', fontSize: '12px' },
      // The in-flight phase: a status line plus the one control that matters.
      status: { padding: '7px 8px 0', color: 'var(--dsw-alias-text-primary, inherit)', fontSize: '12.5px', lineHeight: '1.45' },
      // The preview phase: two scroll-capped blocks, the delta, then the pair
      // of controls that decide whether the rewrite ever reaches the input.
      title: { padding: '3px 8px 5px', color: 'var(--dsw-alias-text-primary, inherit)', fontSize: '12.5px', fontWeight: 600 },
      block: {
        margin: '0 8px 6px', padding: '6px 8px', borderRadius: '7px',
        border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.35))',
      },
      blockLabel: { display: 'block', color: 'var(--dsw-alias-text-tertiary, rgba(127,127,127,.9))', fontSize: '11px' },
      blockText: {
        marginTop: '3px', maxHeight: '108px', overflow: 'auto',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        color: 'var(--dsw-alias-text-primary, inherit)', fontSize: '12px', lineHeight: '1.45',
      },
      row: { display: 'flex', gap: '6px', padding: '2px 8px 4px' },
      action: {
        flex: 1, padding: '7px 8px', borderRadius: '7px',
        border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.35))',
        background: 'transparent', color: 'var(--dsw-alias-text-primary, inherit)',
        cursor: 'pointer', fontSize: '12.5px', lineHeight: '1.45', textAlign: 'center',
      },
      actionPrimary: { border: '1px solid var(--dsw-alias-text-tertiary, rgba(127,127,127,.9))' },
    }

    /**
     * The ✨ button.
     *
     * Hooks are called before any early return, and `useInput` falls back to a
     * constant reader so the call order never depends on which props arrived.
     *
     * The deep action is a four-phase state machine, and the phase decides what
     * the panel shows: `idle` is the two-action menu, `busy` is the in-flight
     * call with its cancel control, `preview` is the before/after comparison
     * that waits for an explicit confirmation, and `failed` reports the error
     * and offers a retry. Only two paths ever write the draft: the structural
     * fill and the agent-tool fallback, which replace it outright, and the
     * preview's confirmation. A cancelled call, a cancelled preview and a
     * failed call all leave the input exactly as the user typed it.
     */
    function PromptTuneButton(props) {
      const [open, setOpen] = useState(false)
      const [phase, setPhase] = useState('idle')
      const [problem, setProblem] = useState('')
      /** A transient line in the footer: why the last deep attempt ended early. */
      const [note, setNote] = useState('')
      /** `{ before, after }` while the rewrite waits for its confirmation. */
      const [preview, setPreview] = useState(null)
      /** The AbortController of the in-flight call, or `null`. */
      const [controller, setController] = useState(null)
      const useInput = typeof props.useInput === 'function' ? props.useInput : () => undefined
      const draft = useInput(state => (state === undefined ? undefined : state.draft))
      const actions = props.inputActions

      if (typeof actions?.setDraft !== 'function') {
        return h('span', { style: S.note }, translate('broken'))
      }
      // A missing reader is a different failure from an empty draft: say so,
      // instead of showing a button that can never enable.
      if (typeof props.useInput !== 'function') {
        return h('span', { style: S.note }, translate('button.noInput'))
      }

      const text = typeof draft === 'string' ? draft : ''
      const hasText = text.trim() !== ''
      const covered = hasText ? coverage(text) : []
      const canRewrite = typeof readNamespace()?.optimizeDraft === 'function'

      const replaceDraft = replacement => {
        actions.setDraft(replacement)
        setOpen(false)
        setPhase('idle')
        setProblem('')
        setNote('')
        setPreview(null)
        if (typeof actions.focus === 'function') actions.focus()
      }

      /**
       * The Remote call, with the agent-tool path as the fallback.
       *
       * A composition without the Host Remote (or one where the contribution
       * was refused) must still do something useful, so it falls back to
       * writing the `prompt_tune` instruction into the input for the user to
       * send. The mount is requested first even when the namespace is absent:
       * it can still arrive, and asking costs one no-op when it already did.
       *
       * With a Remote the answer never reaches the input on its own: it stops
       * in `preview` until the user confirms it.
       */
      const runDeep = async () => {
        // Re-read at click time: the namespace service may only arrive after
        // this button first rendered, and it is gone again when its carrier
        // unloads.
        let namespace = readNamespace()
        if (typeof namespace?.optimizeDraft !== 'function') {
          try {
            await ensureRemote()
          }
          catch {
            // A refused contribution is not an error here: the agent-tool path
            // is the designed fallback, and the panel still does something.
          }
          namespace = readNamespace()
        }
        const call = typeof namespace?.optimizeDraft === 'function'
          ? namespace.optimizeDraft
          : undefined
        if (call === undefined) {
          replaceDraft(deepRequest(text))
          return
        }
        // One controller per attempt. The manifest declares the third
        // parameter as the cancellation signal (`typert.js`), so aborting here
        // reaches the Host call itself instead of only hiding the panel.
        const attempt = new AbortController()
        setController(attempt)
        setPreview(null)
        setNote('')
        setProblem('')
        setPhase('busy')
        try {
          // A mounted method answers with a `RemoteResult` envelope and never
          // throws a business failure: carrier loss, cancellation and every Host
          // `RemoteError` arrive as `{ ok: false, error }`.
          const result = await call(text, undefined, attempt.signal)
          // An attempt the user already cancelled must not resurrect itself as
          // a preview: `cancelDeep` has already returned the panel to idle.
          if (attempt.signal.aborted) return
          if (result === null || typeof result !== 'object' || result.ok !== true) {
            throw result?.error ?? new Error('the Remote returned no result')
          }
          const answer = result.value
          const prompt = typeof answer === 'string'
            ? answer
            : (typeof answer?.value === 'string' ? answer.value : undefined)
          if (prompt === undefined || prompt.trim() === '') throw new Error('the Remote returned no text')
          setPreview({ before: text, after: prompt })
          setPhase('preview')
        }
        catch (error) {
          // Cancellation is not a failure: it ends the attempt, not the draft.
          if (attempt.signal.aborted) return
          setPhase('failed')
          setProblem(error instanceof Error ? error.message : String(error))
        }
        finally {
          setController(current => (current === attempt ? null : current))
        }
      }

      /**
       * Abandon the in-flight rewrite.
       *
       * The draft is never touched — the only thing that ends here is the call,
       * and the note in the footer says so.
       */
      const cancelDeep = () => {
        controller?.abort()
        setController(null)
        setPreview(null)
        setProblem('')
        setPhase('idle')
        setNote(translate('menu.deep.cancelled'))
      }

      /** The one write the deep path performs: the user confirmed the rewrite. */
      const confirmPreview = () => {
        if (preview === null) return
        replaceDraft(preview.after)
      }

      /** Decline the rewrite; the draft keeps exactly what the user typed. */
      const cancelPreview = () => {
        setPreview(null)
        setPhase('idle')
        setNote(translate('menu.preview.kept'))
      }

      const busy = phase === 'busy'
      const trigger = h('button', {
        type: 'button',
        style: hasText && !busy ? S.button : { ...S.button, ...S.buttonDisabled },
        // Icon-only, like the reference button: the label lives in the
        // accessible name and the tooltip, and the panel spells the actions out.
        // A wide labelled button would cover more of the first text line it
        // necessarily sits on, since nothing reserves that corner for it.
        title: hasText ? translate('menu.deep.hint') : translate('button.empty'),
        'aria-label': translate('button.label'),
        // The trigger stays put while the call is in flight: the cancel control
        // lives in the panel, and a stray toggle must not drop it.
        onClick: () => { if (hasText && !busy) { setNote(''); setOpen(value => !value) } },
      }, busy ? '✳' : '✨')

      if (!open) return h('div', { style: S.wrap }, trigger)

      // In flight: what is happening, and the one control that ends it.
      if (busy) {
        return h('div', { style: S.wrap }, [
          trigger,
          h('div', { key: 'panel', style: S.panel }, [
            h('div', { key: 'status', style: S.status }, translate('menu.deep.busy')),
            h('span', { key: 'hint', style: S.hint }, translate('menu.deep.busy.hint')),
            h('button', {
              key: 'cancel',
              type: 'button',
              style: S.item,
              onClick: cancelDeep,
            }, translate('menu.deep.cancel')),
          ]),
        ])
      }

      // Back from the model and still unwritten: compare, then decide.
      if (phase === 'preview' && preview !== null) {
        const delta = preview.after.length - preview.before.length
        const signed = delta > 0 ? `+${delta}` : String(delta)
        return h('div', { style: S.wrap }, [
          trigger,
          h('div', { key: 'panel', style: S.panel }, [
            h('div', { key: 'title', style: S.title }, translate('menu.preview.title')),
            h('div', { key: 'before', style: S.block }, [
              h('span', { key: 'label', style: S.blockLabel }, translate('menu.preview.before')),
              h('div', { key: 'text', style: S.blockText }, preview.before),
            ]),
            h('div', { key: 'after', style: S.block }, [
              h('span', { key: 'label', style: S.blockLabel }, translate('menu.preview.after')),
              h('div', { key: 'text', style: S.blockText }, preview.after),
            ]),
            h('div', { key: 'delta', style: S.hint }, `${translate('menu.preview.delta')}: ${signed}`),
            h('div', { key: 'row', style: S.row }, [
              h('button', {
                key: 'confirm',
                type: 'button',
                style: { ...S.action, ...S.actionPrimary },
                onClick: confirmPreview,
              }, translate('menu.preview.confirm')),
              h('button', {
                key: 'cancel',
                type: 'button',
                style: S.action,
                onClick: cancelPreview,
              }, translate('menu.preview.cancel')),
            ]),
            // The undo affordance survives the confirmation step: replacing the
            // draft is still one Ctrl+Z away from being undone.
            h('div', { key: 'foot', style: S.foot }, translate('menu.undo')),
          ]),
        ])
      }

      // A failed attempt reports itself and offers the same action again; the
      // deep item becomes the retry, and the footer keeps the error line.
      const deepLabel = phase === 'failed'
        ? translate('menu.deep.retry')
        : (canRewrite ? translate('menu.deep') : translate('menu.deep.fallback'))
      const deepHint = canRewrite ? translate('menu.deep.hint') : translate('menu.deep.fallback.hint')
      const coverageLine = `${translate('menu.coverage')}: ${covered.length}/${BLOCKS.length}${covered.length === 0 ? '' : ` · ${covered.join('、')}`}`
      const footer = phase === 'failed'
        ? `${translate('menu.deep.failed')}${problem}`
        : (note === '' ? `${coverageLine} · ${translate('menu.undo')}` : `${note} · ${coverageLine}`)

      return h('div', { style: S.wrap }, [
        trigger,
        h('div', { key: 'panel', style: S.panel }, [
          h('button', {
            key: 'local',
            type: 'button',
            style: S.item,
            onClick: () => replaceDraft(structure(text)),
          }, [
            translate('menu.local'),
            h('span', { key: 'h', style: S.hint }, translate('menu.local.hint')),
          ]),
          h('button', {
            key: 'deep',
            type: 'button',
            style: S.item,
            onClick: () => { if (!busy) void runDeep() },
          }, [
            deepLabel,
            h('span', { key: 'h', style: S.hint }, deepHint),
          ]),
          h('div', { key: 'foot', style: S.foot }, footer),
        ]),
      ])
    }

    /**
     * Mount the Client half.
     *
     * The Remote contribution is mounted here and awaited before the seat is
     * registered, so the button's first render already knows whether the deep
     * action can rewrite in place. A refused mount is not fatal: this half's
     * designed fallback is the agent-tool path, not a broken button.
     *
     * @param ctx Client context carrying the injected `slots` and `locale` services.
     * @returns A disposer withdrawing the Remote contribution with the entry.
     */
    async function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'prompt-optimize: dictionaries')
      translate = ctx.locale.bind(NS)
      // Optional by design: without the namespace the deep action hands the
      // rewrite to the agent tool instead. Read through `ctx.get`, never as a
      // property — Cordis throws on a service property read the plugin did not
      // declare in `inject`, and declaring it would leave the entry pending
      // forever in a composition without the Remote carrier.
      readNamespace = () => ctx.get(NAMESPACE_KEY)
      ensureRemote = async () => {
        if (disposeRemote !== null) return
        const remote = ctx.get(REMOTE_KEY)
        if (typeof remote?.$mount !== 'function') return
        mounting ??= remote.$mount(CONTRIBUTION).finally(() => { mounting = null })
        disposeRemote = await mounting
      }
      try {
        await ensureRemote()
      }
      catch (error) {
        // Swallowed on purpose: the fallback is a feature here, not an error
        // state. The button still appears and still does something useful.
        void error
      }

      ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'prompt-tune-button',
        order: 30,
        // A thunk, not a string: the owner re-reads it on every projection, so
        // the label follows the active locale without re-registering.
        label: () => translate('button.label'),
      }, PromptTuneButton))

      return async () => {
        if (disposeRemote === null) return
        const dispose = disposeRemote
        disposeRemote = null
        await dispose()
      }
    }

    return {
      // Both services are read as properties above, and Cordis throws on a
      // service property read that was not declared here — turning the whole
      // entry FAILED and failing the page's boot audit. Declaring them is what
      // makes the fiber wait for the slot registry and the locale dictionary
      // seat instead of activating without them. The Remote carrier is not one
      // of them: it is read with `ctx.get` so a composition without it still
      // activates and falls back.
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
