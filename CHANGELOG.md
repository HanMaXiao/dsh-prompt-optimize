# 变更日志

本文件记录 `@local/dsh-prompt-optimize` 的所有显著变更。格式遵循
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [1.1.0] - 2026-10-30

### 新增

- **预设漂移校验**：新增 `scripts/check-preset-drift.mjs`，逐行比对 `preset-prompt-tune`
  行的 `plugins` 列表与 shipped `standard` 预设的同名块；DSH 升级后可据此发现「提示词优化」
  预设落后于发行版的地方。不引入任何 YAML 依赖，无比对对象时打印 SKIP 并以 0 退出。CI 里以
  信息性作业运行（`continue-on-error`、作业名不叫 `node --test`），只报警、不拦 `main`。
- **客户端镜像同步锁**：新增 `tests/client-pattern-lockstep.test.js`，把 `client.js` 里的
  七块覆盖镜像钉回 `lib/tune.js`——每个 Host 判定模式必须逐字、按序出现在客户端镜像里，且
  客户端不得携带 Host 没有的模式。改了一边忘了另一边，套件会红。

### 变更

- **离线自测迁入包内**：从根目录 `check-optimize.mjs`（单文件多节）迁入 `tests/*.test.js`
  （现 149 项，其中 85 条为迁移断言），按关注点拆成多个 `node --test` 文件。`node --test`
  仍是唯一验证命令。
- **七块标准分析器收紧**：此前的宽松单词匹配会把「什么都没声明」的散文判成已具备某块——裸
  `项目` 把「帮我优化这个项目的提示词」当成数据源，`实现` 命中「这个实现有 bug」里的名词，
  `别` 命中特别/分别/级别——于是分析器报出草稿从未声明的块，指南随之跳过作者真正需要的补法。
  现在每个模式只匹配真正声明该块的说法（中/英），并在注释里写明它拒绝的那条误报。这是可观测
  的行为变化，已在 PR 说明。
- **✨ 按钮「深度优化」改为「先预览、后替换」**：调用过程中可取消、显示进度；改写结果以
  before/after 预览呈现，用户确认后才写回输入框。取消、保留原稿、失败都不会改动草稿。无 Host
  Remote 时仍退回「把 `prompt_tune` 指令写进输入框」的老路径。
- **「提示词优化」预设刷新**：`preset-prompt-tune` 的 `plugins` 列表按运行中的 DSH 发行版
  刷新（22 行 shipped 复刻 + 本包策略行）；追加行 id 由 `prompt-mode-policy`（从 `dsh-prompt-mode`
  复制而来的笔误）更名为 `prompt-tune-policy`，指向的模块不变。
- **打包元数据补全**：`package.json` 补上 `files` / `license` / `repository` / `bugs` /
  `homepage`，并加入 Plugin Manager 的 locale 文件（`locale/zh.json`、`locale/en.json`）。

### 修复

- **教训库写入串行化**：`prompt_tune_learn` 的读—算 id—写序列此前不原子，两个交错的调用会因
  id 都取自同一教训数而互相覆盖、静默丢失一条；`writeFileSync` 的原地截断也会在崩溃时留下
  读作「全库损坏」的半截文件。改为单文件原子替换（临时文件 + rename）加进程内串行队列，丢条
  变成可重试的显式拒绝，崩溃也只留下上一版完整数据。

### 移除

- **根目录 `check-optimize.mjs`**：其断言已全部迁入 `tests/*.test.js`，父脚本删除。

## [1.0.0] - 2026-10-30

首个版本：提示词优化 bundle——三个 Host 工具（`prompt_tune_guide` / `prompt_tune` /
`prompt_tune_learn`）、优化系统提示词、可选预设模式、自迭代 skill、输入框卡片右上角的 ✨
按钮，以及 `node --test` 离线自测、CI 与 MIT 许可证。

[未发布]: https://github.com/HanMaXiao/dsh-prompt-optimize/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/HanMaXiao/dsh-prompt-optimize/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/HanMaXiao/dsh-prompt-optimize/releases/tag/v1.0.0
