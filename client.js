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
      'menu.deep.failed': '改写失败：',
      'menu.deep.fallback': '深度优化（交给 Agent）',
      'menu.deep.fallback.hint': '这个组合里没有 Remote，改为把 prompt_tune 指令写进输入框，由会话模型改写',
      'menu.coverage': '七块覆盖',
      'menu.undo': '替换后可 Ctrl+Z 撤回',
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
      'menu.deep.failed': 'Rewrite failed: ',
      'menu.deep.fallback': 'Deep rewrite (hand to the agent)',
      'menu.deep.fallback.hint': 'No Remote in this composition: the prompt_tune instruction goes into the input instead',
      'menu.coverage': 'Blocks covered',
      'menu.undo': 'Ctrl+Z undoes the replacement',
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
    }

    /**
     * The ✨ button.
     *
     * Hooks are called before any early return, and `useInput` falls back to a
     * constant reader so the call order never depends on which props arrived.
     */
    function PromptTuneButton(props) {
      const [open, setOpen] = useState(false)
      const [phase, setPhase] = useState('idle')
      const [problem, setProblem] = useState('')
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
        setPhase('busy')
        setProblem('')
        try {
          // A mounted method answers with a `RemoteResult` envelope and never
          // throws a business failure: carrier loss, cancellation and every Host
          // `RemoteError` arrive as `{ ok: false, error }`.
          const result = await call(text, undefined)
          if (result === null || typeof result !== 'object' || result.ok !== true) {
            throw result?.error ?? new Error('the Remote returned no result')
          }
          const answer = result.value
          const prompt = typeof answer === 'string'
            ? answer
            : (typeof answer?.value === 'string' ? answer.value : undefined)
          if (prompt === undefined || prompt.trim() === '') throw new Error('the Remote returned no text')
          replaceDraft(prompt)
        }
        catch (error) {
          setPhase('failed')
          setProblem(error instanceof Error ? error.message : String(error))
        }
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
        onClick: () => { if (hasText && !busy) setOpen(value => !value) },
      }, busy ? '✳' : '✨')

      if (!open) return h('div', { style: S.wrap }, trigger)

      const deepLabel = canRewrite ? translate('menu.deep') : translate('menu.deep.fallback')
      const deepHint = canRewrite ? translate('menu.deep.hint') : translate('menu.deep.fallback.hint')
      const footer = phase === 'failed'
        ? `${translate('menu.deep.failed')}${problem}`
        : `${translate('menu.coverage')}: ${covered.length}/${BLOCKS.length}${covered.length === 0 ? '' : ` · ${covered.join('、')}`} · ${translate('menu.undo')}`

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
            style: busy ? { ...S.item, ...S.buttonDisabled } : S.item,
            onClick: () => { if (!busy) void runDeep() },
          }, [
            busy ? translate('menu.deep.busy') : deepLabel,
            h('span', { key: 'h', style: S.hint }, busy ? deepHint : deepHint),
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
