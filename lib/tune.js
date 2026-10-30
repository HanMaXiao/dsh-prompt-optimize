/**
 * Prompt-tuning standard: the seven blocks a professional prompt carries, the
 * system prompt the model-side optimizer runs under, and the deterministic
 * analyzer that runs without any model at all.
 *
 * Everything here is a pure function of its arguments — no `node:` imports, no
 * Cordis, no clock. `host.js` (tools) and `client.js` (the composer button) both
 * build on this module, which is why the button can improve a draft instantly
 * and offline while the tool does the semantic rewrite.
 */

/**
 * One block of the standard, with the words that betray it in a draft.
 *
 * A pattern matches a *statement*, not a noun. The loose single words this
 * array used to carry matched prose that states nothing at all — a bare 项目
 * turned "帮我优化这个项目的提示词" into a data source, 实现 matched its own
 * noun in "这个实现有 bug", and 别 matched 特别/分别/级别 — so the analyzer
 * reported blocks the draft never declared and the guide then skipped the very
 * 补法 the author needed. Each pattern below is the set of forms that actually
 * declare the block, in Chinese and in English; the comment on each one names
 * the false positive it refuses.
 */
export const BLOCKS = [
  {
    id: 'role',
    title: '角色',
    ask: '谁在干这件事（身份、专长、立场）',
    hint: '你是……',
    // 负责 alone is code describing itself ("这个模块负责解析 token"); only a
    // first- or second-person 负责 is a speaker claiming the work. English
    // needs a role noun in sight, so "as a result" and "you are able to" stay
    // out while "you are a senior frontend engineer" counts.
    match: /你是|(?:我是|作为)[^，。；\n]{0,6}(?:工程师|开发者|专家|顾问|架构师|助手|助理|审查者|执行者|负责人)|扮演|[我你]负责|act as|(?:i(?:'m| am)|you are|as) an? (?:[a-z]+ )*(?:engineer|developer|architect|reviewer|expert|assistant|analyst|auditor|consultant|lead)/i,
  },
  {
    id: 'goal',
    title: '目标',
    ask: '要拿到什么结果，而不是要做什么动作',
    hint: '把「想做的事」写成「可判定的结果」',
    // 实现 and 产出 are gone: the first is an action verb (and its noun form
    // names code — "这个实现有 bug"), the second is the deliverable's word, so
    // one token used to prove two different blocks. 我想/想要 state intent.
    match: /目标|想要|我想|希望|目的是|完成|拿到|达成|goal|objective|\bwants?\b/i,
  },
  {
    id: 'context',
    title: '上下文与数据源',
    ask: '去哪读事实：真实路径、规格、现状、约束来源',
    hint: '先读 ../../文件；技术栈是……',
    // 项目/文件/目录/路径 are gone: "只动 lib 目录" and "路径必须真实存在" are
    // constraints, "修改这两个文件" is a deliverable, and none of them names a
    // source. What is left is either a declared source (背景/技术栈/仓库…) or a
    // read action, plus the three path shapes that carry a real location: a
    // drive letter, a `./`-style relative path, or a token with an internal
    // slash whose last segment has an extension — so "2024/10/30" and "和/或"
    // stay out while "src/auth/login.tsx" and "docs/login-fix.md" count.
    match: /背景|上下文|现状|技术栈|代码库|仓库|源码|先读|读一下|读懂|查阅|context|repo|codebase|data source|\bread\b|[A-Za-z]:\\[\w.-]+(?:\\[\w.-]+)*|\.{1,2}\/[\w.-]+(?:\/[\w.-]+)*|[\w.-]+\/[\w.-]+\.[A-Za-z0-9]{1,10}/i,
  },
  {
    id: 'deliverable',
    title: '交付物',
    ask: '最终交出什么、什么形态、放在哪里',
    hint: '交付：<文件/接口/文档>，放在 <路径>',
    // A bare `output` was a symptom ("console 里 output 是空的"), not a
    // deliverable; it now needs a destination or a label.
    match: /交付|输出到|产出|生成到|写到|写成|写入|保存到|新建|deliverable|write to|save to|outputs? to|output\s*[:：]/i,
  },
  {
    id: 'constraints',
    title: '硬性约束',
    ask: '不允许做什么、边界在哪、什么必须先问',
    hint: '不要改 X；不确定先问；只动 Y 目录',
    // 别 alone matched 特别/分别/级别, so it now needs a verb after it; a bare
    // `only` matched "the only issue is…", so it now needs a scoped verb.
    match: /不要|不准|禁止|必须|只能|不得|限制|约束|避免|别[动改删加碰跑用]|must not|do not|don't|never|avoid|only (?:change|edit|modify|touch|run|use|add|remove|write|read|keep|support|ask)/i,
  },
  {
    id: 'acceptance',
    title: '验收标准',
    ask: '怎么判定做完了，谁来跑什么命令看什么输出',
    hint: '验收：<命令> 输出 <期望>',
    // 通过 alone matched "通过 API 获取会话" (a data flow, not a verdict) and
    // 测试 alone matched "测试环境" (a place), so 通过 needs a judgement noun
    // beside it and 测试 needs to be run or passed. `pass` is anchored so
    // "password" stays out.
    match: /验收|自测|跑通|全绿|变绿|判据|单元测试|单测|(?:跑|执行|运行|写|补|加).{0,4}测试|测试(?:通过|用例|覆盖)|通过(?:测试|检查|验收|构建|验证|评审|审核)|(?:测试|检查|验收|构建|验证|评审|审核|用例|CI|lint)[\s全部都必须]{0,4}通过|acceptance|criteria|pass(?:es|ed)?\b|verified|(?:npm|pnpm|yarn|node|bun|make)\s+(?:run\s+)?test\b/i,
  },
  {
    id: 'format',
    title: '输出格式',
    ask: '回答怎么组织：先给什么、多长、要不要引用',
    hint: '先给结论，再给取舍，不超过 3 行',
    // This block is about how the *answer* is organized, so 格式 needs a label
    // or an answer-shaped noun: 表格/列表 alone matched UI ("列表页打不开"),
    // and markdown/json alone matched data ("把配置改成 json").
    match: /(?:输出|回复|回答)格式|格式\s*[:：]|分点|用表格|表格(?:形式|回答|呈现|输出)|列表(?:形式|回答)|(?:markdown|json) 格式|以 (?:markdown|json)|字数|不超过|format\s*[:：]|bullet|as a (?:table|list)|in (?:markdown|json)/i,
  },
]

/**
 * The optimizer's own system prompt.
 *
 * This is the "prompt-optimization system prompt" the bundle advertises: it is
 * sent as `system` on every model-side rewrite, whether the caller is the
 * `prompt_tune` tool or the 提示词优化 preset. Lessons learned through
 * `prompt_tune_learn` are appended to the skill, not here, so this text stays a
 * stable contract.
 */
export const TUNE_SYSTEM_PROMPT = `你是一位提示词工程师。用户交给你一段**草稿**（可能只是随口一句话），你要把它改写成一段**专业、规范、可直接执行**的提示词。

## 输出契约（违反即失败）

- **只输出改写后的提示词正文**。不要解释、不要前后缀、不要 Markdown 代码围栏、不要「以下是优化后的版本」这类话。
- 用用户草稿的语言写。路径、命令、标识符、专有名词**原样保留**，不翻译、不改写大小写。
- 用户没说的**事实**（路径、版本号、文件名、接口名、数字）一律不许编。缺失就写成明确的待确认项，例如「先确认 <要确认什么> 再动手」——把它写进提示词让执行者去问，而不是你自己猜一个值填上。
- 不要反问用户，不要输出多个候选版本，不要输出对比表格。一次给一段可直接使用的正文。

## 改写目标：把草稿补成七块

1. **角色**：执行者是谁。草稿没写就按任务性质直接指定一个（例如「你是一位前端工程师」）。
2. **目标**：要拿到的**结果**，不是要做的动作。把「帮我看看登录」改写成可判定的目标。
3. **上下文与数据源**：去哪读事实。只保留草稿里真实出现的路径/文件；没有就写成「先定位相关文件再动手」，绝不虚构路径。
4. **交付物**：交出什么、什么形态、放在哪。草稿没写清楚就写成待确认。
5. **硬性约束**：不允许做什么、边界在哪、什么情况下必须先问。这一块**永远要写**，至少包含「不确定的信息先问，不要猜」。
6. **验收标准**：怎么算做完。要可判定——一条命令、一个输出、一个可见现象。
7. **输出格式**：回答怎么组织。默认「先给结论/产出，再给关键取舍，简短」。

## 硬性要求

- 七块**全部**出现，用二级标题分块；草稿已经说清楚的块保持原意，不要为了凑格式而稀释。
- 保留草稿里的**全部**具体信息：路径、名字、数字、约束一个都不能丢。
- 祈使句。执行者读完就知道第一步干什么。
- 删掉语气词、寒暄、重复表达；把模糊词（「一些」「尽量」「差不多」「好看点」）换成可判定的表述或明确的待确认项。
- 篇幅跟着内容走：草稿只有一句话时，改写结果控制在 200 字以内，宁短不长。
- 最后一块之后加一行加粗祈使句，例如「**现在先从第 3 步开始：定位并阅读相关文件。**」`

/** The guidance handed to a model-side rewrite about the user's own draft. */
export function tuneInstruction(draft, options = {}) {
  const goal = typeof options.intent === 'string' && options.intent.trim() !== ''
    ? options.intent.trim()
    : '让下一个执行者照着就能干'
  return `把下面这段草稿改写成专业提示词。意图：${goal}。

草稿（原文，逐字对待）：
<草稿>
${String(draft).trim()}
</草稿>`
}

/**
 * Score a draft against the standard, without a model.
 *
 * @param draft Raw user input.
 * @returns Present/missing blocks, a 0–1 score, and one line per missing block.
 */
export function analyzeDraft(draft) {
  const text = String(draft ?? '')
  const trimmed = text.trim()
  const present = []
  const missing = []
  for (const block of BLOCKS) {
    if (block.match.test(text)) present.push(block.id)
    else missing.push(block.id)
  }
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/u).length
  const characters = trimmed.length
  return {
    present,
    missing,
    score: present.length / BLOCKS.length,
    characters,
    words,
    // A one-liner is the normal case, not a defect worth reporting twice.
    terse: characters < 40,
  }
}

/** Human-readable diagnosis of one draft, one line per finding. */
export function diagnose(draft) {
  const report = analyzeDraft(draft)
  const lines = []
  if (report.present.length === 0) lines.push('这段草稿没有任何一块标准信息，执行者只能靠猜。')
  else lines.push(`已具备：${report.present.map(id => BLOCKS.find(b => b.id === id).title).join('、')}。`)
  for (const id of report.missing) {
    const block = BLOCKS.find(candidate => candidate.id === id)
    lines.push(`缺「${block.title}」：${block.ask}。补法——${block.hint}`)
  }
  return { report, lines }
}

/**
 * Rewrite a draft into the seven-block standard, deterministically.
 *
 * @param draft Raw user input.
 * @param options `{ intent? }` — one line about what the prompt is for.
 * @returns The rewritten prompt text.
 */
export function renderProfessional(draft, options = {}) {
  const body = String(draft ?? '').trim()
  const present = new Set(analyzeDraft(body).present)
  const intent = typeof options.intent === 'string' && options.intent.trim() !== ''
    ? options.intent.trim()
    : ''
  const pending = what => `⟨待确认：${what}⟩`

  const out = []
  out.push('## 角色')
  out.push(present.has('role')
    ? '按草稿中已经写明的身份执行。'
    : `你是${intent === '' ? '这项任务的执行者' : `负责「${intent}」的工程师`}。`)
  out.push('')
  out.push('## 目标')
  out.push(body === '' ? pending('要拿到什么结果') : body)
  out.push('')
  out.push('## 上下文与数据源')
  out.push(present.has('context')
    ? '按草稿中点名的文件与来源读取事实；路径逐个确认存在后再用。'
    : `先定位相关文件与现有约定再动手。${pending('真实路径 / 技术栈 / 现状')}`)
  out.push('')
  out.push('## 交付物')
  out.push(present.has('deliverable')
    ? '按草稿写明的形态与位置交付。'
    : pending('交出什么、什么形态、放在哪个路径'))
  out.push('')
  out.push('## 硬性约束')
  out.push('- 不确定的信息先问，不要猜；路径必须真实存在。')
  out.push('- 只改这项任务需要的部分，不顺手重构无关代码。')
  out.push('- 草稿里已有的具体信息（路径、名字、数字、约束）一个都不能丢。')
  out.push('')
  out.push('## 验收标准')
  out.push(present.has('acceptance')
    ? '按草稿写明的判据验收。'
    : `一条可判定的判据：${pending('跑什么命令、看什么输出算通过')}`)
  out.push('')
  out.push('## 输出格式')
  out.push(present.has('format')
    ? '按草稿写明的格式回答。'
    : '先给结论或产出，再给关键取舍，最多 3 行，不贴全文。')
  out.push('')
  out.push('**现在从「上下文与数据源」那一块开始：先读事实，再动手。**')
  return out.join('\n')
}

/** The one-line handoff a user pastes into a fresh session. */
export function handoffLine(text) {
  const first = String(text ?? '').trim().split('\n').find(line => line.trim() !== '') ?? ''
  return first === '' ? '' : `已按七块标准改写，直接粘贴发送即可：${first}`
}
