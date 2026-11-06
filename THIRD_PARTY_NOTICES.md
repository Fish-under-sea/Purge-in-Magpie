# 上游与第三方致谢

本插件不是从零发明的。它把「本地 purge 目录 → 网关请求改写」这条链搬到 magpie 的插件契约上，
主干思路与协议落点来自上游；下面逐条写清来源与改动范围，方便核对与回退。

## 1. agent-purge（主来源）

- 上游：**ZiChuanLan/agent-purge** — <https://github.com/ZiChuanLan/agent-purge>
- 作者：**ZiChuanLan**
- 许可证：MIT（Copyright (c) 2026 ZiChuanLan），全文见 [`LICENSE`](LICENSE) 下半段
- 用到的部分：`magpie-plugin/` 子目录里的钩子（`hooks.js`）与页面（`page/`），以及 `lib/rewrite.mjs`
  里的模式实现（与钩子共享同一套语义）
- **没有用到的部分**：上游不提供「破甲提示词」。它随包只有一份起步模板
  `lib/templates/personas/neutral.md`（1115 字节，语言/工作方式/边界三段），本插件**没有**把它打包进来——
  那只是最小骨架，不是这个插件的价值所在。上游 README 明确写着「不提供、不分发任何用于越狱、
  对抗安全审查或侵犯第三方权益的提示词载荷」。
- 沿用不变的部分：
  - 四种 protocol（`anthropic` / `chat` / `responses` / `gemini`）的 system 落点；
  - `off` / `strict` / `replace` / `append` 四种模式的语义；
  - 「块结构原样保留」（Anthropic 的 `cache_control` 不因改写而丢失）；
  - `stripIdentity` 的行级去身份策略：只删「一行里同时有自称 + 点名模型/厂商」的行；
    名字表按上游 `lib/rewrite.mjs` 补齐到 21 个宿主（本版补了 OpenCode / ZCode / CodeBuddy /
    Hermes / Grok / Antigravity）；
  - `append` 时人设放在宿主文本**之前**（与上游 CLI 的后置相反，这一点它插件 README 有明确说明）；
  - 失败一律 fail-open：改不动就原样放行。
- 本插件的改动：
  - 清点从「读 `~/.agent-purge/`」改成「扫一组可配来源目录」，并支持 ZIP / DSH 插件包 / 裸文本；
  - 人设与技能并排：技能按顺序拼在人设后面，不再只有一个人设；
  - 读盘策略：上游按 mtime 缓存（1 秒预算），本插件每请求读一次 `state.json`（文件很小），
    换来「换人设下一请求立刻生效」；
  - 页面独立重写（条目列表 + 检查器 + 版本回滚 + 校验记录），不复用上游页面；
  - 新增 `state/catalog.json` 与 `page/catalog.js` 两份快照，页面不读盘；
  - 新增 `tools/scan.mjs` 离线清点，预览与真机走同一条扫描路径。

上游的 `magpie-plugin/README.md` 与本插件的差别，看本仓 [`README.md`](README.md)。

## 2. magpie（宿主与契约）

- 上游：**yetone/magpie** — <https://github.com/yetone/magpie>
- 用到的部分：插件清单契约（`magpie.hooks` / `magpie.page` / `magpie.options`）、
  页面桥（`page/_magpie/bridge.js` 的 `magpie.ready` / `magpie.options.get|set`）、
  异步网关钩子的 `onRequest(body, ctx)` 形状与 `ctx.report` 码。
- 本插件不修改 magpie 源码，只按它的公开扩展点接入。

## 3. dsh-purge 红队技能库（内置技能的来源）

- 位置：本机 `D:\Fish-code\DSH\plugins\dsh-purge\skills\redteam\`（23 份原子技能，共约 143 KB）
- 实测采用：`skills/` 下 22 份技能，内容**原文照搬、逐字未改**；每份的 `source:` 字段写明对应原文件
- 与原文件的差异只有两处，都不碰正文：
  1. 文件名与 `name:`（显示名）汉化；
  2. 补了 ASCII 的 `id:`——`slug()` 会把中文吃成空串，22 份会全部退化成同一个 id `item`；
  3. 去掉了 dsh-purge 自己的 `role:` / `enabled:` 字段（本插件不用它们）。
- **原样保留的一处不兼容**：正文里有 137 处 `redteam_*` 工具调用，那套工具由 dsh-purge 注册，
  magpie 这条链上没有。按「原样照搬」的要求没有替换，模型照正文调用会得到「工具不存在」。
- 未做的事：不修改 `dsh-purge` 里的任何文件；本插件也不加载它的运行时代码。
- **未纳入的一份**：`nsfw-prompt-gen.md`。它包含针对儿童的性化内容生成方法与平台过滤绕过指引，
  本插件不收。

## 4. dsh-session-archive（识别样本）

- 本地样本：`@local/session-archive`（DSH cordis 插件），用于「DSH 插件包」判型夹具；
- 它只作为**被判型的对象**出现，本插件不加载、不执行导入件里的任何代码。

## 5. 许可与再分发

本插件整体按 MIT 发布。上游 MIT 文本已原样附在 [`LICENSE`](LICENSE) 里；
分发本插件时请一并保留该文件，别把上游的版权行删掉。