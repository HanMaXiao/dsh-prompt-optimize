# Prompt Optimize · 提示词优化插件

`@local/dsh-prompt-optimize` —— 把一句随口说出的草稿，改写成**专业、规范、可直接执行**的提示词。

与 `@local/dsh-prompt-mode`（提示词模式）的分工只有一条判据：**交付物是「一段话」还是「一份能被反复读取的文档」**。

| 场景 | 用哪个 |
|------|--------|
| 一句话交办一个中小任务 | 本插件：优化输入，然后直接开干（关系②） |
| 跨多阶段、要交给新会话、要长期复用 | 先本插件优化措辞，再 `prompt_doc_write` 出系统提示词文档（关系①） |
| 输入很糙但任务很大 | **先优化这次输入**，再决定要不要出文档 —— 最主要的用法 |

## 一、五件套

| # | 能力 | 落点 |
|---|------|------|
| ① | 优化工具 ×3 | `prompt_tune_guide`（本地/即时）、`prompt_tune`（真模型改写）、`prompt_tune_learn`（自迭代） |
| ② | 优化提示词系统提示词 | `lib/tune.js` 的 `TUNE_SYSTEM_PROMPT`（模型改写时的 `system`）+ 预设段 `prompt:tune-policy` |
| ③ | 提示词优化模式 | agent preset `prompt-tune`「提示词优化」，新会话可选 |
| ④ | 自迭代 Skill | `prompt-optimization-best-practices`，教训段由 `prompt_tune_learn` 追加 |
| ⑤ | 对话框 ✨ 按钮 | `conversation.input.overlay`（输入框卡片内部右上角，对齐 Trae 的位置） |

## 二、七块标准

一段专业的提示词应当七块齐全，缺哪块执行者就只能在那里猜：

1. **角色** 2. **目标** 3. **上下文与数据源** 4. **交付物** 5. **硬性约束** 6. **验收标准** 7. **输出格式**

`prompt_tune_guide` 用正则判定草稿已具备哪几块（`0/7` 到 `7/7`），给出每块的补法，再**确定性地**把缺失块渲染成 `⟨待确认：…⟩`——它绝不自造路径或数字，缺就是缺，让执行者去问。

`prompt_tune` 才做语义改写：一次模型调用，`system` 是 `TUNE_SYSTEM_PROMPT`，只返回改写后的正文。两者的分工写进了 skill，也写进了工具描述，模型能自己选。

## 三、✨ 按钮（位置对齐 Trae）

注册进 `conversation.input.overlay`（list / session scope），这是「**输入框卡片内部的浮动条目**」座位——shipped 的 `/` 命令弹窗、`@` 菜单、反馈弹窗都在这里。

按钮能读写输入框，靠的是该座位自动注入的**标准 session props**：

```
useInput: SnapshotSelectorHook<InputState>     ← 读草稿（state.draft）
inputActions: InputActions                     ← setDraft / insertText / submit / focus
```

这两项由 `ui-conversation` 的 `ctx.uiSession.provide({ hooks: ['conversation','input'], props: ['inputActions'] })` 提供（`apply.ts`），并在 `contract/slots.ts` 的 `SessionStandardProps` 里声明。已用客户端 Inspect 核实该座位的 `standardProps` 确实列出这两项。

点 ✨ 展开两个动作：

- **规范补全（本地·即时）** —— 不走模型，按七块把草稿补成待确认项，`inputActions.setDraft()` 直接替换输入框内容（Ctrl+Z 可撤回）。
- **深度优化（原地改写）** —— 调客户端→宿主 Remote（`ctx.get('remote.promptOptimize').optimizeDraft`），结果**直接落回输入框**，不用再按回车。该命名空间不可用时（组合里没有 Remote、或它加载失败）自动退回「把 `prompt_tune` 指令写进输入框」的老路径。

### 为什么它落在「输入框内右上角」

位置不是估的，是照 owner 自己的 CSS 定的：

- `InputBar.module.css` 里 `conversation.input.overlay` 的锚点是
  `position: absolute; inset: 0 0 auto; height: 0`——一条贴在**卡片顶边**、全宽、零高的条带；注释也写明「entries position themselves against the card」。
