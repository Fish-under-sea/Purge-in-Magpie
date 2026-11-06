# magpie-purge

把**本地 purge 目录**当成 magpie 的「自由插件与技能源」：清点、校验、分类、去重、回滚，
再按模式把选中的人设与技能写进经过 magpie 网关的 agent 请求。

它是 magpie 的**页面插件 + 网关钩子**单包，不是 FISH Dock 插件，不依赖任何宿主补丁。

| | |
| --- | --- |
| npm | [`@fish-under-sea/magpie-purge`](https://www.npmjs.com/package/@fish-under-sea/magpie-purge) |
| 仓库 | <https://github.com/Fish-under-sea/magpie-purge> |
| 侧栏名字 | 破甲 · Purge（`magpie.page.titles`） |
| 许可 | MIT |

## 致谢

- **[ZiChuanLan/agent-purge](https://github.com/ZiChuanLan/agent-purge)** — 作者 **ZiChuanLan**，MIT。
  本插件的四种 protocol 落点、`off`/`strict`/`replace`/`append` 模式语义、块结构保留、
  `stripIdentity` 去身份策略都来自它；`magpie-plugin/` 子目录是这条链的起点。没有它就没有这个包。
- **[yetone/magpie](https://github.com/yetone/magpie)** — 页面插件与异步网关钩子的宿主契约
  （`magpie.page` / `magpie.options` / `page/_magpie/bridge.js` / `onRequest(body, ctx)`）由 magpie 提供。
- **本机 `dsh-purge` 红队技能库** — 内置的 9 位专家由它的 23 份原子技能（`skills/redteam/`）提炼而来，
  逐条注明原文件。底座人设 `大肥鱼` 是为本插件新写的（v2 起替代了原先内化的 Prompt Forge）。

完整来源与改动范围见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)；上游 MIT 原文原样保留在
[`LICENSE`](LICENSE) 里（Copyright (c) 2026 ZiChuanLan）。

## 上游到底给了一套什么提示词

一句话：**agent-purge 不提供「破甲提示词」，它提供的是把人设送进 system 的那套管道。**

上游仓库里与「提示词」有关的只有两样东西，都不是越狱载荷：

**① 一份起步模板 `lib/templates/personas/neutral.md`（1115 字节）**，正文就三段：

| 段落 | 内容 |
| --- | --- |
| 语言与格式 | 简体中文；先给结论再给依据；命令、路径、标识符保持原样 |
| 工作方式 | 先读再改、最小改动、有证据再下结论（没验证的标 `[INFERENCE]`）、卡住时给具体信息 |
| 边界 | 技术细节该给就给；不确定就说不确定，不编造 |

它自己的 README 也写明：**「软件本身不提供、不分发任何用于越狱、对抗安全审查或侵犯第三方权益的提示词载荷。」**

**② 改写逻辑本身**（`magpie-plugin/hooks.js` + `lib/rewrite.mjs`）。这才是上游真正的东西，也是本插件对齐的对象：

| 语义 | 上游怎么做 | 我们怎么做 |
| --- | --- | --- |
| 四种落点 | `anthropic` 的 `system` 块、`chat` 的 `system/developer` 消息、`responses` 的 `instructions`、`gemini` 的 `systemInstruction.parts` | 一致 |
| 块结构 | Anthropic 保留 `cache_control` 等非文本块（拍平会让客户端缓存断点失效、每轮重新计费） | 一致 |
| 去身份 | 只删「一行里同时有自称 + 点名模型/厂商」的行；名字表覆盖 21 个宿主 | 一致（这一版补齐了漏掉的 6 个：OpenCode / ZCode / CodeBuddy / Hermes / Grok / Antigravity） |
| 模式 | `off` / `strict` / `replace` / `append` | 一致 |
| `append` 位置 | **人设在前**（与它 CLI 的后置相反，插件 README 明确点出这个差异） | 一致 |
| 每次读盘 | 只在 `state.json` 与人设文件 mtime 变了才读；1 秒预算 | 我们每请求读一次（文件很小），换来「换人设下一请求立刻生效」 |
| 失败处理 | fail-open，`ctx.report('invalid')` 后原样放行 | 一致 |
| 回滚 | 用完整请求的 JSON 做键，只回滚自己确切产出的那一版 | 一致 |

**我们多做的两件事**（上游没有）：

- **技能段**：上游只注入一个人设；我们把显式启用的技能按 `## 技能：<名字>` 拼在人设后面。
- **多来源与内置包**：上游只读 `~/.agent-purge/`，人设列表靠 `gen-personas.mjs` 生成静态 `page/personas.js`；我们扫多个目录、内置 9 位专家，页面不读盘。

**所以「打磨提示词」这件事的真实边界**：能打磨的是**注入通道**（落点、去身份、拼接顺序、预算），
不是**内容**——内容是你自己写的人设与技能。本插件的 9 位专家与底座人设「大肥鱼」属于「内容」，随包分发；
上游的 `neutral.md` 属于「起步内容」，我们没抄它，因为它只是一个最小骨架，不是这个插件的价值所在。

## 内置专家技能包

装好就有，不用去别处找 md 再导入。`skills/` 里是 9 位专家，`personas/` 里是 1 份人设，随包分发、
随包更新；它们在页面里带「内置」标，可启用可停用，但删不掉（不是用户导入的）。

| 专家 | 管什么 | 原文来源 |
| --- | --- | --- |
| **交战指挥** `engagement-lead` | 开工前置、资源要齐、降级口径、按阶段调度其余八位 | `redteam-setup` |
| **侦察测绘专家** `recon-specialist` | 被动源 + FOFA 测绘 + ProjectDiscovery 流水线 → 资产全景 | `passive-recon`、`active-scan`、`web-fingerprint`、`asset-correlation`、`recon-pipeline`、`fofa-recon` |
| **入口猎手** `entry-hunter` | 目录爆破找后台/备份/泄露，浏览器自动化抓 SPA 与接口 | `dir-bruteforce`、`browser-automation`、`kimi-webbridge` |
| **漏洞打击专家** `vuln-striker` | nuclei 模板化检测：按指纹选模板、按回显判真伪 | `nuclei-scan` |
| **凭据攻坚专家** `credential-breaker` | 在线爆破（含锁号风险控制）与离线破解、字典策略 | `credential-attack` |
| **隧道工程专家** `tunnel-engineer` | suo5 / chisel / frp / 代理池的选型与落地 | `suo5-tunnel`、`chisel-tunnel`、`frp-tunnel`、`cn-proxy-pool` |
| **载荷投送专家** `payload-delivery` | 反弹 shell 选型、VPS 中转、加密 WebShell | `shell-handler`、`vps-reverse-shell`、`webshell-toolkit` |
| **内网横向专家** `intranet-pivot` | fscan / gogo / Impacket，低噪与发包可控 | `fscan-intranet`、`gogo-intranet`、`lateral-movement` |
| **成人提示词专家** `nsfw-prompt-smith` | 出图给参数头 + 标签栈 + 变体，出文给场景卡 + 节拍表（角色一律成年） | `nsfw-prompt-gen`（收窄为成年） |
| **大肥鱼**（人设 · 底座） | 不绑定任务：定语气、证据标准与交付形态；后面挂几位专家，就按它们各自的范围接起来 | 为本插件新写 |

用法：页面上挑一条，点「启用」，它就会按你的模式拼进 system（人设在前，技能按
`## 技能：<名字>` 分段）。

**大肥鱼**是**底座人设**（frontmatter 里 `default: true`）：你没选人设时由它顶上，
它本身不含任何具体打法，只规定「怎么读后面的技能段」。所以三种用法都成立：

| 用法 | 结果 |
| --- | --- |
| 只挂一位专家 | 大肥鱼 + 那一位。底座说清边界，专家补能力 |
| 九位一起挂 | 大肥鱼先找「交战指挥」当调度者，其余各管一段 |
| 一位也不挂 | 只有大肥鱼，就是通用协作 |

其他内置人设（不带 `default`）**不会**被自动选中——不点名就注入，等于偷偷改你的 system。

提炼原则：不复制原文，按「一条作业线一位专家」重写——每位只留**判据、命令骨干、交接边界、纪律**四块，
把散在 23 份文件里的同名坑收成一处。

## 它解决什么

`agent-purge` 的 magpie 插件只认 `~/.agent-purge/` 的人设，页面也不能读盘。
本插件把这条链补成三件事：

1. **来源可以是任意目录**：默认 `~/.magpie/purge`（用 `PURGE_HOME` 可改），也能在页面里改成多个目录；
2. **认得四种东西**：DSH 会话导出包（`dsh-session-archive`）、DSH cordis 插件包、
   人设 / 技能 markdown、裸文本与 JSON 清单——坏包给出具体拒绝原因，不半途落盘；
3. **页面能调配**：条目列表、检查器、模式、启用、版本回滚、校验记录、最近一次生效记录。

## 安装

```bash
# 从 npm
magpie plugin add @fish-under-sea/magpie-purge

# 或从本仓目录
git clone https://github.com/Fish-under-sea/magpie-purge
magpie plugin add "./magpie-purge"
magpie plugin list
```

装好后 magpie 的侧栏会多出一页「破甲 · Purge」；插件页第一次打开时，后端会扫一遍来源目录，
写出 `state/catalog.json` 与 `page/catalog.js` 两份快照，页面读的是后者。

## 配置

设置写进 magpie 的 `plugins.json`（`magpie.options`），页面上改，别手改文件也行：

| 字段 | 作用 |
| --- | --- |
| `mode` | `off` / `strict` / `replace` / `append`；**留空就是 off**（不注入） |
| `persona` | 用哪条人设的 id；留空取标了 `default` 的底座人设，再留空取第一个启用的人设 |
| `agents` | 只对这些 magpie agent 生效，如 `["claude","codex"]`；空数组 = 全部 |
| `enabled` | `{条目id: true/false}`：技能必须显式为 `true` 才注入；人设默认启用 |
| `pinned` | `{条目id: 摘要}`：固定到某一版，网关用那一版的正文 |
| `sources` | 来源目录列表；空数组用默认的 `~/.magpie/purge` |
| `imports` | 页面写的导入请求（`{op, path, at}`），后端处理后复制进 `state/imports` |
| `inline` | 页面里直接贴进来的人设/技能正文，不进磁盘 |
| `gatewayTimeoutMs` | 钩子预算，默认 1500 ms（magpie 侧 100–10000） |
| `useAgentPurge` | 默认 `false`。设为 `true` 才去读 agent-purge 的 `state.json`，见下 |

### 想读 agent-purge 的设置？（默认关）

默认**不读** `~/.agent-purge/`：装了这个插件的人未必装过上游，静默去翻别人的目录，
会让「我什么都没配，怎么 system 被换了」变成真的。要用就显式打开：

```bash
magpie plugin options magpie-purge '{"useAgentPurge":true}'
```

打开后按四层取，先到先得：

| 层 | `mode` | `persona` |
| --- | --- | --- |
| 1 | 插件页选过的值 | 插件页选过的人设 |
| 2 | `override[agent].mode` → `default.mode` | `override[agent].persona` → `state.persona` |
| 3 | 兜底 `off` | 标了 `default` 的底座人设 |
| 4 | — | 第一个启用的人设 |

上游 `disabledHarnesses` 含这个 agent、或 `default.mode` 是 `off` 时，本插件一样不做——
页面的状态条会写明「agent-purge 里关掉了这个 harness」。没打开 `useAgentPurge` 时这一层整段不存在。

指向的人设不在来源里时，**不会偷偷换成别人**：状态条直接说「指定的 X 不在当前来源里」。

模式语义与上游一致：

- `off`：不动请求；
- `strict`：整段可控 system 换成人设——**原 system 里的工具说明文本也会一起没了**；
- `replace`：人设放最前，宿主 system 里「自称 + 点名模型/厂商」的行删掉（近似）；
- `append`：人设放最前，宿主 system 原样保留。

## 页面怎么告诉你「到底注不注」

页面顶部那条状态就是答案，三种样子：

- **绿点**「下一次 agent 请求会注入「大肥鱼」」+ 模式与人设的来源（本页设置 / 底座人设）；
- **红点**「现在不会注入：请求原样放行」+ 具体原因 + 一个能点的下一步（「用 replace 开始注入」/「去看人设」/「导入一份人设」）；
- 底部「最近一次生效」：真跑过就写人设、技能、字符数；被放行就写**为什么**放行。

导入的 `.zip` 是素材（会话导出包、DSH 插件包），**不会进 system**——检查器里会直说，别把素材当人设。

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
├── skills/                9 位内置专家（随包分发，一位专家一个 .md）
├── personas/              内置底座人设（大肥鱼，不绑定任务）
├── lib/
│   ├── zip.mjs            极简 ZIP 只读解析（store + deflate，拦路径越界）
│   ├── inventory.mjs      判型、校验、摘要、去重与版本
│   ├── rewrite.mjs        四种 protocol × 四种模式的 system 改写
│   ├── agentpurge.mjs     读 agent-purge 的 state.json（原生语义）
│   ├── plan.mjs           三层优先级：这次注不注、注谁、为什么没注
│   ├── bundled.mjs        读包内 skills/ 与 personas/，标 builtin
│   └── state.mjs          快照落盘（state/catalog.json + page/catalog.js）
├── page/                  插件页：index.html / app.js / style.css / icon.*
│   ├── icon.svg           侧栏与页面标签的图标（空心盾牌）
│   └── card.png           插件卡片的图（由 tools/card-icon.mjs 内联进 package.json）
├── preview/               本地预览：mock 宿主 + 演示快照 + 单文件 purge-preview.html
├── tools/
│   ├── scan.mjs           离线清点（预览与真机同一条路径）
│   ├── build-preview.mjs  把整页压成单文件 HTML（双击就能看）
│   └── card-icon.mjs      把 page/card.png 内联进 magpie.icon（data URI）
└── tests/                 node --test：判型、校验、改写、选人、快照、内置包
```

## 两个图标，别混

magpie 的两个 icon 键管的是不同地方，改错一个就会影响另一个：

| 键 | 显示在哪 | 值 |
| --- | --- | --- |
| `magpie.icon` | 插件**卡片** | **必须是 `https://` 或 `data:image/`**——magpie 的 `iconOf()` 会直接丢掉相对路径 |
| `magpie.page.icon` | **侧栏**标签与页面 tab | 可以是包内相对路径 |

所以卡片图走 `tools/card-icon.mjs` 内联成 data URI（约 41 KiB），侧栏仍是 `page/icon.svg` 的空心盾牌。
换了卡片图就重跑一次脚本；`npm run prepack` 会顺带校验。

## 预览整个界面

两种，看你要给谁看。

**① 单文件，双击就开**（给人看界面时用这个）：

```bash
node tools/build-preview.mjs      # → preview/purge-preview.html
```

生成物是**一个 HTML 文件**，CSS、JS、mock 桥、演示快照全部内联，没有任何外部依赖——
双击直接打开，不用起服务、不用开端口。顶部有主题与状态两个开关：

| 参数 | 作用 |
| --- | --- |
| `#theme=dark` / `#theme=light` | 深色 / 浅色 |
| `#snap=ready` / `#snap=blocked` | 就绪那一屏 / 什么都没就绪那一屏 |
| `#row=0` | 直接打开第几条的详情（0 起） |

例：`preview/purge-preview.html#theme=light&snap=blocked`

**② 起服务，改完自动刷新**（调 UI/UX 时用这个）：

```bash
npm run preview:serve            # → http://127.0.0.1:55172
```

用 mock 宿主把真实的 `page/index.html` 放进一个帧里，主题跟随 magpie 的变量名：
`?theme=dark`（默认）/ `?theme=light`。

改完 `page/` 里的文件**会自动重载**——服务监听这些文件，通过 `/_reload` 推一条消息给页面，
帧自己换 src。不用手点刷新，也不用手动重建。嫌它太勤？加 `?watch=0` 关掉。

| 参数 | 作用 |
| --- | --- |
| `?theme=dark` / `?theme=light` | 深色 / 浅色 |
| `?row=0` | 预选第几条，直接看检查器（0 起） |
| `?watch=0` | 关掉热重载 |

默认**不预选任何条目**——右栏默认显示「注入组装」，那是最该看的一屏。
不带 `--demo` 时读的是真机生成的 `page/catalog.js`；`--demo=blocked` 是「什么都没就绪」那一屏。

> 热重载靠一条常开的 SSE 连接。用无头浏览器截图时会一直等不到网络空闲，
> 截图命令记得带 `?watch=0`。

单文件是**派生文件**：改完 `page/` 要重新跑一次 `build-preview`，别手改它。
`npm run prepack` 会顺手重建，所以发布包里那份总是最新的。

## 页面怎么排的

一屏三段，按「先看结论、再动手、最后翻细节」：

1. **顶部一行状态条**：绿点 / 红点 + 「这次注不注、注谁」+ 一个能点的下一步，最该被看见的放最上面；
2. **左列表 / 右组装**：左边按「内置专家」与「我的来源」分组；右栏平时显示**注入组装**——
   把这次会拼成的 system 摊成按顺序的积木（人设 → 技能 → 宿主原文），选中条目时切成详情；
3. **底部四块折叠**：导入与来源 / 校验记录 / 最近一次生效 / 边界。平时只占一行，
   不把「声明」和「导入表单」顶在首屏。

样式只吃 magpie 的主题变量（`--magpie-*`），跟随宿主明暗；语义色只留三类
（人设 / 技能 / 素材），其余交给墨色与分隔线。

## 开发

```bash
# 测试（68 个用例：判型/校验/改写/选人/快照/钩子端到端/options 回读/agent-purge 语义/注入判定/控制面过滤/内置专家包）
node --test --test-isolation=none "tests/*.test.mjs"

# 离线清点，看看本机 purge 目录里都认得什么
node tools/scan.mjs --sources "D:\purge" --sources "~/.magpie/purge"

# 只打条目表到 stdout（不写文件）
node tools/scan.mjs --json
```

> `npm test` 用 `--test-isolation=none`：Windows 沙箱下 `node --test` 默认要开子进程管道，
> 会被拦成 `spawn EPERM`。

## 与上游的差别

| 项 | agent-purge 的 `magpie-plugin/` | 本插件 |
| --- | --- | --- |
| 来源 | 只读 `~/.agent-purge/` | 可配多个目录 + `state/imports` + 内置专家包 |
| 判型 | 只有人设 markdown | 导出包 / DSH 插件包 / 人设 / 技能 / 文本 / 清单 |
| 注入 | 一个人设 | 人设 + 显式启用的技能（含 9 位内置专家） |
| 页面 | 人设选择 + 导入 | 条目列表 + 检查器 + 模式 + 回滚 + 校验记录 |
| 快照 | 生成脚本写 `personas.js` | 后端每次扫描写 `catalog.js`，页面不读盘 |
| 版本 | 无 | 同 id 新摘要算新版本，留两版可回滚 |
| 与 agent-purge 的关系 | 读 `state.json` 但页面改不了模式 | **认它的 state.json**（mode/persona/overrides/disabledHarnesses），同时页面设置优先，两边都能改 |
| 状态可见性 | 无 | 顶部状态条直接回答「注不注、注谁、为什么没注」 |

## 版本

| 版本 | 要点 |
| --- | --- |
| `0.4.0` | 底座人设 `大肥鱼` 取代 Prompt Forge：不绑定任务，0–9 位专家随意组合；默认不再读上游 `state.json`（要读设 `useAgentPurge:true`）；默认来源只剩 `~/.magpie/purge`；模式下拉去掉「跟随上游」 |
| `0.3.0` | 内置 9 位专家技能包（由本机 `dsh-purge` 的 23 份原子技能提炼）；内置条目带「内置」标、可停用不可删 |
| `0.2.0` | 认 agent-purge 的 `state.json`（原生语义）；页面加「当前注入」状态条与可点的下一步；导入素材后不再一头雾水 |
| `0.1.2` | README 版本表 |
| `0.1.1` | 修掉「没流量时插件页是空的」：钩子模块加载时先从 `plugins.json` 读回自己的 options 再预热扫描 |
| `0.1.0` | 首个版本 |

## 许可

MIT。上游 agent-purge 的 MIT 文本与版权行原样保留在 [`LICENSE`](LICENSE) 与
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 里。