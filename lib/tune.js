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

/** One block of the standard, with the words that betray it in a draft. */
export const BLOCKS = [
  {
    id: 'role',
    title: '角色',
    ask: '谁在干这件事（身份、专长、立场）',
    hint: '你是……',
    match: /你是|作为|扮演|我是一名|负责|act as|you are|as an? [a-z]+ engineer/i,
  },
  {
    id: 'goal',
    title: '目标',
    ask: '要拿到什么结果，而不是要做什么动作',
    hint: '把「想做的事」写成「可判定的结果」',
    match: /目标|想要|目的是|实现|完成|拿到|产出|goal|objective/i,
  },
  {
    id: 'context',
    title: '上下文与数据源',
    ask: '去哪读事实：真实路径、规格、现状、约束来源',
    hint: '先读 ../../文件；技术栈是……',
    match: /背景|上下文|现状|技术栈|项目|代码库|仓库|文件|目录|路径|context|repo/i,
  },
  {
    id: 'deliverable',
    title: '交付物',
    ask: '最终交出什么、什么形态、放在哪里',
    hint: '交付：<文件/接口/文档>，放在 <路径>',
    match: /交付|输出到|产出|生成到|写到|保存到|新建|deliverable|write to|output/i,
  },
  {
    id: 'constraints',
    title: '硬性约束',
    ask: '不允许做什么、边界在哪、什么必须先问',
    hint: '不要改 X；不确定先问；只动 Y 目录',
    match: /不要|不准|禁止|必须|只能|不得|限制|约束|避免|别|must|never|do not|avoid|only/i,
  },
  {
    id: 'acceptance',
    title: '验收标准',
    ask: '怎么判定做完了，谁来跑什么命令看什么输出',
    hint: '验收：<命令> 输出 <期望>',
    match: /验收|通过|测试|跑通|自测|标准|判据|成功条件|acceptance|criteria|test passes|verified/i,
  },
  {
    id: 'format',
    title: '输出格式',
    ask: '回答怎么组织：先给什么、多长、要不要引用',
    hint: '先给结论，再给取舍，不超过 3 行',
    match: /格式|表格|列表|markdown|json|字数|不超过|分点|回复格式|format|bullet/i,
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
