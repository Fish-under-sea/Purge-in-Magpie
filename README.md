# Purge in Magpie

把**本地 purge 目录**当成 magpie 的「自由插件与技能源」：清点、校验、分类、去重、回滚，
再按模式把选中的人设与技能写进经过 magpie 网关的 agent 请求。

它是 magpie 的**页面插件 + 网关钩子**单包，不是 FISH Dock 插件，不依赖任何宿主补丁。

## 致谢

- **[ZiChuanLan/agent-purge](https://github.com/ZiChuanLan/agent-purge)** — 作者 **ZiChuanLan**，MIT。
  本插件的四种 protocol 落点、`off`/`strict`/`replace`/`append` 模式语义、块结构保留、
  `stripIdentity` 去身份策略都来自它；`magpie-plugin/` 子目录是这条链的起点。没有它就没有这个包。
- **[yetone/magpie](https://github.com/yetone/magpie)** — 页面插件与异步网关钩子的宿主契约
  （`magpie.page` / `magpie.options` / `page/_magpie/bridge.js` / `onRequest(body, ctx)`）由 magpie 提供。

完整来源与改动范围见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)；上游 MIT 原文原样保留在
[`LICENSE`](LICENSE) 里（Copyright (c) 2026 ZiChuanLan）。

## 它解决什么

`agent-purge` 的 magpie 插件只认 `~/.agent-purge/` 的人设，页面也不能读盘。
本插件把这条链补成三件事：

1. **来源可以是任意目录**：默认 `~/.agent-purge` 与 `~/.magpie/purge`，也能在页面里改成多个目录；
2. **认得四种东西**：DSH 会话导出包（`dsh-session-archive`）、DSH cordis 插件包、
   人设 / 技能 markdown、裸文本与 JSON 清单——坏包给出具体拒绝原因，不半途落盘；
3. **页面能调配**：条目列表、检查器、模式、启用、版本回滚、校验记录、最近一次生效记录。

## 安装

```bash
# 从 npm
magpie plugin add @fish-under-sea/magpie-purge

# 或从本仓目录
magpie plugin add "/path/to/Purge in Magpie"
magpie plugin list
```

装好后 magpie 的侧栏会多出一页「破甲 · Purge」；插件页第一次打开时，后端会扫一遍来源目录，
写出 `state/catalog.json` 与 `page/catalog.js` 两份快照，页面读的是后者。

## 配置

设置写进 magpie 的 `plugins.json`（`magpie.options`），页面上改，别手改文件也行：

| 字段 | 作用 |
| --- | --- |
| `mode` | `off` / `strict` / `replace` / `append`；默认 `off` |
| `persona` | 用哪条人设的 id；留空取第一个启用的人设 |
| `agents` | 只对这些 magpie agent 生效，如 `["claude","codex"]`；空数组 = 全部 |
| `enabled` | `{条目id: true/false}`：技能必须显式为 `true` 才注入；人设默认启用 |
| `pinned` | `{条目id: 摘要}`：固定到某一版，网关用那一版的正文 |
| `sources` | 来源目录列表；空数组用默认的两个 |
| `imports` | 页面写的导入请求（`{op, path, at}`），后端处理后复制进 `state/imports` |
| `inline` | 页面里直接贴进来的人设/技能正文，不进磁盘 |
| `gatewayTimeoutMs` | 钩子预算，默认 1500 ms（magpie 侧 100–10000） |

模式语义与上游一致：

- `off`：不动请求；
- `strict`：整段可控 system 换成人设——**原 system 里的工具说明文本也会一起没了**；
- `replace`：人设放最前，宿主 system 里「自称 + 点名模型/厂商」的行删掉（近似）；
- `append`：人设放最前，宿主 system 原样保留。

## 边界（照实说，不含糊）

- 只处理**经过 magpie 网关**的 agent 请求；客户端自己写死的行为、不经过网关的流量改不到。
- `strict` 只换可控的 system 文本；结构化工具定义不在网关这一层，改不动也不假装改动。
- 页面**不读磁盘**：所有扫描与读盘都在插件后端（`hooks.js`）里做，页面只显示快照。
- 不执行导入件里的任何脚本：DSH 插件包与导出包只被**判型与登记**，不当代码跑。
- 坏包（缺 manifest、路径带 `..`、超大文件）整个拒绝，同目录其它条目不受影响。

## 目录

```text
Purge in Magpie/
├── package.json           插件清单：magpie.hooks / magpie.page / magpie.options
├── hooks.js               网关钩子：清点 + 改写（Bun 侧，能读盘）
├── lib/
│   ├── zip.mjs            极简 ZIP 只读解析（store + deflate，拦路径越界）
│   ├── inventory.mjs      判型、校验、摘要、去重与版本
│   ├── rewrite.mjs        四种 protocol × 四种模式的 system 改写
│   └── state.mjs          快照落盘（state/catalog.json + page/catalog.js）
├── page/                  插件页：index.html / app.js / style.css / icon.*
├── preview/               本地预览：mock 宿主 + 演示快照（只给人看界面）
├── tools/scan.mjs         离线清点（预览与真机同一条路径）
└── tests/                 node --test：判型、校验、改写、选人、快照
```

## 本地预览

```bash
node preview/serve.mjs --demo     # http://127.0.0.1:55133
```

预览用 mock 宿主把真实的 `page/index.html` 放进一个帧里，主题跟随 magpie 的变量名：
`?theme=dark`（默认）/ `?theme=light`；`?row=1` 预选第几条，方便看检查器。
不带 `--demo` 时读的是真机生成的 `page/catalog.js`。

## 开发

```bash
# 测试（36 个用例：判型/校验/改写/选人/快照/钩子端到端/options 回读）
node --test --test-isolation=none "tests/*.test.mjs"

# 离线清点，看看本机 purge 目录里都认得什么
node tools/scan.mjs --sources "D:\purge" --sources "~/.agent-purge"

# 只打条目表到 stdout（不写文件）
node tools/scan.mjs --json
```

> `npm test` 用 `--test-isolation=none`：Windows 沙箱下 `node --test` 默认要开子进程管道，
> 会被拦成 `spawn EPERM`。

## 与上游的差别

| 项 | agent-purge 的 `magpie-plugin/` | 本插件 |
| --- | --- | --- |
| 来源 | 只读 `~/.agent-purge/` | 可配多个目录 + `state/imports` |
| 判型 | 只有人设 markdown | 导出包 / DSH 插件包 / 人设 / 技能 / 文本 / 清单 |
| 注入 | 一个人设 | 人设 + 显式启用的技能 |
| 页面 | 人设选择 + 导入 | 条目列表 + 检查器 + 模式 + 回滚 + 校验记录 |
| 快照 | 生成脚本写 `personas.js` | 后端每次扫描写 `catalog.js`，页面不读盘 |
| 版本 | 无 | 同 id 新摘要算新版本，留两版可回滚 |

## 许可

MIT。上游 agent-purge 的 MIT 文本与版权行原样保留在 [`LICENSE`](LICENSE) 与
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 里。