- `.card` 是 `position: relative`，且**没有设 `overflow`**。前者让锚点的 `inset` 以卡片为基准，后者保证我的下拉面板向卡片外延伸时不会被裁掉（shipped 条目是把菜单挂在卡片**上方** `bottom: 100%`，我这颗是「卡片内」那一类）。

所以按钮用 `top: 6px; right: 8px`：卡片 `padding-top` 是 8px，26×26 的按钮正好压住首行文字所在的带子，右侧 8px 与卡片的右内边距对齐——与截图上红框的位置一致。面板另加 `maxWidth: calc(100vw - 32px)`，窄视口下不会从左边溢出。

按钮本身是**纯图标**（`✨`，与截图上的参照一致）：宽标签会遮住更多它必然压着的那一行文字，而 owner 没有为这个角预留空间。可读名称与提示走 `aria-label` / `title`，两个动作的完整措辞在面板里。

## 四、模型路由（不硬编码 provider）

`prompt_tune` 按顺序解析路由：

1. 工具参数 `provider` / `model`
2. bundle 行配置 `prompt-tune-core` 的 `config.provider` / `config.model`
3. **`ctx.agentDefaultModel.currentSelection()`** —— profile 自己的默认模型

第 3 条是关键：bundle 因此**不在 patch 里钉死任何 provider**，换 profile 也能用。实测在 `web` profile 里解析到 `deepseek-official/deepseek-flash`，改写成功（`finish: stop`）。三条都拿不到时，报错会把这三级链和要改哪一行一起写出来。

## 五、文件地图

```
dsh-prompt-optimize/
├── package.json          bundle 清单：dsh.bundle.patch + dsh.client + icon
├── cordis.patch.yml      两行：prompt-tune-core（Host 核心）+ preset-prompt-tune（提示词优化预设）
├── host.js               3 个工具 + 自迭代 skill + status.json 回执
├── mode.js               预设作用域：prompt:tune-policy 段（order 530）+ preset.json 回执
├── client.js             Client：输入框卡片右上角的 ✨ 按钮
├── lib/tune.js           七块标准 / 优化系统提示词 / 确定性分析器（纯函数，无 Node 依赖）
├── lib/lessons.js        教训存储 + 可读镜像 + 教训段渲染
├── lib/receipt.js        回执：status.json（Host 侧）/ preset.json（预设侧）
├── skills/prompt-optimization-best-practices.md   基线 skill 正文
└── icon.svg
```

## 六、安装与验证

```
plugin_manager { action: "install_bundle", target: "D:\\XiaoProject\\DSHPluginDev\\dsh-prompt-optimize" }
```

离线自测（79 项：真实 `dsh-tools` 注册表前置校验、React 19 真渲染、真实 typert 协议与 loader 校验、无模型的模型调用路径、客户端三条路径）：

```powershell
cd D:\XiaoProject\DSHPluginDev\dsh-prompt-optimize
node --test
```

### 已实测（`web` profile，安装即生效）

装完那次 `apply` 写下两份回执，时间戳一致：

| 判据 | 实测值 |
|------|--------|
| `<libraryDir>/status.json` | `tools: [prompt_tune_guide, prompt_tune, prompt_tune_learn]`、`toolsFailed: []`、`version: 1.0.0` |
| `<libraryDir>/preset.json` | `section: "prompt:tune-policy"`、`order: 530`（**第二次写入**的形态 ⇒ 预设子行挂载 + 段注册都成功） |
| 技能目录 | `prompt-optimization-best-practices` 出现在会话 catalog |
| 会话工具表 | 三个 `prompt_tune*` 工具出现，可直接调用 |
| `prompt_tune_guide` | `0/7` 块 + 七条补法 + 带 `⟨待确认⟩` 的确定性改写 |
| `prompt_tune` | 真模型调用，路由 `deepseek-official/deepseek-flash`，`finish: stop`，改写含角色/可判定目标/硬约束/验收标准 |
| ✨ 按钮（离线） | `check-optimize.mjs` 第 8 节用假模块表 + 迷你 React 驱动 `client.js`：注册进 `conversation.input.overlay`（id `prompt-tune-button`、order 30、label 为 thunk）；空草稿点了不开；有草稿时开出两个动作；「规范补全」写回七块标准且含 `⟨待确认⟩`；「深度优化」写回 `prompt_tune` 指令；缺 `inputActions` 时渲染诊断而不是抛错 |

