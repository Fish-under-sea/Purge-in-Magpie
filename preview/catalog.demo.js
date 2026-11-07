// 演示快照（预览用）：只保留元数据，正文不入库也不落盘。
// 真机同理——正文在所有落盘文件里都被摘掉，注入时才从原文件现读。
window.PURGE_CATALOG = {
  "version": 12,
  "generatedAt": 1794561661000,
  "sources": [
    {
      "path": "（包内）personas + skills",
      "ok": true,
      "count": 23,
      "error": "",
      "bundled": true
    },
    {
      "path": "state/imports",
      "ok": true,
      "count": 2,
      "error": ""
    }
  ],
  "entries": [
    {
      "id": "dafeiyu",
      "name": "大肥鱼",
      "kind": "persona",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）personas",
        "rel": "dafeiyu.md"
      },
      "size": 3944,
      "digest": "29d729efcc370561",
      "importedAt": 0,
      "version": 1,
      "default": true,
      "meta": {
        "format": "bundled",
        "description": "国产模型的协作底座：定语气、证据标准与交付形态，不绑定具体任务；后面挂哪位专家就补哪块能力，挂几位就按它们的顺序各管一段。削弱版——保留自己的判断，不做「无条件照做」的执行器。",
        "version": "2.1.0",
        "whenToUse": "每次会话都适用——只挂一位专家、多位一起挂，或者谁都不挂只做日常问答",
        "source": "为本插件新写（v2 起替代原先的任务型人设；v2.1 标明削弱版身份）"
      },
      "chars": 1273,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "fofa-recon",
      "name": "FOFA 测绘",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "FOFA 测绘.md"
      },
      "size": 8102,
      "digest": "32fc8928f8f13771",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "用 FOFA API 批量测绘靶标资产（域名/IP/端口/标题/指纹）；内置限速客户端，严格单线程 + 最小间隔 + 退避重试，避免触发 45012",
        "version": "1.0.0",
        "whenToUse": "信息收集阶段需要快速铺开某单位/域名的互联网资产面时",
        "source": "dsh-purge 的 fofa-recon 技能（原文照搬）"
      },
      "chars": 6319,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "vps-reverse-shell",
      "name": "VPS 中转",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "VPS 中转.md"
      },
      "size": 9514,
      "digest": "e125f6e4198ac1f8",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "用自建 VPS（<你的VPS_IP>，SSH 私钥登录）做反弹 Shell 落地与中转：9000-9999 端口监听、非交互会话驱动、载荷投递、反向隧道",
        "version": "1.0.0",
        "whenToUse": "目标无法回连本机 / 需要公网固定监听端口 / 需要长期在线跳板 / 需要让智能体自己下发命令到反弹 Shell",
        "source": "dsh-purge 的 vps-reverse-shell 技能（原文照搬）"
      },
      "chars": 6088,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "web-fingerprint",
      "name": "Web 指纹识别",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "Web 指纹识别.md"
      },
      "size": 1047,
      "digest": "21cd2c436cfacce4",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "Web 服务指纹识别：框架、中间件、CMS、组件版本",
        "version": "1.0.0",
        "whenToUse": "已发现 HTTP/HTTPS 服务，需要识别技术栈时",
        "source": "dsh-purge 的 web-fingerprint 技能（原文照搬）"
      },
      "chars": 501,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "webshell-toolkit",
      "name": "WebShell 工具集",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "WebShell 工具集.md"
      },
      "size": 6218,
      "digest": "3e7a3e2089fcd65c",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "冰蝎 / 哥斯拉 / 中国蚁剑 的启动与用法，用于上传并管理 WebShell、维持访问、操作目标服务器",
        "version": "1.0.0",
        "whenToUse": "已获得上传点/文件写入/命令执行，需要落地并操作 WebShell 时",
        "source": "dsh-purge 的 webshell-toolkit 技能（原文照搬）"
      },
      "chars": 3613,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "chisel-tunnel",
      "name": "chisel 隧道",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "chisel 隧道.md"
      },
      "size": 6151,
      "digest": "8be0036eee130282",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "chisel 隧道：HTTP/WebSocket 封装的多路复用隧道，最易穿透出网限制与反向代理",
        "version": "1.0.0",
        "whenToUse": "suo5 不适用（非 WebShell 入口）、目标只能出 HTTP、需要端口转发或稳定 SOCKS 时",
        "source": "dsh-purge 的 chisel-tunnel 技能（原文照搬）"
      },
      "chars": 3728,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "frp-tunnel",
      "name": "frp 隧道",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "frp 隧道.md"
      },
      "size": 6340,
      "digest": "17195f449739f8c2",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "frp 内网穿透：在自有 VPS 上跑 frps，在目标上跑 frpc，得到稳定 socks5 与端口映射",
        "version": "1.0.0",
        "whenToUse": "已有命令执行/RCE 且目标可出网；需要长期稳定隧道、把内网端口映射给用户直接访问时",
        "source": "dsh-purge 的 frp-tunnel 技能（原文照搬）"
      },
      "chars": 4053,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "fscan-intranet",
      "name": "fscan 内网扫描",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "fscan 内网扫描.md"
      },
      "size": 9153,
      "digest": "4c25aaae5558b2cd",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "fscan v2.2.1 内网综合扫描：存活探测、端口/服务识别、28 类弱口令爆破、未授权访问与高危漏洞（MS17-010/SMBGhost）、Redis 利用与 SOCKS5 隧道",
        "version": "1.0.0",
        "whenToUse": "进入内网（跳板机/WebShell/socks5 隧道）后快速铺开资产面、找弱口令与未授权、把可达性变成可打点",
        "source": "dsh-purge 的 fscan-intranet 技能（原文照搬）"
      },
      "chars": 5958,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "gogo-intranet",
      "name": "gogo 内网测绘",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "gogo 内网测绘.md"
      },
      "size": 9879,
      "digest": "c5615b3060f152a6",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "gogo v2.15.0 高性能内网扫描引擎：智能/超智能模式、主动+被动指纹、关键信息提取（title/cert/JWT/邮箱/身份证）、nuclei 模板 POC、发包可控低噪声",
        "version": "1.0.0",
        "whenToUse": "进入内网后对大网段（/16 /12）快速测绘、要指纹与关键信息、需要尽量少发包不被发现",
        "source": "dsh-purge 的 gogo-intranet 技能（原文照搬）"
      },
      "chars": 6556,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "nuclei-scan",
      "name": "nuclei 扫描",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "nuclei 扫描.md"
      },
      "size": 6325,
      "digest": "efaaa94ef2fd84c5",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "nuclei 模板化漏洞扫描：13,000+ 模板覆盖 CVE/暴露面/配置缺陷/默认口令，Nday 与 1day 的主力检测手段",
        "version": "1.0.0",
        "whenToUse": "漏洞发现阶段拿到存活资产清单后，做 Nday/1day 批量检测；或已知组件版本想快速确认是否有现成模板",
        "source": "dsh-purge 的 nuclei-scan 技能（原文照搬）"
      },
      "chars": 3785,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "suo5-tunnel",
      "name": "suo5 隧道",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "suo5 隧道.md"
      },
      "size": 3334,
      "digest": "45e060fc9583d711",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "用 suo5 通过 WebShell/HTTP 建立 SOCKS5 隧道，把内网流量代理出来（内网突破核心工具）",
        "version": "1.0.0",
        "whenToUse": "已拿到一台机器（WebShell/RCE）需要进入内网扫描与横向时",
        "source": "dsh-purge 的 suo5-tunnel 技能（原文照搬）"
      },
      "chars": 2010,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "active-scan",
      "name": "主动扫描",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "主动扫描.md"
      },
      "size": 1818,
      "digest": "72ad33837db0ae25",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "主动端口与服务扫描（nmap/masscan），严格遵守授权范围",
        "version": "1.0.0",
        "whenToUse": "需要确认资产存活与开放端口时",
        "source": "dsh-purge 的 active-scan 技能（原文照搬）"
      },
      "chars": 1136,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "recon-pipeline",
      "name": "侦察流水线",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "侦察流水线.md"
      },
      "size": 6161,
      "digest": "bcca900a9d96e9df",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "ProjectDiscovery 信息收集流水线：subfinder→dnsx→naabu→httpx→katana 一键铺开域名资产面",
        "version": "1.0.0",
        "whenToUse": "信息收集阶段拿到域名/单位名后，系统化铺开子域→解析→端口→存活→页面与接口",
        "source": "dsh-purge 的 recon-pipeline 技能（原文照搬）"
      },
      "chars": 3890,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "credential-attack",
      "name": "凭据攻击",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "凭据攻击.md"
      },
      "size": 8853,
      "digest": "fa6ec7ad2a1f2c82",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "凭据攻击：在线弱口令爆破（hydra）与离线哈希破解（hashcat/john），覆盖 SSH/FTP/RDP/SMB/数据库/Web 后台",
        "version": "1.0.0",
        "whenToUse": "发现登录入口（Web 后台/SSH/FTP/RDP/SMB/MySQL/MSSQL/Redis）需要试口令；或已拿到哈希/密文需要还原明文",
        "source": "dsh-purge 的 credential-attack 技能（原文照搬）"
      },
      "chars": 5338,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "shell-handler",
      "name": "反弹 Shell 处理",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "反弹 Shell 处理.md"
      },
      "size": 8018,
      "digest": "6cdbac20439dd5f2",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "反弹 Shell 与载荷投递：VPS 上起 MSF/nc/socat 监听接收 shell，或从目标主动拉取载荷落地",
        "version": "1.0.0",
        "whenToUse": "需要 RCE/命令执行回连、投递后续载荷、把一次性命令执行变成可交互会话时",
        "source": "dsh-purge 的 shell-handler 技能（原文照搬）"
      },
      "chars": 5420,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "cn-proxy-pool",
      "name": "国内代理池",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "国内代理池.md"
      },
      "size": 5025,
      "digest": "b45dc0a72ce76b27",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "国内免费 HTTP/SOCKS5 代理池：抓取、验活、按需轮换；只用命令级代理参数，绝不改动本机网络与代理配置",
        "version": "1.0.0",
        "whenToUse": "目标有 WAF/封 IP 风险，或需要高频请求（接口爆破、目录扫描、口令喷洒）时",
        "source": "dsh-purge 的 cn-proxy-pool 技能（原文照搬）"
      },
      "chars": 3439,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "lateral-movement",
      "name": "横向移动",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "横向移动.md"
      },
      "size": 8070,
      "digest": "51503d948d447eed",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "内网横向与提权：Impacket 套件（PtH/PsExec/WMI/DCOM/Kerberos/凭据转储）+ enum4linux/smbclient 信息枚举",
        "version": "1.0.0",
        "whenToUse": "已进内网，需要用已有凭据或哈希横向到其它主机、枚举域环境、dump 凭据、找域控路径",
        "source": "dsh-purge 的 lateral-movement 技能（原文照搬）"
      },
      "chars": 5189,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "kimi-webbridge",
      "name": "浏览器桥接",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "浏览器桥接.md"
      },
      "size": 5885,
      "digest": "845e9d0097708cb2",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "用月之暗面 Kimi 浏览器扩展（WebBridge）驱动用户真实 Chrome/Chromium：导航、读取页面、点击、填表、执行 JS、截图",
        "version": "1.0.0",
        "whenToUse": "需要复用浏览器登录态访问后台/需要 JS 渲染的页面/需要真实浏览器指纹时",
        "source": "dsh-purge 的 kimi-webbridge 技能（原文照搬）"
      },
      "chars": 3937,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "browser-automation",
      "name": "浏览器自动化",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "浏览器自动化.md"
      },
      "size": 4482,
      "digest": "65694fe21f80954b",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "无依赖驱动 Chrome/Chromium 抓取 JS 渲染页面、截图、执行 JS、抓接口清单（headless 兜底 + playwright-cli）",
        "version": "1.0.0",
        "whenToUse": "需要渲染 SPA / 取 JS 生成的内容 / 截图留证 / 批量抓页面时（Kimi 扩展不可用时首选）",
        "source": "dsh-purge 的 browser-automation 技能（原文照搬）"
      },
      "chars": 3307,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "redteam-setup",
      "name": "环境准备",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "环境准备.md"
      },
      "size": 6808,
      "digest": "53fcc0e5b1a12467",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "首次使用引导：引导提供 FOFA_KEY 与 VPS 登录方式、验证通道可用、给出降级口径（工具链由工具箱附件按需获取）",
        "version": "1.0.0",
        "whenToUse": "用户第一次使用红队模式时；或 redteam_preflight 报出 onboarding.incomplete / 有技能 broken 时；或用户说\"环境没配好\"\"工具装一下\"",
        "source": "dsh-purge 的 redteam-setup 技能（原文照搬）"
      },
      "chars": 3531,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "dir-bruteforce",
      "name": "目录爆破",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "目录爆破.md"
      },
      "size": 6687,
      "digest": "87bb01b857753d58",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "目录与文件爆破：后台入口、备份文件、配置泄露、源码与版本库暴露（ffuf/feroxbuster/dirsearch/gobuster）",
        "version": "1.0.0",
        "whenToUse": "已确认 Web 存活但指纹无直接 Nday 线索；需要找后台入口、备份、配置、源码、上传点等隐藏路径",
        "source": "dsh-purge 的 dir-bruteforce 技能（原文照搬）"
      },
      "chars": 4423,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "passive-recon",
      "name": "被动信息收集",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "被动信息收集.md"
      },
      "size": 795,
      "digest": "0a1e2a07a4f298b8",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "被动信息收集：不接触目标主机，仅使用公开数据源",
        "version": "1.0.0",
        "whenToUse": "需要在不暴露自身的情况下收集目标资产情报时",
        "source": "dsh-purge 的 passive-recon 技能（原文照搬）"
      },
      "chars": 325,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "asset-correlation",
      "name": "资产关联",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "（包内）skills",
        "rel": "资产关联.md"
      },
      "size": 600,
      "digest": "fd51b26865b511ae",
      "importedAt": 0,
      "version": 1,
      "meta": {
        "format": "bundled",
        "description": "资产关联：域名↔IP↔C 段↔证书↔服务的图谱化",
        "version": "1.0.0",
        "whenToUse": "信息收集阶段性收口，需要形成资产关系视图时",
        "source": "dsh-purge 的 asset-correlation 技能（原文照搬）"
      },
      "chars": 199,
      "injectable": true,
      "builtin": true,
      "text": ""
    },
    {
      "id": "mine",
      "name": "我的技能",
      "kind": "skill",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "state/imports",
        "rel": "mine.md"
      },
      "size": 48,
      "digest": "de1a2b3c4d5e6f70",
      "importedAt": 1794561661000,
      "version": 1,
      "meta": {
        "format": "markdown",
        "description": "演示用的外来技能：正文从页面导入。"
      },
      "chars": 30,
      "injectable": true,
      "builtin": false,
      "text": ""
    },
    {
      "id": "5556",
      "name": "5556",
      "kind": "session-archive",
      "status": "ok",
      "reason": "",
      "source": {
        "root": "state/imports",
        "rel": "5556.zip"
      },
      "size": 177986,
      "digest": "948c5f9615e0c1d2",
      "importedAt": 1794561661000,
      "version": 1,
      "meta": {
        "format": "dsh-session-archive",
        "version": 1,
        "sessions": 1,
        "turns": 12,
        "cwd": "/root/comfy ui"
      },
      "chars": 0,
      "injectable": false
    }
  ],
  "rejected": [],
  "options": {
    "mode": "replace",
    "enabled": {
      "fofa-recon": true
    },
    "agents": []
  },
  "imports": [],
  "duplicates": [],
  "purge": {
    "bound": false,
    "mode": "",
    "persona": "",
    "disabled": [],
    "error": ""
  },
  "plan": {
    "mode": "replace",
    "modeFrom": "page",
    "personaId": "dafeiyu",
    "personaName": "大肥鱼",
    "personaFrom": "auto",
    "skills": [
      {
        "id": "fofa-recon",
        "name": "FOFA 测绘",
        "text": ""
      }
    ],
    "blocked": "",
    "blockedCode": "",
    "ready": true
  },
  "last": {
    "at": 1794561421000,
    "agent": "claude",
    "protocol": "anthropic",
    "model": "claude-sonnet-4.5",
    "mode": "replace",
    "persona": "dafeiyu",
    "skills": [
      "fofa-recon"
    ],
    "chars": 7592,
    "missingPin": [],
    "catalogVersion": 12
  }
};

// 预览开关：?unsent=1 把「最近一次生效」抹掉，好看到「开始注入」尚未按下的样子。
if (new URLSearchParams(location.search).get('unsent') === '1') {
  window.PURGE_CATALOG.last = null
}
