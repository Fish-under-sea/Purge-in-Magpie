// 破甲 · Purge 的页面逻辑。
//
// 页面在 magpie 的沙箱帧里：不能 fetch、读不到磁盘，只有三样东西可用——
//   1. window.PURGE_CATALOG：后端扫描后写下的快照（page/catalog.js）；
//   2. magpie.options.get/set：这个插件在 plugins.json 里的设置；
//   3. magpie.ready / onVisibility：主题与可见性。
// 所以页面只做「显示 + 改设置」，真正的清点与改写都在 hooks.js 那一侧。
;(() => {
  'use strict'

  const bridge = window.magpie
  const $ = (id) => document.getElementById(id)
  const KINDS = {
    'session-archive': { label: '会话导出包', cls: 'material' },
    'cordis-plugin': { label: 'DSH 插件包', cls: 'material' },
    persona: { label: '人设', cls: 'persona' },
    skill: { label: '技能', cls: 'skill' },
    manifest: { label: '清单', cls: 'material' },
    text: { label: '文本', cls: 'skill' },
  }
  /** 三类语义色：人设 / 技能 / 素材。六种类型各给一色会变成彩虹，信息量却没增加。 */
  const kindClass = (kind) => KINDS[kind]?.cls || 'material'
  /** builtinFolder 从内置条目的 root 里取出它所在的目录名（skills / personas）。 */
  const builtinFolder = (e) => String(e.source?.root || '').split(/[\\/]/).filter(Boolean).pop() || 'skills'
  const MODE_HELP = {
    off: '请求原样放行，什么也不改。',
    strict: '整段可控 system 换成人设；原 system 里的工具说明文本也会一起没了。',
    replace: '人设放最前，宿主 system 里「自称 + 点名模型/厂商」的行删掉。',
    append: '人设放最前，宿主 system 原样保留。',
  }
  /** MODE_SHORT 是下拉里模式名后面那一截：只够一格，别写成整句。 */
  const MODE_SHORT = {
    off: '不动请求',
    strict: '只留人设',
    replace: '去自称',
    append: '原样保留',
  }
  /** NOT_INJECTABLE 只说「它是什么」，下一步交给详情里的 callout，别两处都指路。 */
  const NOT_INJECTABLE = '素材条目：能查看、能归档，但不会写进 system。'

  let options = {}
  let catalog = window.PURGE_CATALOG ?? null
  let selected = ''
  let filter = ''
  let query = ''
  let saveTimer = 0
  let pendingSave = null
  let busy = false
  /** showingText 是「查看原文」的展开态；换条目时要收回去，否则新条目一进来就是展开的。 */
  let showingText = false
  /** confirmedSig 记「用户按下确认时的那套配置」；配置一变就失效，退回「确认注入」。 */
  let confirmedSig = ''
  /** modeMenuOpen 是模式下拉面板是否展开；每次重画都要记住，否则点一下就收。 */
  let modeMenuOpen = false

  // ---------- 小工具 ----------

  const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(n / 1024))} KiB`)
  const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false }) : '—')
  const short = (digest) => (digest ? String(digest).slice(0, 12) : '—')

  function say(text, tone = '') {
    const el = $('status')
    el.textContent = text
    el.dataset.tone = tone
    el.hidden = !text
    if (!text) return
    clearTimeout(say.timer)
    say.timer = setTimeout(() => { el.hidden = true }, 6000)
  }

  /** SVG_NS 是 svg 元素的命名空间：用 createElement 造出来的 <svg> 是 HTML 未知元素，不会渲染。 */
  const SVG_NS = 'http://www.w3.org/2000/svg'

  function el(tag, attrs = {}, ...kids) {
    const node = tag === 'svg' || tag === 'path'
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue
      if (k === 'class') node.setAttribute('class', v)
      else if (k === 'text') node.textContent = v
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v)
      else node.setAttribute(k, v === true ? '' : String(v))
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
    }
    return node
  }

  const entries = () => (Array.isArray(catalog?.entries) ? catalog.entries : [])
  const inlineEntries = () => (Array.isArray(options.inline) ? options.inline : [])
  const findEntry = (id) => entries().find((e) => e.id === id) || inlineEntries().find((e) => e.id === id) || null
  const isEnabled = (id) => (options.enabled?.[id] !== undefined ? options.enabled[id] : findEntry(id)?.kind === 'persona')

  // ---------- 与宿主说话 ----------

  /** save 把整份 options 写回magpie；options.set 每秒只收一次，这里攒 1.1 秒再发。 */
  function save(patch, note) {
    options = { ...options, ...patch }
    if (pendingSave) Object.assign(pendingSave, patch)
    else pendingSave = { ...patch }
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, 1100)
    if (note) say(note)
    render()
  }

  async function flush() {
    if (!pendingSave || !bridge?.options?.set) return
    const body = { ...options }
    pendingSave = null
    try {
      const saved = await bridge.options.set(body)
      if (saved && typeof saved === 'object') options = { ...body, ...saved }
    } catch (error) {
      say(`保存失败：${error?.message || error}`, 'bad')
    }
  }

  // ---------- 渲染 ----------

  function renderFilters() {
    const host = $('filters')
    const kinds = [...new Set(entries().map((e) => e.kind))]
    host.replaceChildren(
      el('button', { type: 'button', class: 'chip', 'aria-pressed': filter === '', onclick: () => { filter = ''; render() } }, `全部 ${entries().length}`),
      ...kinds.map((kind) => {
        const n = entries().filter((e) => e.kind === kind).length
        return el('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': filter === kind,
          onclick: () => { filter = filter === kind ? '' : kind; render() },
        }, `${KINDS[kind]?.label || kind} ${n}`)
      }),
    )
  }

  function visible() {
    const q = query.trim().toLowerCase()
    return entries()
      .filter((e) => (filter ? e.kind === filter : true))
      .filter((e) => (q ? `${e.name} ${e.id} ${e.source?.rel ?? ''} ${KINDS[e.kind]?.label ?? ''}`.toLowerCase().includes(q) : true))
      .concat(
        inlineEntries()
          .filter((e) => (filter ? e.kind === filter : true))
          .filter((e) => (q ? `${e.name} ${e.id}`.toLowerCase().includes(q) : true))
          .map((e) => ({
            ...e,
            status: 'ok',
            source: { rel: '页面导入（options）', root: 'inline' },
            size: 0,
            meta: { format: 'inline', description: '' },
            version: 1,
            chars: String(e.text || '').length,
            injectable: true,
            digest: '',
          })),
      )
  }

  function renderList() {
    const host = $('list')
    const rows = visible()
    if (!catalog) {
      host.replaceChildren(el('p', { class: 'empty', text: '还没有快照：后端没跑过扫描。点右上角「重新扫描」。' }))
      return
    }
    if (!rows.length) {
      host.replaceChildren(el('p', { class: 'empty', text: '没有匹配的条目。清掉搜索，或往来源目录里放点东西再扫一次。' }))
      return
    }
    // 分组比逐行挂「内置」胶囊干净：内置是「这一整组都随包来」，说一次就够。
    const groups = [
      { key: 'builtin', label: '内置专家与技能', rows: rows.filter((e) => e.builtin) },
      { key: 'mine', label: '我的来源', rows: rows.filter((e) => !e.builtin) },
    ].filter((g) => g.rows.length)

    const nodes = []
    for (const group of groups) {
      nodes.push(el('div', { class: 'group-head' },
        el('span', { text: group.label }),
        el('span', { class: 'n', text: String(group.rows.length) }),
      ))
      for (const e of group.rows) nodes.push(rowOf(e))
    }
    host.replaceChildren(...nodes)
  }

  /** rowOf 画一行条目；状态只用「未启用 / 已启用 / 拒绝」三种胶囊，不再叠「内置」。 */
  function rowOf(e) {
    const kind = KINDS[e.kind] || { label: e.kind }
    const badge = e.status === 'rejected'
      ? el('span', { class: 'badge reject', text: '拒绝' })
      : !e.injectable ? null
        : isEnabled(e.id) ? null : el('span', { class: 'badge off', text: '未启用' })
    return el('button', {
      type: 'button',
      class: 'row',
      role: 'option',
      'aria-selected': selected === e.id,
      onclick: () => {
        const next = selected === e.id ? '' : e.id
        // 换条目就收起原文：从一条展开着的详情跳到另一条，不该自动展示别人的正文。
        if (next !== selected) showingText = false
        selected = next
        render()
      },
    },
      el('span', { class: 'spine', style: `--spine:var(--kind-${kindClass(e.kind)})` }),
      el('span', {},
        el('span', { class: 'title' }, e.name, badge || null),
        el('span', { class: 'meta', text: `${kind.label} · ${e.builtin ? '随插件' : e.source?.rel ?? ''}` }),
      ),
      el('span', { class: 'side' }, e.version > 1 ? `v${e.version} ` : '',
        el('span', { class: 'meta', text: e.injectable ? `${e.chars || 0} 字` : fmtSize(e.size || 0) })),
    )
  }

  /**
   * renderAssembly 是右栏默认内容：把「这次会拼成什么」按顺序摊开。
   *
   * 为什么值得占这一整栏：这个插件的产物就是一段被拼起来的 system 文本，
   * 但它平时在请求里，用户看不见。摊开成积木（人设 → 技能 → 宿主原文），
   * 一眼能看出顺序对不对、谁没启用、总量吃不吃得下预算。
   */
  function renderAssembly() {
    const host = $('assembly')
    const plan = catalog?.plan
    const last = catalog?.last
    if (!plan) {
      host.replaceChildren(el('h2', {}, '注入组装'))
      host.append(el('p', { class: 'empty', text: '还没有判定：等后端第一次扫描。' }))
      return
    }
    const personaEntry = findEntry(plan.personaId)
    const skills = (plan.skills || []).map((s) => findEntry(s.id) || s)
    const total = (personaEntry?.chars || 0) + skills.reduce((n, s) => n + (s.chars || 0), 0)

    const rows = []
    if (plan.ready && personaEntry) {
      rows.push(stackRow('01', 'persona', personaEntry.name, personaEntry.meta?.description || '人设正文', `${personaEntry.chars || 0} 字`))
      skills.forEach((s, i) => rows.push(stackRow(String(i + 2).padStart(2, '0'), 'skill', s.name, s.meta?.description || '技能正文', `${s.chars || 0} 字`)))
      rows.push(el('div', { class: 'stack-row is-host' },
        el('span', { class: 'ord', text: String(skills.length + 2).padStart(2, '0') }),
        el('span', { class: 'body' },
          el('span', { class: 'name', text: '宿主自己的 system' }),
          el('span', { class: 'desc', text: plan.mode === 'strict' ? 'strict：整段换掉，不会保留' : '原样保留，接在上面这些之后' }),
        ),
        el('span', { class: 'size', text: plan.mode === 'strict' ? '—' : '保留' }),
      ))
    } else {
      rows.push(el('div', { class: 'stack-row is-empty' },
        el('span', { class: 'ord', text: '—' }),
        el('span', { class: 'body' },
          el('span', { class: 'name', text: '还没有可组装的内容' }),
          // 具体原因在顶部状态条里已经说过一遍，这里只说「这里将来会显示什么」，不重复。
          el('span', { class: 'desc', text: '按上面的提示处理后，这段会显示人设与技能的拼装顺序' }),
        ),
        el('span', { class: 'size', text: '' }),
      ))
    }

    host.replaceChildren(...[
      el('h2', {}, '注入组装',
        el('span', { class: 'h2-sub', text: plan.ready ? '下一次请求会拼成这段' : '这次放行，下面是原因' })),
      el('div', { class: 'stack-view' }, ...rows),
      el('div', { class: 'stack-foot' },
        el('span', { text: plan.ready ? `合计 ${total.toLocaleString('zh-CN')} 字符 · 预算 65,536` : `模式 ${plan.mode}` }),
        last?.at ? el('span', { text: last.skipped ? `上次 ${fmtTime(last.at)} · 未注入` : `上次 ${fmtTime(last.at)} · ${last.agent || '—'}` }) : null,
      ),
      renderExpertPicker(),
    ].filter(Boolean))
  }

  /**
   * renderExpertPicker 是「一键启用专家」：这里是每天重复最多的动作。
   * 不用逐条点开再点启用——九个专家的开关摊在同一行，点一下就切。
   * 只列技能：人设是「谁来写」，走另一条路（详情里的「设为当前人设」）。
   */
  function renderExpertPicker() {
    const skills = entries().filter((e) => e.injectable && e.kind === 'skill' && e.builtin)
    const mine = entries().filter((e) => e.injectable && e.kind === 'skill' && !e.builtin)
    const all = [...skills, ...mine]
    if (!all.length) return null
    const chip = (e) => {
      const on = isEnabled(e.id)
      return el('button', {
        type: 'button',
        class: `pick${on ? ' is-on' : ''}`,
        'aria-pressed': on ? 'true' : 'false',
        title: on ? `停用「${e.name}」` : `启用「${e.name}」`,
        onclick: () => save({ enabled: { ...(options.enabled || {}), [e.id]: !on } }, on ? `已停用「${e.name}」` : `已启用「${e.name}」`),
      }, on ? '✓ ' : '', e.name)
    }
    return el('section', { class: 'picker', 'aria-label': '启用专家' },
      el('h3', {}, '启用的专家',
        el('span', { class: 'h2-sub', text: '点一下即生效，不必逐条打开' })),
      el('div', { class: 'picks' }, ...all.map(chip)),
    )
  }

  /** stackRow 是组装里的一层：序号 + 名字 + 一句描述 + 体积。 */
  function stackRow(ord, cls, name, desc, size) {
    return el('div', { class: `stack-row is-${cls}` },
      el('span', { class: 'ord', text: ord }),
      el('span', { class: 'body' },
        el('span', { class: 'name', text: name }),
        el('span', { class: 'desc', text: desc }),
      ),
      el('span', { class: 'size', text: size }),
    )
  }

  function renderInspector() {
    const host = $('inspect')
    const e = findEntry(selected)
    if (!e) {
      // 没选中时让位给「组装预览」：右栏不留一片空白，那是最浪费的一屏。
      showingText = false
      host.replaceChildren()
      return
    }
    const kind = KINDS[e.kind] || { label: e.kind }
    const kindCls = kindClass(e.kind)
    const inline = e.source?.root === 'inline' || e.meta?.format === 'inline'
    // 只有复制进插件自己的 state/imports 的副本才谈得上「删副本」：来源目录里的原件不动。
    const imported = Boolean(e.source?.root && /[\\/]state[\\/]imports\/?$/.test(e.source.root))
    const enabled = isEnabled(e.id)
    const pinned = options.pinned?.[e.id]
    const history = Array.isArray(e.history) ? e.history : []
    // 可注入条目的正文现在随快照下来（inventory.snapshotOf 带 text），
    // 所以「看原文」对内置技能也成立，不再只限页面里贴进来的那几条。
    const text = typeof e.text === 'string' ? e.text : ''
    const canShowText = Boolean(text.trim())

    const actions = []
    // 人设才有「设为当前人设」；技能是「启用/停用」。混着写会让人以为技能能当人设用。
    if (e.injectable && e.kind === 'persona') {
      actions.push(el('button', {
        type: 'button',
        class: options.persona === e.id ? 'primary' : '',
        onclick: () => save({ persona: e.id }, `已把「${e.name}」设为当前人设`),
      }, options.persona === e.id ? '当前人设' : '设为当前人设'))
    }
    if (e.injectable) {
      actions.push(el('button', {
        type: 'button',
        onclick: () => save({ enabled: { ...(options.enabled || {}), [e.id]: !enabled } }, enabled ? `已停用「${e.name}」` : `已启用「${e.name}」`),
      }, enabled ? '停用' : '启用'))
    }
    // 「它到底写了什么」是判断要不要启用它的唯一依据：进来就看得到，不用去磁盘翻文件。
    if (canShowText) {
      actions.push(el('button', {
        type: 'button',
        class: showingText ? 'quiet' : '',
        'aria-expanded': showingText ? 'true' : 'false',
        onclick: () => { showingText = !showingText; renderInspector() },
      }, showingText ? '收起原文' : '查看原文'))
    }
    if (pinned) {
      actions.push(el('button', {
        type: 'button',
        class: 'quiet',
        onclick: () => {
          const next = { ...(options.pinned || {}) }
          delete next[e.id]
          save({ pinned: next }, '已回到最新版本')
        },
      }, '取消版本固定'))
    }
    if (inline) {
      actions.push(el('button', {
        type: 'button',
        class: 'danger',
        onclick: () => {
          const kept = inlineEntries().filter((x) => x.id !== e.id)
          const enabledNext = { ...(options.enabled || {}) }
          delete enabledNext[e.id]
          save({ inline: kept, enabled: enabledNext, persona: options.persona === e.id ? '' : options.persona }, '已从页面导入里删掉')
          if (selected === e.id) selected = ''
        },
      }, '删除'))
    } else if (imported) {
      actions.push(el('button', {
        type: 'button',
        class: 'danger',
        onclick: () => importRequest({ op: 'delete', path: e.source.rel }, `已请求删除「${e.name}」的副本（只删插件自己的 state/imports）`),
      }, '删除副本'))
    }

    const versionPicker = history.length
      ? el('label', { class: 'note' },
        '回滚到：',
        el('select', {
          onchange: (ev) => {
            const digest = ev.target.value
            const next = { ...(options.pinned || {}) }
            if (digest) next[e.id] = digest
            else delete next[e.id]
            save({ pinned: next }, digest ? '已固定到旧版本' : '已回到最新版本')
          },
        },
          el('option', { value: '', selected: !pinned }, `最新 v${e.version ?? 1}`),
          ...history.map((h) => el('option', { value: h.digest, selected: pinned === h.digest }, `v${h.version ?? '?'} · ${fmtTime(h.at)}`)),
        ),
      )
      : null

    // 详情不再是一张平铺的规格表：主栏说「它是什么、怎么用、占多少」，侧栏放技术事实，
    // 底部单独一条操作栏。原来六行 dl + 一条细预算条全堆在一起，看不出主次。
    const desc = e.meta?.description || (e.injectable ? '可写进 system 段的人设/技能文本。' : NOT_INJECTABLE)
    const pct = Math.min(100, ((e.chars || 0) / 65536) * 100)
    const facts = [
      ['来源', e.source?.root === 'inline' ? '页面导入（存在 options 里）' : e.builtin ? `插件内置 ${builtinFolder(e)}/` : e.source?.root || '—'],
      ['路径', null, 'code', e.source?.rel || '—'],
      ['摘要', null, 'code', short(e.digest)],
      ['版本', `v${e.version ?? 1}${history.length ? ` · 留 ${history.length} 个旧版` : ''}`],
      ['导入', e.builtin ? '随插件' : fmtTime(e.importedAt)],
      ...(e.meta?.sessions !== undefined ? [['会话数', String(e.meta.sessions)]] : []),
      ...(e.meta?.turns !== undefined ? [['选定轮次', String(e.meta.turns)]] : []),
    ]

    // replaceChildren 会把 null 变成 "null" 字符串，所以先过滤。
    host.replaceChildren(...[
      // ---- 头：名字 + 类型 + 一句话定位 ----
      el('header', { class: 'ins-head' },
        el('div', { class: 'ins-title' },
          el('h2', {}, e.name),
          el('span', { class: `kind ${kindCls}` }, kind.label),
          e.builtin ? el('span', { class: 'ins-badge', text: '内置' }) : null,
        ),
        el('p', { class: 'ins-lede', text: desc }),
      ),

      // ---- 主体：主栏（何时用 / 体量）+ 侧栏（技术事实）----
      el('div', { class: 'ins-body' },
        el('div', { class: 'ins-main' },
          e.meta?.whenToUse
            ? el('section', { class: 'ins-callout' },
              el('h3', { text: '何时用' }),
              el('p', { text: e.meta.whenToUse }),
            )
            : null,
          e.injectable
            ? el('section', { class: 'ins-meter' },
              el('h3', {}, '进入 system 的体量',
                el('span', { class: 'ins-pct', text: pct < 1 ? '<1%' : `${pct.toFixed(pct < 10 ? 1 : 0)}%` })),
              el('div', { class: 'meter-track' }, el('div', { class: 'meter-fill', style: `width:${Math.max(pct, 0.6)}%` })),
              el('p', { class: 'ins-meter-note', text: `${(e.chars || 0).toLocaleString('zh-CN')} / 65,536 字符 · 与人设一起拼进 system` }),
            )
            : el('section', { class: 'ins-callout is-material' },
              el('h3', { text: '下一步' }),
              el('p', { text: '把它当资料翻；要注入的话，从「导入与来源」里选一份 .md 人设或技能。' }),
            ),
          // 「出处」比「提炼自」中性：技能是从 dsh-purge 提炼的，人设是新写的，一个前缀套不住两种。
          e.builtin && e.meta?.source
            ? el('p', { class: 'ins-origin', text: `出处：${e.meta.source}` })
            : null,
        ),
        el('aside', { class: 'ins-facts' },
          ...facts.flatMap(([k, v, tag, code]) => [
            el('dt', { text: k }),
            el('dd', {}, v !== null ? String(v) : el(tag || 'code', { text: code })),
          ]),
        ),
      ),

      // ---- 底：操作栏 ----
      actions.length
        ? el('footer', { class: 'ins-actions' }, ...actions)
        : null,
      versionPicker,
      pinned ? el('p', { class: 'note', text: `当前固定到 ${short(pinned)}：网关用那一版的正文，不是最新的。` }) : null,
      // 原文按注入形态显示：前面出现的技能段，正文会以「## 技能：<名字>」为界拼进去。
      showingText && canShowText
        ? el('pre', { class: 'text', text: text.length > 8000 ? `${text.slice(0, 8000)}\n…（共 ${text.length.toLocaleString('zh-CN')} 字符，后面省略）` : text })
        : null,
    ].filter(Boolean))
  }

  function renderRejects() {
    const host = $('rejects')
    const rows = Array.isArray(catalog?.rejected) ? catalog.rejected : []
    const badge = $('rejects-count')
    if (badge) badge.textContent = rows.length ? `${rows.length}` : ''
    if (!rows.length) {
      const n = entries().length
      host.replaceChildren(el('li', {
        text: n
          ? '没有拒绝项：来源目录里每个文件都认得出来。'
          : '还没有扫描结果。先确认来源目录里放了东西，再点右上角「重新扫描」。',
      }))
      return
    }
    host.replaceChildren(...rows.slice(0, 24).map((r) => el('li', {}, el('strong', { text: r.name }), `：${r.reason}`)))
  }

  function renderLast() {
    const host = $('last')
    const last = catalog?.last
    if (!last) {
      host.replaceChildren(el('p', { class: 'note', text: '还没有请求经过网关。改完模式后，下一次 agent 请求会写下这一行。' }))
      return
    }
    if (last.skipped) {
      // 放行了也要说清为什么：只显示「没注入」等于什么也没说
      host.replaceChildren(
        el('p', { class: 'note', text: `${fmtTime(last.at)} · ${last.agent || '未知 agent'} · ${last.protocol || '—'}` }),
        el('p', { class: 'warn', text: `这次没有注入：${last.skipped}` }),
      )
      return
    }
    host.replaceChildren(
      el('p', { class: 'note', text: `${fmtTime(last.at)} · ${last.agent || '未知 agent'} · ${last.protocol} · ${last.mode}` }),
      el('p', { class: 'note', text: `人设 ${last.persona || '（无）'} · 技能 ${(last.skills || []).length} 条 · 注入 ${last.chars} 字符` }),
      ...(last.missingPin?.length ? [el('p', { class: 'warn', text: `固定的版本不在当前表里：${last.missingPin.join('、')}` })] : []),
    )
  }

  function render() {
    if (!catalog) {
      $('count').textContent = '没有快照'
    } else {
      const shown = visible().length
      $('count').textContent = `${shown} / ${entries().length + inlineEntries().length} 条 · 快照 v${catalog.version} · ${fmtTime(catalog.generatedAt)}`
    }
    renderPlan()
    renderFilters()
    renderList()
    // 选着条目就看详情，没选就回组装预览：右栏永远有东西，不留空屏。
    renderAssembly()
    renderInspector()
    const picked = Boolean(findEntry(selected))
    $('assembly').hidden = picked
    $('inspect').hidden = !picked
    renderRejects()
    renderLast()
    renderSources()
  }

  /** MODES 是模式下拉的全部取值：没有「跟随上游」这一档，模式必须自己选。 */
  const MODES = () => ['off', 'strict', 'replace', 'append']

  /** modeHelp 说清当前值到底意味着什么；未选时说清未选就是不动请求。 */
  function modeHelp(value) {
    if (value) return MODE_HELP[value] || ''
    return '还没选模式：请求原样放行。选一个（比如 replace）才开始注入。'
  }

  /**
   * renderPlan 是「现在到底注不注、注谁、为什么没注」那一行。
   * 判定由后端算好放在快照的 plan 里（页面不能读 agent-purge 的 state.json）。
   */
  function renderPlan() {
    const host = $('plan')
    const plan = catalog?.plan
    if (!plan) {
      host.dataset.state = 'idle'
      host.replaceChildren(
        el('span', { class: 'dot' }),
        el('span', { class: 'empty', text: '还没有判定：等后端第一次扫描' }),
      )
      return
    }
    const ready = Boolean(plan.ready)
    // personaFrom 的三种来源，用户一眼要能看懂「谁在顶着」：
    //   page = 自己点的、auto = 底座人设自动顶上、default = agent-purge（仅在显式开启时）
    const fromText = { page: '本页设置', auto: '底座人设（没选人设时自动顶上）', default: '默认' }
    host.dataset.state = ready ? 'ready' : 'blocked'

    // 没就绪时给一个能点的下一步：光说「不会注入」等于把问题丢回给人。
    // 每个按钮都顺带 refreshAt：宿主重建插件进程后按新设置重扫，plan 才会跟着变。
    const fix = []
    const fixed = (patch, note) => {
      save({ ...patch, refreshAt: Date.now() }, note)
      pollSnapshot('等后端按新设置重扫…', 25)
    }
    if (!ready) {
      if (plan.blockedCode === 'no-mode' || plan.blockedCode === 'mode-off') {
        fix.push(el('button', { type: 'button', class: 'primary', onclick: () => fixed({ mode: 'replace' }, '模式改为 replace') }, '用 replace 开始注入'))
      }
      if (plan.blockedCode === 'no-persona' || plan.blockedCode === 'persona-missing') {
        fix.push(el('button', {
          type: 'button',
          class: 'primary',
          onclick: () => { filter = 'persona'; query = ''; render() },
        }, '去看人设'))
      }
      if (plan.blockedCode === 'no-persona-file') {
        fix.push(el('button', {
          type: 'button',
          class: 'primary',
          onclick: () => { $('import-file')?.focus(); $('import-file')?.click?.() },
        }, '导入一份人设'))
      }
    }

    // 两行文字放进同一列：第一行是结论，第二行是依据；右边的胶囊组跨两行垂直居中。
    // 原来「为什么」那行缩进 20px，看起来像挂件；现在两行左对齐，读起来是一段话。
    const rows = [
      el('span', { class: 'dot' }),
      el('span', { class: 'plan-text' },
        el('span', { class: ready ? 'who' : 'who is-empty' }, ready
          ? `下一次 agent 请求会注入「${plan.personaName || plan.personaId}」`
          : '现在不会注入：请求原样放行'),
        el('span', { class: 'why', text: ready
          ? `人设来源：${fromText[plan.personaFrom] || plan.personaFrom}`
          : plan.blocked }),
      ),
      el('span', { class: 'plan-controls' },
        modePill(),
        ...fix,
        ready ? confirmButton(plan) : null,
      ),
      // 面板浮在胶囊组下面：.plan-controls 要 overflow:hidden 才能把两段裁成一颗胶囊，
      // 所以面板不能放在它里面，只能挂在 .plan 上做绝对定位。
      modeMenuOpen ? modeMenu() : null,
    ]
    host.replaceChildren(...rows.filter(Boolean))
  }

  /**
   * modePill 是胶囊组的第一段：模式选择器。
   *
   * 不用原生 select：系统的下拉面板是浏览器自己画的，颜色、圆角、间距全都改不了，
   * 深色主题下还会弹出一块浅色板。这里自绘：按钮 + 自绘面板，
   * 键盘（上下键 / Esc / Enter）与 aria 都按 listbox 的模式接好。
   */
  function modePill() {
    const value = MODES().includes(options.mode) ? options.mode : ''
    // 未选模式时不假装跟随谁：直接说「未选」，点开才去挑。
    const label = value === '' ? '未选' : `${value} · ${MODE_SHORT[value] || ''}`
    return el('button', {
      type: 'button',
      class: 'seg seg-mode',
      title: modeHelp(value),
      'aria-haspopup': 'listbox',
      'aria-expanded': modeMenuOpen ? 'true' : 'false',
      onclick: (e) => {
        e.stopPropagation()
        modeMenuOpen = !modeMenuOpen
        renderPlan()
        if (modeMenuOpen) document.querySelector('.seg-opt.is-on')?.focus()
      },
      onkeydown: (e) => {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          modeMenuOpen = true
          renderPlan()
          document.querySelector('.seg-opt.is-on')?.focus()
        }
      },
    },
      el('span', { class: 'seg-key', text: '模式' }),
      el('span', { class: 'seg-value', text: label }),
      el('svg', { class: 'seg-chev', viewBox: '0 0 12 12', 'aria-hidden': 'true' },
        el('path', { d: 'M2.5 4.5 L6 8 L9.5 4.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      ),
    )
  }

  /** modeMenu 是自绘的下拉面板：每项两行——模式名 + 一句它到底干什么。 */
  function modeMenu() {
    const value = MODES().includes(options.mode) ? options.mode : ''
    const pick = (m) => {
      modeMenuOpen = false
      save({ mode: m }, `模式改为 ${m}`)
    }
    const move = (delta) => {
      const opts = [...document.querySelectorAll('.seg-opt')]
      const i = opts.indexOf(document.activeElement)
      const next = opts[Math.min(opts.length - 1, Math.max(0, (i < 0 ? 0 : i) + delta))]
      next?.focus()
    }
    return el('div', {
      class: 'seg-menu',
      role: 'listbox',
      'aria-label': '改写模式',
      onclick: (e) => e.stopPropagation(),
      onkeydown: (e) => {
        if (e.key === 'Escape') { modeMenuOpen = false; renderPlan(); return }
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
        if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
      },
    },
      ...MODES().map((m) => el('button', {
        type: 'button',
        class: `seg-opt${m === value ? ' is-on' : ''}`,
        role: 'option',
        'aria-selected': m === value ? 'true' : 'false',
        tabindex: m === value ? '0' : '-1',
        onclick: () => pick(m),
      },
        el('span', { class: 'seg-opt-body' },
          el('span', { class: 'seg-opt-name', text: m }),
          el('span', { class: 'seg-opt-sub', text: MODE_HELP[m] }),
        ),
        m === value
          ? el('svg', { class: 'seg-check', viewBox: '0 0 12 12', 'aria-hidden': 'true' },
            el('path', { d: 'M2.5 6.2 L5 8.6 L9.5 3.4', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
          : null,
      )),
    )
  }

  /**
   * confirmButton 是「确认注入」那颗胶囊。
   *
   * 「已注入」有两个来源，都算数：
   *   1. 最近一次真的经过网关的记录（catalog.last）写着同一套人设与模式——这是证据；
   *   2. 用户按下确认，且此后配置没再动过——这是意图。
   * 本地打个勾不叫生效，所以状态里带着「按的是哪一套配置」：改了模式或人设，
   * 签名一变，「已注入」自动退回「确认注入」。
   */
  function confirmButton(plan) {
    const sig = `${plan.mode}|${plan.personaId || ''}`
    const last = catalog?.last
    const evidence = Boolean(last && !last.skipped && last.mode === plan.mode && (last.persona || '') === (plan.personaId || ''))
    const applied = evidence || confirmedSig === sig
    return el('button', {
      type: 'button',
      class: `seg seg-action${applied ? ' is-applied' : ' is-armed'}`,
      title: evidence
        ? `最近一次生效：${fmtTime(last.at)} · ${last.agent || '未知 agent'}`
        : applied
          ? '已按当前配置确认注入；改了模式或人设会退回未确认'
          : '把这套配置推给网关：重扫一次，下一次 agent 请求就按它注入',
      onclick: () => {
        confirmedSig = sig
        renderPlan()
        say('已确认注入：下一次 agent 请求按这套配置走', 'good')
        refresh()
      },
    }, applied ? '已注入' : '确认注入')
  }

  function renderSources() {
    const el2 = $('sources')
    if (!el2 || document.activeElement === el2) return
    const list = Array.isArray(options.sources) && options.sources.length
      ? options.sources
      : (catalog?.sources || []).filter((s) => s.path && !/[\\/]state[\\/]imports\/?$/.test(s.path)).map((s) => s.path)
    el2.value = list.join('\n')
  }

  // ---------- 动作 ----------

  function importRequest(req, note) {
    const imports = Array.isArray(options.imports) ? options.imports.slice(-19) : []
    imports.push({ ...req, at: Date.now() })
    save({ imports, refreshAt: Date.now() }, note)
    pollSnapshot(`等待后端处理：${req.path}`, 25)
  }

  /** pollSnapshot 每隔 1.2 秒重新加载 catalog.js（加时间戳绕缓存），版本变了就重画。 */
  function pollSnapshot(reason, seconds = 12) {
    const before = catalog?.version ?? 0
    const until = Date.now() + seconds * 1000
    say(reason)
    const tick = () => {
      const script = document.createElement('script')
      script.src = `catalog.js?t=${Date.now()}`
      script.onload = () => {
        script.remove()
        const next = window.PURGE_CATALOG
        if (next && next.version !== before) {
          catalog = next
          render()
          say('快照已更新', 'good')
          return
        }
        if (Date.now() < until) setTimeout(tick, 1200)
        else say('后端还没写出新快照：magpie 里插件可能没重启，或来源目录没权限。', 'bad')
      }
      script.onerror = () => {
        script.remove()
        if (Date.now() < until) setTimeout(tick, 1200)
      }
      document.head.append(script)
    }
    setTimeout(tick, 900)
  }

  async function refresh() {
    if (busy) return
    busy = true
    try {
      save({ refreshAt: Date.now() })
      await flush()
      pollSnapshot('正在让后端重新扫描…', 25)
    } finally {
      busy = false
    }
  }

  function wire() {
    // 模式选择器与「确认注入」都是每次 renderPlan 重建的，监听写在创建处（onclick/onkeydown），
    // 这里只绑那些常驻不动的控件。
    $('q').addEventListener('input', (e) => { query = e.target.value; render() })

    // 点面板以外的地方就收起。用捕获阶段：面板内部自己 stopPropagation。
    document.addEventListener('click', () => {
      if (!modeMenuOpen) return
      modeMenuOpen = false
      renderPlan()
    })

    $('import-run').addEventListener('click', () => {
      const path = $('import-path').value.trim()
      if (!path) return say('先填一个文件路径', 'bad')
      importRequest({ op: 'import', path }, '已请求导入')
      $('import-path').value = ''
    })

    $('import-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const raw = await file.text()
        if (raw.length > 64 * 1024) throw new Error('超过 64 KB：这么大的正文不该塞进 options')
        const id = (file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'inline').slice(0, 48)
        const kept = inlineEntries().filter((x) => x.id !== id)
        const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
        const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        const name = fm?.[1]?.match(/^name:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, '') || file.name.replace(/\.[^.]+$/, '')
        save({ inline: [...kept, { id, name, kind: 'persona', text: body }] }, `已把「${name}」存进 options`)
        e.target.value = ''
      } catch (error) {
        say(`导入失败：${error?.message || error}`, 'bad')
      }
    })

    const sources = $('sources-save')
    sources?.addEventListener('click', () => {
      const list = $('sources').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      save({ sources: list, refreshAt: Date.now() }, '来源目录已保存')
      pollSnapshot('等待后端按新来源扫描…', 25)
    })
  }

  async function boot() {
    if (bridge?.ready?.then) {
      try {
        await Promise.race([bridge.ready, new Promise((r) => setTimeout(r, 1500))])
      } catch {
        /* 宿主没答也要能画 */
      }
    }
    if (bridge?.onVisibility) bridge.onVisibility((visible) => { if (visible && !busy) refreshFromDisk() })
    try {
      options = (await bridge?.options?.get?.()) || {}
    } catch (error) {
      say(`读不到 options：${error?.message || error}`, 'bad')
      options = {}
    }
    wire()
    render()
    // 预览用：?menu=1 直接把下拉面板展开，省得截图时还要模拟点击。
    if (new URLSearchParams(location.search).get('menu') === '1') {
      modeMenuOpen = true
      renderPlan()
    }
    if (!catalog) pollSnapshot('还没有快照，等后端第一次扫描…', 20)
  }

  /** 页面被切回来时顺手换一份快照：宿主可能在背后扫过一次。 */
  function refreshFromDisk() {
    const script = document.createElement('script')
    script.src = `catalog.js?t=${Date.now()}`
    script.onload = () => {
      script.remove()
      const next = window.PURGE_CATALOG
      if (next && next.version !== catalog?.version) {
        catalog = next
        render()
      }
    }
    script.onerror = () => script.remove()
    document.head.append(script)
  }

  boot()
})()