> **这个 bundle 不需要重启就生效**：它的包名从未被进程加载过，按 Loader 的规则（只 import 从未加载过的包名）会被真正 `import()` 一次。这与 `@local/dsh-prompt-mode` 的处境正好相反——那个包名在首装时已被加载，所以它的 Host 侧改动必须等重启。

### 待确认

- **✨ 按钮在真实页面里出现**：`conversation.input.overlay` 当前的占用者只有三个 shipped 条目（`slash-menu` / `command-popup` / `feedback-dialog`），`prompt-tune-button` 尚未出现；而按钮的逻辑本身已由离线 harness 全面验证（见上表）。两种可能，刷新页面即可区分：
  1. **客户端模块表是页面启动时拉取的**，新装的 bundle 需要刷新才会加载它的 Client 半边 —— 刷新后按钮出现。
  2. 刷新后仍不出现 ⇒ 说明 Client 半边加载报错，需要看页面 console 里那一行（插槽条目抛错只会在 console 留一条记录，不会渲染成可见错误）。

## 七、维护须知

1. **改 Host 侧 JS 需要重启**（Client 侧刷新页面即可）。原因与七种无效绕法的逐条实测见 `../dsh-prompt-mode/README.md` 的「维护须知」——同一个 Loader，同一套结论。
2. **预设会随 DSH 版本漂移**：`preset-prompt-tune` 的 `plugins` 列表是从 shipped `standard` 预设逐行复制的（本插件的这份是从已核对过零漂移的兄弟插件里程序化生成，生成后再次比对确认零漂移）。DSH 升级后重跑同款比对即可：

   ```powershell
   cd D:\XiaoProject\DSHPluginDev\dsh-prompt-optimize
   node scripts\check-preset-drift.mjs --dsh-root D:\XiaoProject\deepseek-harness
   ```

   `scripts/check-preset-drift.mjs` 不引入任何 YAML 库（本包不允许新增依赖，它按行解析这两个文件的固定形状），只比对 `preset-prompt-tune` 行的 `plugins` 列表与 shipped `standard` 预设的同名块；本包自己追加的 `prompt-mode-policy` 行按预期排除。根目录也可用 `DSH_SOURCE_ROOT` 环境变量给；两者都没有时打印 SKIP 提示并以 0 退出（裸 checkout 没有比对对象，不算失败）。零漂移退出 0；有漂移则打印 diff 并以 1 退出——此时按 diff 把 `plugins` 列表刷成 shipped 的形态，再重新追加本包自己的策略行。CI 里同款检查作为信息性作业运行（`continue-on-error: true`，作业名不叫 `node --test`），漂移只报警、不拦 `main`。
3. **渲染函数必须防御**：`output.render` 跑在 UI 路径上，抛错会打坏工具卡片。本插件的三个渲染器对任意 `value` 都不抛（离线自测第 4 节覆盖）。
4. **模型调用失败要说清**：`finish.kind` 为 `error` / `aborted` / `max-tokens` / `tool-calls` 时分别给出不同的可行动报错，绝不静默返回空文本。

## 八、已知边界与下一步

### 刷新页面 = Client 半边生效；重启 Host = Host 半边生效（都已实测）

- **Client 半边只需刷新页面。** 实测：刷新后 `conversation.input.overlay` 出现第四个占用者 `prompt-tune-button`（order 30, active），使用者也在输入框右上角看到了 ✨——而那一轮的 Host 进程从头到尾没换过（pid 14800，启动于 09-25 20:26:10）。原因是客户端模块表在页面启动时拉取，模块文件由 Host 从磁盘现取。
- **Host 半边必须重启进程。** Loader 只在首次 `import()` 某个包名时加载代码，刷新页面不会让它换模块。判据：`<libraryDir>/status.json` 的 `at` 是否变新、有没有 `remote` 字段。
- 对照实验（排除「组合变更会推送新客户端模块」）：禁用再启用 bundle 会改写 profile manifest 的 `bundles`（boot HMR 明确比较该字段），但 `conversation.input.overlay` 始终只有三个 shipped 条目。

### 深度优化：已实现为客户端→宿主 Remote

✨ 按钮的「深度优化」不再把指令写进输入框等用户回车，而是调用一条 Remote 让结果**原地落回输入框**：

