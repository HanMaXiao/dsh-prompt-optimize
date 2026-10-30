/**
 * Prompt Optimize — preset-scoped half.
 *
 * Only the `preset-prompt-tune` declaration mounts this module, so the policy
 * below reaches exactly the sessions a user started in 「提示词优化」 and never
 * touches a session running the standard preset. It is the "prompt-optimization
 * system prompt" the bundle advertises as a selectable mode.
 */

import { defaultLibraryDir } from './lib/lessons.js'
import { writeReceipt } from './lib/receipt.js'

const POLICY = `你是「提示词优化」模式下的提示词工程师。这个会话的唯一职责是：把用户给的草稿改写成**专业、规范、可直接执行**的提示词。

**每次新会话的第一件事**：用 skill 工具加载 \`prompt-optimization-best-practices\`，把正文连同末尾「已积累的经验教训」一起读完。这是本模式的默认动作，不需要用户提醒。

## 工作方式（严格按这个顺序）

1. 先判断输入是什么：如果用户已经给了草稿，直接进第 2 步；如果只有一句需求描述，把它**当成草稿**处理，不要反问已经说过的事。
2. \`prompt_tune_guide\`：拿到七块的具备/缺失清单。结构不全时这份改写往往就够了。
3. 需要改**用词、逻辑、语气**时，再跑 \`prompt_tune\`。两个工具都可以跑，先 guide 后 tune 是默认顺序。
4. 交付：把改写后的**正文整段**给用户（它就是要被复制走的东西），再用不超过 3 行说明补了哪几块、有哪些待确认。
5. 收尾：用户说「还是不对」、或你人工又修了一遍时，用 \`prompt_tune_learn\` 记一条教训。

## 硬性要求

- 用户没说的**事实**（路径、版本号、文件名、接口名、数字）一律不许编。缺失就写成明确的待确认项，让执行者去问。
- 路径、命令、标识符、专有名词**原样保留**，不翻译、不改写大小写。
- 用用户草稿的语言。
- 保留草稿里的**全部**具体信息：一个路径、一个数字、一条约束都不能丢。
- 改写结果跟着内容走：草稿一句话，结果就不要写成一篇。
- 不要给多个候选版本，不要贴对比表格，不要为了凑格式稀释原意。

## 边界

- 本模式的交付是**改写后的提示词**。用户没说「开始做」时，不要顺手把提示词里描述的任务干了——那份活本来就是要交给另一个执行者（或另一个会话）去做的。
- 用户明确说「优化完直接做」时，才继续执行。
- 如果用户其实需要的是**一份能被反复读取的系统提示词文档**（跨阶段、要交给新会话、要长期复用），告诉他改用提示词模式插件 \`@local/dsh-prompt-mode\` 的 \`prompt_doc_write\`；本模式只负责把输入改好。`

/** Config accepted by the preset-scoped row; kept explicit so a typo fails loud. */
function resolveConfig(config) {
  const raw = config ?? {}
  const known = new Set(['section'])
  const unknown = Object.keys(raw).filter(key => !known.has(key))
  if (unknown.length > 0) {
    throw new Error(`@local/dsh-prompt-optimize/mode has unknown config key(s) ${unknown.join(', ')} — config is { section? }`)
  }
  if (raw.section !== undefined && (typeof raw.section !== 'string' || raw.section.trim() === '')) {
    throw new Error('@local/dsh-prompt-optimize/mode `section` must be a non-empty string when present')
  }
  return { section: typeof raw.section === 'string' ? raw.section : POLICY }
}

/**
 * Register the prompt-tune policy section.
 *
 * @param ctx Preset-scoped Cordis context.
 * @param config `{ section? }` — the deployment may replace the wording.
 */
export function apply(ctx, config = {}) {
  const { section } = resolveConfig(config)
  const libraryDir = defaultLibraryDir()

  // Two-stage receipt, for the reason documented in lib/receipt.js: the first
  // write proves the preset's child row mounted, the second (which overwrites
  // it) proves the system prompt section itself registered. A file still
  // holding only the first shape means the row mounted but `systemPrompt` never
  // arrived in this composition.
  writeReceipt(libraryDir, 'preset.json', { half: 'mode', preset: 'prompt-tune', libraryDir })

  ctx.inject(['systemPrompt'], (spCtx) => {
    const order = spCtx.systemPrompt.getSectionOrder('PLAN_POLICY') + 30
    spCtx.effect(() => spCtx.systemPrompt.section({
      name: 'prompt:tune-policy',
      order,
      text: section,
    }), '@local/dsh-prompt-optimize/mode: prompt:tune-policy section')
    writeReceipt(libraryDir, 'preset.json', {
      half: 'mode',
      preset: 'prompt-tune',
      section: 'prompt:tune-policy',
      order,
      libraryDir,
    })
  })
}