- `remote.js` —— `TypertRemoteService` 子类，暴露 `optimizeDraft(draft, intent, signal)`，内部走与 `prompt_tune` **同一份** `lib/tune-call.js`（离线自测第 9 节覆盖它：系统提示词、四个终止分支）。
- `typert.js` —— 手写的 TYPERT manifest，经 `exports["./typert"]` 暴露给 `typert-loader`。
- 客户端：**自己调 `ctx.remote.$mount()`** 挂上这份 manifest 的镜像（见下面第 5 条），然后读 `ctx.get('remote.promptOptimize').optimizeDraft(...)`，成功后 `inputActions.setDraft(结果)`；**拿不到该命名空间时自动退回**「把 `prompt_tune` 指令写进输入框」的老路径，按钮永远不会因为 Remote 缺失而失灵。

落地过程中量到的五条约束（都已按实测修掉）：

1. **`@Remote` 装饰器不必需**。协议把标记写成**原型上的 descriptor**（键是字符串 `@deepseek-ai/dsh-typert-protocol/remote-methods`）。但不走内部形状：`Remote` 的工厂形式 `Remote({ mode })` 返回的装饰器接受 `(method, context)`，而 context 只是个 `{ private, static, name, addInitializer }` **普通对象**——手工提供即可，全部走公开 API。
2. **loader 要求每个 codec 有 `create()`，网关真的会调它**（`gateway/lib/index.js`：`value = codec.create().parse(value)`）。生成物用 zod 造这个 schema，而 `link:` 安装的包**解析不到 zod**（实测 `ERR_MODULE_NOT_FOUND`）。改为返回只有 `parse` 的鸭子对象：loader 只查 `typeof create === 'function'`，网关只调 `.parse`。
3. **协议包必须能被解析 —— 已修在包内，而不是绕过**。本包目录现在有自己的 `node_modules`（从 registry 装的 `@deepseek-ai/dsh-typert-protocol@0.1.7-rc.2`），`remote.js` 的裸 import 因此从**包自身**解析。这是必须的：`pnpm add link:<dir>` **不会安装 link 目标的依赖**，所以此前只有那台恰好通过 agent-team bundle 传递依赖带着该包的 profile 才能解析。`node_modules` 因此是运行时必需品，不是构建残留。`@deepseek-ai/dsh-typert-loader` 是 devDependency，只给离线自测做校验。
4. **裸 specifier 只在 web 侧解析**。同一个 import 在 `web` profile 的 Host 里成功，在 headless 应用里失败（两边都实测过）——所以 `remote.js` 是**惰性动态 import**，失败只影响 Remote 本身：工具、技能、按钮照常，回执里会写 `remote: "failed: ..."`。
5. **命名空间得客户端自己挂，而且它是独立服务，不是 `remote` 的属性**。`typert-loader` 只在**宿主侧**发现 `./typert`；基座里客户端侧的挂载全是 `@deepseek-ai/dsh-api-remotes` 那批**生成的**第一方贡献项，**不会替你挂第三方包的命名空间**。所以 `client.js` 必须自己 `ctx.remote.$mount()`，而 `$mount()` 把每个命名空间装成**独立的 Cordis 服务** `remote.<namespace>`——`ctx.remote.promptOptimize` 这种属性读法**永远是 undefined**（`remote` 这个 carrier 上只有 `$mount`、`$stream`、`$host`、`$on`）。这条曾经让「深度优化」一直静默走回退路径：功能看起来一直"能用"，实际从没走过 Remote。

另外一条和「回退」有关的实测：挂载后的方法**不抛业务异常**，返回 `RemoteResult` 信封 `{ok:true,value}` / `{ok:false,error}`——断线、取消、Host 的每个 `RemoteError` 都在 `error` 分支里。只读 `.value` 会把一次被拒的改写变成静默的 `undefined`。

还有一条同源的约束：**发布出去的方法名不能撞命名空间服务自己**（`remove`、`install`、`has`、`name` 等都是它的成员），撞了会在挂载时报 `conflicts with its namespace service`。本包只有一个 `optimizeDraft`，不撞；真撞上时把线上名改掉、用 `implementation` 指回真方法即可（网关按 `descriptor.implementation ?? descriptor.method` 分发）。

### 现在的状态与启用条件

| 事实 | 证据 |
|------|------|
| manifest 已被 loader 接受 | 修好 codec 后在全新进程里启动，**零 activation warning**（此前是 `typert-loader ... has no create() factory`） |
| 手装的标记就是协议读回的东西 | 离线第 10 节用**真实协议**的 `remoteMethods()` 读回 `[{method:'optimizeDraft', invocation:{kind:'direct'}}]` |
| manifest 通过**真实 loader** 校验 | 第 10 节调 `validateTypertManifest`，并配反向对照（去掉 `create` 会被拒），证明这不是走过场 |
| 网关面向的绑定字段正确 | 第 10 节用真实 `Context` 构造真实 service：`typertRemote = {service, serviceKey:'promptOptimize', namespace:'promptOptimize'}`，且真实类上带标记 |
| 模型调用路径已离线覆盖 | 第 9 节：系统提示词、草稿逐字框定、路由与信号、四个终止分支 |
| 按钮三条路径已离线覆盖 | 第 8 节：无 Remote 退回落、有 Remote 原地替换、Remote 失败上报且不动草稿 |
| 客户端自己挂上了贡献项 | 第 8 节断言 `$mount` 收到 `@local/dsh-prompt-optimize` 与 `optimizeDraft(draft,intent)` 描述符；第 11 节在**真实 Cordis** 里用真实 carrier 激活同一份 |
| 按钮在**真 React** 下能渲染 | 第 8 节用 React 19 + `react-dom/server` 渲染同一组件：迷你 harness 不校验 React 语义，真渲染抓到过一次「组件绑定的是注入的 React 实现」这类只在页面里才会暴露的问题 |
| 按钮定位有据可依 | owner 自己的 CSS：`.overlayAnchor` 是卡片顶边零高条带、`.card` 是 `position: relative` 且无 `overflow`；真渲染输出确认内联样式为 `position:absolute;top:6px;right:8px` |
| ✨ 按钮**已在真实页面显示** | `conversation.input.overlay` 第四个占用者 `prompt-tune-button`（order 30, active），使用者目视确认「在输入框右上角」 |
| Host 侧 Remote **尚未在当前进程生效** | Host 进程 pid 14800 启动于 09-25 20:26:10，早于 `remote.js` 的 23:54；其 `status.json` 也没有 `remote` 字段。Remote 会在 Host 下一次启动时自然生效；在那之前「深度优化」走 agent 工具回退路径（功能可用，只是要多按一次回车） |

唯一没有离线覆盖的，是**网关到页面的那段传输**：它需要一个真实的浏览器页面，所以在重启+刷新之前不做任何声称。

要让它真正生效，需要两步（都是既有结论的直接后果）：

1. **重启 Host**：Loader 只在首次加载包名时 `import()`，改动的 Host 代码必须等新进程（见 `../dsh-prompt-mode/README.md` 的维护须知）。
2. **刷新页面**：客户端模块表在页面启动时拉取。

重启+刷新后，判定三条：`status.json` 里 `remote` 是对象且 `methods` 含 `optimizeDraft:direct`；`conversation.input.overlay` 出现 `prompt-tune-button`；点 ✨ →「深度优化」后输入框被改写且无需回车。

### 仍未做的一步：token 级流式 —— 实测为「需要构建步骤」，故不做

现在是「一次调用、一次替换」。逐 token 灌入的路径我查到了尽头，结论是**无构建步骤的包表达不了它**：

- 客户端命名空间的方法是从 **invocation descriptor** 装配的，而 descriptor 里**没有** stream 标记（`gateway/src/client/index.ts` 的 `InstalledMethod` 只有 `direct`/`scoped`）。
- 「这个方法是流」只存在于 **构建期生成的客户端 stub** 里：`packages/api/session-controller/lib/typert.remote-client.js` 的 descriptor 明确写着 `mode: 'stream'`，生成器把它输出到 `exports['./client/typert']`。host manifest（`typert.host.js`）里没有它，`validateTypertManifest` 也不接受该字段。
- 也就是说要走 `$stream`，就得再手写一份**客户端侧** descriptor manifest，并依赖它的装配方式——在客户端半边还没在真实页面里跑过一次的情况下，这是往未验证的机制上再叠一层未验证。

观感收益换不来这个风险，所以本包的「深度优化」就是「一次调用、一次原地替换」。要真流式，正解是给这个包引入 typert generator（构建期生成 `typert.host.js` + `typert.remote-client.js`），那是另一件事。
