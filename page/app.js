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
  /** editingText 是原文的编辑态；draftText 是编辑中的草稿，点保存才写回 options。 */
  let editingText = false
  let draftText = ''
  /** pendingFile 是「点过选择、还没点导入」的那个文件；两步导入靠它接上。 */
  let pendingFile = null
  /** importKind 是导入时选的类型：auto 交给判定，persona/skill 覆盖它。 */
  let importKind = 'auto'
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

  // entries 出来就已经套过「改过的正文 / 删掉的条目」：
  // 页面写不了磁盘，编辑与删除只能存 options，由 applyPrefs 统一套用。
  const entries = () => {
    const raw = Array.isArray(catalog?.entries) ? catalog.entries : []
    const api = globalThis.PurgePlan
    return api?.applyPrefs ? api.applyPrefs(raw, options) : raw
  }
  const inlineEntries = () => (Array.isArray(options.inline) ? options.inline : [])

  /**
   * shaped 给「页面导入」的条目补齐其它条目都有的字段。
   *
   * 列表与检查器必须看同一份形状：之前只有列表补了，检查器拿到的是裸对象，
   * 于是 source 缺失 → 认不出是 inline → 不给删除按钮、还把它当素材。
   */
  const shaped = (e) => ({
    ...e,
    status: 'ok',
    reason: '',
    source: { rel: '页面导入（options）', root: 'inline' },
    size: 0,
    meta: { format: 'inline', description: '从「导入」里挑进来的文件，正文存在插件的 options 里。' },
    version: e.version ?? 1,
    importedAt: 0,
    chars: String(e.text || '').length,
    injectable: true,
    builtin: false,
    digest: e.digest || '',
  })

  // findEntry 统一走 shaped：检查器与列表必须看到同一份对象，否则判定会打架。
  const findEntry = (id) =>
    entries().find((e) => e.id === id) ||
    (() => {
      const hit = inlineEntries().find((e) => e.id === id)
      return hit ? shaped(hit) : null
    })()
  const isEnabled = (id) => (options.enabled?.[id] !== undefined ? options.enabled[id] : findEntry(id)?.kind === 'persona')
  /** defaultPersona 是「现在最能顶上的人设」：内置底座优先，其次第一个可用的人设。 */
  const defaultPersona = () =>
    entries().find((e) => e.kind === 'persona' && e.default === true) ||
    entries().find((e) => e.kind === 'persona') ||
    inlineEntries().find((e) => e.kind !== 'skill') ||
    null

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
    // 记住这一轮自己刚写下去的键：宿主回包只用来「补全它规范化的字段」，
    // 不许它把我们刚设的值盖回去——否则「选了模式又被换回」会反复发生。
    const sent = { ...(pendingSave || {}) }
    const body = { ...options }
    pendingSave = null
    try {
      const saved = await bridge.options.set(body)
      if (saved && typeof saved === 'object') {
        const merged = { ...body, ...saved }
        for (const key of Object.keys(sent)) merged[key] = body[key]
        options = merged
      }
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
          .map(shaped),
      )
  }

  function renderList() {
    const host = $('list')
    const rows = visible()
    if (!hasSnapshot()) {
      // version 0 是「出厂的空壳」：后端还没扫过，或者它根本写不进 page/catalog.js。
      // 这两种情况页面看到的一模一样，所以两句话都要说，别让人猜。
      host.replaceChildren(el('p', { class: 'empty', text: '还没有快照：后端还没扫过，或它写不进 page/catalog.js（插件目录只读时会发生）。点右上角「重新扫描」再等几秒。' }))
      return
    }
    if (!rows.length) {
      host.replaceChildren(el('p', { class: 'empty', text: '没有匹配的条目。清掉搜索，或导入一份文件再来。' }))
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
    // 移除是「从候选里拿掉」，不是删文件；入口留在这儿，否则移掉一条就再也找不回来。
    const removedIds = Object.keys(options.removed || {}).filter((id) => options.removed[id] === true)
    if (removedIds.length) {
      nodes.push(el('div', { class: 'restore-row' },
        el('span', { text: `已移除 ${removedIds.length} 条` }),
        el('button', {
          type: 'button',
          class: 'quiet',
          onclick: () => save({ removed: {} }, `已恢复 ${removedIds.length} 条被移除的条目`),
        }, '全部恢复'),
      ))
    }
    host.replaceChildren(...nodes)
  }

  /**
   * rowOf 画一行条目。
   *
   * 点行本身 = 做它最主要的那件事（技能是开关，人设是设为当前人设）；
   * 点右侧「查看」= 打开检查器看详情与原文。
   * 之前点行是「看详情」，开关另有一片芯片墙——同一件事两个入口，还多占一屏。
   */
  function rowOf(e) {
    const kind = KINDS[e.kind] || { label: e.kind }
    const on = isEnabled(e.id)
    const isPersona = e.kind === 'persona'
    const isCurrent = isPersona && options.persona === e.id
    const badge = e.status === 'rejected'
      ? el('span', { class: 'badge reject', text: '拒绝' })
      : !e.injectable
        ? null
        : on ? null : el('span', { class: 'badge off', text: isPersona ? '非当前' : '未启用' })

    const openView = () => {
      // 换条目就收起原文：从一条展开着的详情跳到另一条，不该自动展示别人的正文。
      if (selected !== e.id) showingText = false
      selected = selected === e.id ? '' : e.id
      render()
    }

    const act = () => {
      // 素材没有开关可拨，点它就是看详情——总比什么都不发生强。
      if (!e.injectable) return openView()
      if (isPersona) {
        save({ persona: isCurrent ? '' : e.id }, isCurrent ? '已取消当前人设' : `已把「${e.name}」设为当前人设`)
      } else {
        save({ enabled: { ...(options.enabled || {}), [e.id]: !on } }, on ? `已停用「${e.name}」` : `已启用「${e.name}」`)
      }
    }

    return el('div', {
      class: `row${on ? ' is-on' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-pressed': on ? 'true' : 'false',
      'aria-selected': selected === e.id,
      title: !e.injectable
        ? '看详情'
        : isPersona
          ? (isCurrent ? '取消当前人设' : '设为当前人设')
          : (on ? `停用「${e.name}」` : `启用「${e.name}」`),
      onclick: act,
      onkeydown: (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act() }
      },
    },
      el('span', { class: 'spine', style: `--spine:var(--kind-${kindClass(e.kind)})` }),
      el('span', {},
        el('span', { class: 'title' }, e.name, badge || null),
        el('span', { class: 'meta', text: `${kind.label} · ${e.builtin ? '随插件' : e.source?.rel ?? ''}` }),
      ),
      // 右侧只留一个「查看」：字数挪进详情，一行只做一件事。
      el('button', {
        type: 'button',
        class: 'row-view',
        title: '看详情与原文',
        onclick: (ev) => { ev.stopPropagation(); openView() },
      }, '查看'),
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
    const plan = currentPlan()
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

    // 超预算是会真的出事的：整段 system 被截断，模型看到的是残缺的人设。
    // 以前这里只是把两个数字并排放着，84,018 和 65,536 挨在一起也不喊一声。
    const BUDGET = 65_536
    const over = plan.ready && total > BUDGET
    const footText = !plan.ready
      ? `模式 ${plan.mode}`
      : over
        ? `合计 ${total.toLocaleString('zh-CN')} 字符 · 超出预算 ${(total - BUDGET).toLocaleString('zh-CN')}`
        : `合计 ${total.toLocaleString('zh-CN')} 字符 · 预算 ${BUDGET.toLocaleString('zh-CN')}`

    host.replaceChildren(...[
      el('h2', {}, '注入组装',
        el('span', { class: 'h2-sub', text: plan.ready ? '下一次请求会拼成这段' : '这次放行，下面是原因' })),
      el('div', { class: 'stack-view' }, ...rows),
      el('div', { class: 'stack-foot' },
        el('span', { class: over ? 'over' : '', text: footText }),
        last?.at ? el('span', { text: last.skipped ? `上次 ${fmtTime(last.at)} · 未注入` : `上次 ${fmtTime(last.at)} · ${last.agent || '—'}` }) : null,
      ),
    ].filter(Boolean))
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
      editingText = false
      host.replaceChildren()
      return
    }
    const kind = KINDS[e.kind] || { label: e.kind }
    const kindCls = kindClass(e.kind)
    const inline = e.source?.root === 'inline' || e.meta?.format === 'inline'
    // 只有复制进插件自己的 state/imports 的副本才谈得上「删副本」：原件不动。
    // root 可能是绝对路径（真机）也可能是相对路径（演示快照），所以不要求前导分隔符。
    const imported = Boolean(e.source?.root && /(^|[\\/])state[\\/]imports\/?$/.test(e.source.root))
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
        onclick: () => {
          showingText = !showingText
          editingText = false
          renderInspector()
        },
      }, showingText ? '收起原文' : '查看原文'))
      // 编辑：页面写不了磁盘，改动存进 options.overrides，由网关侧套用。
      // 内置技能在包里，原件不动——所以这里必须说清楚「改的是这个插件里的副本」。
      if (showingText && !editingText) {
        actions.push(el('button', {
          type: 'button',
          onclick: () => {
            editingText = true
            draftText = typeof e.text === 'string' ? e.text : ''
            renderInspector()
          },
        }, '编辑'))
      }
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
          // 删掉导入的条目时，指向它的引用也要一起清：否则 plan 会卡在 persona-missing，
          // 用户还得再点一次「改用」才能恢复注入。
          const kept = inlineEntries().filter((x) => x.id !== e.id)
          const enabledNext = { ...(options.enabled || {}) }
          delete enabledNext[e.id]
          const pinnedNext = { ...(options.pinned || {}) }
          delete pinnedNext[e.id]
          const fallback = kept.find((x) => x.kind !== 'skill')
          save({
            inline: kept,
            enabled: enabledNext,
            pinned: pinnedNext,
            persona: options.persona === e.id ? (fallback?.id || '') : options.persona,
          }, `已删除「${e.name}」`)
          if (selected === e.id) selected = ''
          render()
        },
      }, '删除导入'))
      // 类型选错时能就地改：重扫猜出来的类型不一定对，硬编码成「人设」更糟。
      actions.push(el('button', {
        type: 'button',
        class: 'quiet',
        onclick: () => {
          const nextKind = e.kind === 'skill' ? 'persona' : 'skill'
          const next = inlineEntries().map((x) => (x.id === e.id ? { ...x, kind: nextKind } : x))
          save({ inline: next }, `已改判为${nextKind === 'skill' ? '技能' : '人设'}`)
          render()
        },
      }, e.kind === 'skill' ? '改判为人设' : '改判为技能'))
    } else if (imported) {
      actions.push(el('button', {
        type: 'button',
        class: 'danger',
        onclick: () => {
          // 删副本同时把指向它的引用清掉：留着会让 plan 卡在 persona-missing。
          const enabledNext = { ...(options.enabled || {}) }
          delete enabledNext[e.id]
          const pinnedNext = { ...(options.pinned || {}) }
          delete pinnedNext[e.id]
          save({
            enabled: enabledNext,
            pinned: pinnedNext,
            persona: options.persona === e.id ? '' : options.persona,
          })
          importRequest({ op: 'delete', path: e.source.rel }, `已请求删除「${e.name}」的副本（只删插件自己的 state/imports）`)
          if (selected === e.id) selected = ''
        },
      }, '删除副本'))
    } else if (e.builtin) {
      // 内置技能在包里，删不掉文件。这里做的是「从这个插件的候选里拿掉」：
      // 记进 options.removed，列表不再显示、注入也不再带上，可以整批恢复。
      actions.push(el('button', {
        type: 'button',
        class: 'danger',
        title: '从候选里移除（包里的文件不动，可恢复）',
        onclick: () => {
          const enabledNext = { ...(options.enabled || {}) }
          delete enabledNext[e.id]
          const pinnedNext = { ...(options.pinned || {}) }
          delete pinnedNext[e.id]
          const overridesNext = { ...(options.overrides || {}) }
          delete overridesNext[e.id]
          save({
            removed: { ...(options.removed || {}), [e.id]: true },
            enabled: enabledNext,
            pinned: pinnedNext,
            overrides: overridesNext,
            persona: options.persona === e.id ? '' : options.persona,
          }, `已移除「${e.name}」：包里的文件不动，列表底部可恢复`)
          if (selected === e.id) selected = ''
          editingText = false
          render()
        },
      }, '删除'))
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
        ? (editingText ? textEditor(e) : el('pre', { class: 'text', text: text.length > 8000 ? `${text.slice(0, 8000)}\n…（共 ${text.length.toLocaleString('zh-CN')} 字符，后面省略）` : text }))
        : null,
    ].filter(Boolean))
  }

  /**
   * textEditor 是原文的编辑态。
   *
   * 存进 options.overrides[id]，不碰磁盘：内置技能在包里改不动，
   * state/imports 归后端管。网关侧用 lib/plan.mjs 的 applyPrefs 套用同一份覆盖。
   */
  function textEditor(e) {
    const area = el('textarea', {
      class: 'text-edit',
      spellcheck: 'false',
      rows: '18',
      oninput: (ev) => { draftText = ev.target.value },
    })
    area.value = draftText

    const inlineNow = e.source?.root === 'inline'
    const saveDraft = () => {
      const next = area.value
      if (!next.trim()) { say('正文不能为空：要拿掉这条请用「删除」', 'bad'); return }
      if (inlineNow) {
        // 页面导入的条目正文本来就存在 options.inline 里，直接写回它自己
        const list = inlineEntries().map((x) => (x.id === e.id ? { ...x, text: next } : x))
        save({ inline: list }, `已保存「${e.name}」的正文`)
      } else {
        save({ overrides: { ...(options.overrides || {}), [e.id]: next } }, `已保存「${e.name}」的正文（原件不动）`)
      }
      editingText = false
      render()
    }

    return el('div', { class: 'text-wrap' },
      el('div', { class: 'text-bar' },
        el('span', { class: 'note', text: `${String(area.value || '').length.toLocaleString('zh-CN')} 字符` }),
        el('button', {
          type: 'button',
          class: 'quiet',
          onclick: () => {
            // 恢复成原件正文：有覆盖就删掉，没覆盖就重新拉一次快照里的 text
            if (inlineNow) { say('页面导入的条目没有「原件」可回退：改坏了就重新导入一份', 'bad'); return }
            const next = { ...(options.overrides || {}) }
            delete next[e.id]
            save({ overrides: next }, `已把「${e.name}」恢复成原件正文`)
            editingText = false
            render()
          },
        }, '还原'),
        el('button', { type: 'button', onclick: () => { editingText = false; renderInspector() } }, '取消'),
        el('button', { type: 'button', class: 'primary', onclick: saveDraft }, '保存'),
      ),
      area,
      el('p', { class: 'note', text: '改的是这个插件里的副本：包里的 .md 文件不动，网关注入时用你保存的这份。' }),
    )
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
          ? '没有拒绝项：现在这些文件都认得出来。'
          : '还没有扫描结果：导入一份文件，或点一下「导入」区里的按钮触发重扫。',
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
  }

  /** MODES 是模式下拉的全部取值：没有「跟随上游」这一档，模式必须自己选。 */
  const MODES = () => ['off', 'strict', 'replace', 'append']

  /** modeHelp 说清当前值到底意味着什么；未选时说清未选就是不动请求。 */
  function modeHelp(value) {
    if (value) return MODE_HELP[value] || ''
    return '还没选模式：请求原样放行。选一个（比如 replace）才开始注入。'
  }

  /**
   * planStale 判断「快照里的判定」是否已经跟不上本地设置了。
   *
   * 只比这两件会直接改变结论的事：模式与生效的人设。比完就知道该不该按旧结论劝人。
   */
  function planStale(plan) {
    if (!plan) return false
    const localMode = MODES().includes(options.mode) ? options.mode : ''
    if (localMode && localMode !== plan.mode) return true
    const localPersona = typeof options.persona === 'string' ? options.persona.trim() : ''
    if (localPersona && localPersona !== plan.personaId) return true
    return false
  }

  /**
   * currentPlan 是「现在这套设置会让网关怎么做」。
   *
   * 优先本地算：后端只在有请求经过时才重扫写快照，不动 agent 的话快照永远旧，
   * 技能开关、装配面板、状态条就全都停在改之前的样子。
   * 只有 useAgentPurge 打开时才不得不用快照——state.json 只有后端读得到。
   */
  function currentPlan() {
    if (options.useAgentPurge === true) return catalog?.plan || null
    const api = globalThis.PurgePlan
    if (!api) return catalog?.plan || null
    const usable = [...entries(), ...inlineEntries().map(shaped)]
      .filter((e) => e.status === 'ok' && e.injectable && typeof e.text === 'string' && e.text.trim())
    return api.resolve({ options, entries: usable })
  }

  /**
   * renderPlan 是「现在到底注不注、注谁、为什么没注」那一行。
   *
   * 判定用 currentPlan()：本地算，所以改完设置立刻反映，不用等后端重扫。
   * 快照里的 plan 只在 useAgentPurge 打开时才用得上（state.json 只有后端读得到）。
   */
  function renderPlan() {
    const host = $('plan')
    const plan = currentPlan()
    if (!plan) {
      host.dataset.state = 'idle'
      host.replaceChildren(
        el('span', { class: 'dot' }),
        el('span', { class: 'empty', text: '还没有判定：等后端第一次扫描' }),
      )
      return
    }
    const ready = Boolean(plan.ready)
    // 判定已经是本地的了，正常情况下不会过期；留这条只在 useAgentPurge 模式下生效，
    // 那种模式页面算不了，只能拿快照，仍可能出现「刚改完还没重扫」的短暂不一致。
    const stale = planStale(plan)
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
    // 本地已经选好模式时，绝不再劝「用 replace 开始注入」——
    // 那正是图一里「写着 append、旁边却叫你换成 replace」的自相矛盾。
    const localMode = MODES().includes(options.mode) ? options.mode : ''
    if (!ready && !localMode) {
      fix.push(el('button', { type: 'button', class: 'primary', onclick: () => fixed({ mode: 'replace' }, '模式改为 replace') }, '用 replace 开始注入'))
    }
    if (!ready) {
      // 旧人设被删掉后 options.persona 会一直指着它，卡在 persona-missing：
      // 这个问题点「去看人设」永远绕不出来，得给一个直接改掉它的动作。
      if (plan.blockedCode === 'persona-missing' && defaultPersona()) {
        const next = defaultPersona()
        fix.push(el('button', {
          type: 'button',
          class: 'primary',
          onclick: () => fixed({ persona: next.id }, `人设改为「${next.name}」`),
        }, `改用「${next.name}」`))
      }
      if (!stale && (plan.blockedCode === 'no-persona' || plan.blockedCode === 'persona-missing')) {
        fix.push(el('button', {
          type: 'button',
          onclick: () => { filter = 'persona'; query = ''; render() },
        }, '去看人设'))
      }
      if (!stale && plan.blockedCode === 'no-persona-file') {
        fix.push(el('button', {
          type: 'button',
          class: 'primary',
          onclick: () => { filter = 'persona'; query = ''; render() },
        }, '导入一份人设'))
      }
    }

    // 两行文字放进同一列：第一行是结论，第二行是依据；右边的胶囊组跨两行垂直居中。
    // 原来「为什么」那行缩进 20px，看起来像挂件；现在两行左对齐，读起来是一段话。
    // 过期时不复述旧结论：直接说「等重扫」，免得左边写 append、右边说「还没选模式」。
    const who = stale
      ? '设置已改，等后端重扫确认'
      : ready
        ? `下一次 agent 请求会注入「${plan.personaName || plan.personaId}」`
        : '现在不会注入：请求原样放行'
    const why = stale
      ? '刚改完模式或人设：下一次请求按新设置走，这里显示的是上一次扫描的判定'
      : ready
        ? `人设来源：${fromText[plan.personaFrom] || plan.personaFrom}`
        : plan.blocked

    const rows = [
      el('span', { class: 'dot' }),
      el('span', { class: 'plan-text' },
        el('span', { class: ready && !stale ? 'who' : 'who is-empty' }, who),
        el('span', { class: 'why', text: why }),
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
    // 签名用「实际会生效的那一套」：刚改了模式但后端还没重扫时，plan 是旧的，
    // 拿它算签名会让按钮继续显示「已注入」——那等于替一套还没生效的配置背书。
    const mode = MODES().includes(options.mode) ? options.mode : plan.mode
    const persona = (typeof options.persona === 'string' && options.persona.trim()) || plan.personaId || ''
    const sig = `${mode}|${persona}`
    const last = catalog?.last
    const evidence = Boolean(last && !last.skipped && last.mode === mode && (last.persona || '') === persona)
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
        else say('后端还没写出新快照：magpie 里插件可能没重启，或它写不进 page/catalog.js（插件目录只读）。', 'bad')
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

    // 导入分两步：先选文件（把路径填进输入框），再点「导入」才真的导入。
    // 一步到底容易误触：浏览器选完就导入，用户还没确认类型就落盘了。
    $('import-pick').addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.md,.markdown,.txt,.json,.zip'
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (!file) return
        // 浏览器出于安全不暴露真实路径，只能拿到文件名。
        // 这一步先把名字填进去，让人看见选中了什么；真正导入走下面那条 inline 通道。
        $('import-path').value = file.name
        pendingFile = file
        say(`已选中「${file.name}」，再点一次「导入」就写入`, 'good')
      })
      input.click()
    })

    $('import-run').addEventListener('click', async () => {
      const typed = $('import-path').value.trim()
      // 手填的是绝对路径：交给后端复制（原文件不动，副本进 state/imports）。
      if (typed && !pendingFile) {
        importRequest({ op: 'import', path: typed, kind: importKind }, '已请求导入')
        $('import-path').value = ''
        return
      }
      const file = pendingFile
      if (!file) return say('先点「选择」挑一个文件，或在框里填绝对路径', 'bad')
      try {
        const raw = await file.text()
        if (raw.length > 64 * 1024) throw new Error('超过 64 KB：这么大的正文不该塞进 options')
        const id = (file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'inline').slice(0, 48)
        const kept = inlineEntries().filter((x) => x.id !== id)
        const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        const declared = fm?.[1]?.match(/^kind:\s*(persona|skill)\s*$/m)?.[1]
        const name = fm?.[1]?.match(/^name:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, '') || file.name.replace(/\.[^.]+$/, '')
        const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
        // 类型的优先级：用户明确选的 > 文件自己写的 > 猜。
        const kind = importKind !== 'auto' ? importKind : declared || guessKind(body)
        save({ inline: [...kept, { id, name, kind, text: body }] }, `已导入「${name}」（${kind === 'skill' ? '技能' : '人设'}）`)
        pendingFile = null
        $('import-path').value = ''
        refreshAfterImport()
      } catch (error) {
        say(`导入失败：${error?.message || error}`, 'bad')
      }
    })

    // 导入类型：三选一，选中项自己管自己的 aria-pressed。
    for (const chip of document.querySelectorAll('#import-kind .chip')) {
      chip.addEventListener('click', () => {
        importKind = chip.dataset.kind || 'auto'
        for (const other of document.querySelectorAll('#import-kind .chip')) {
          other.setAttribute('aria-pressed', other === chip ? 'true' : 'false')
        }
      })
    }
  }

  /**
   * guessKind 猜一份 .md 是人设还是技能。
   *
   * 判据来自本插件自己的两种文件长相：人设是完整第二人称，通常带 `## 你是什么`／`你是谁`；
   * 技能是「某个领域的专家」，标题一般是 `# X专家`，正文多含命令与表格。
   */
  function guessKind(body) {
    const text = String(body || '')
    if (/^##\s*(你是什么|你是谁|你是谁？)/m.test(text)) return 'persona'
    if (/^(你是|你现在是)/m.test(text) && !/^#\s/m.test(text)) return 'persona'
    if (/^#\s/m.test(text) && /(\||命令|工具|参数)/.test(text)) return 'skill'
    return 'persona'
  }

  /** refreshAfterImport 让新导入的条目立刻出现在列表里，并让后端按新 options 重扫。 */
  function refreshAfterImport() {
    save({ refreshAt: Date.now() })
    render()
    pollSnapshot('等后端按新导入重扫…', 20)
  }

  async function boot() {
    // 先自己拉一份快照，带上时间戳。
    // 静态 <script src="catalog.js"> 没有任何版本参数：更新插件后浏览器可能一直用旧缓存，
    // 于是「怎么更新看到的都是老快照」。这里改成每次进页面都重新取一次。
    await loadSnapshot()
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
    // 包内 catalog.js 出厂是个空壳（version: 0）。它是个真值对象，所以
    // `if (!catalog)` 永远不成立——新装用户会对着空列表干等，页面不会自己重试。
    // 判据要落到版本号上：version < 1 就是「后端还没扫过」。
    if (!hasSnapshot()) pollSnapshot('等后端第一次扫描…', 25)
  }

  /** hasSnapshot 判断手上的快照是不是「真的扫过」——空壳（version 0）不算。 */
  function hasSnapshot() {
    return Boolean(catalog && Number(catalog.version) >= 1 && Array.isArray(catalog.entries))
  }

  /** loadSnapshot 动态取最新快照脚本；失败就当没有，别让启动挂住。 */
  function loadSnapshot() {
    return new Promise((resolve) => {
      // 单文件预览把快照内联了，没有 catalog.js 可取
      if (window.__PURGE_SINGLE_FILE__) { resolve(); return }
      const script = document.createElement('script')
      script.src = `catalog.js?t=${Date.now()}`
      script.onload = () => {
        script.remove()
        if (window.PURGE_CATALOG) catalog = window.PURGE_CATALOG
        resolve()
      }
      script.onerror = () => { script.remove(); resolve() }
      document.head.append(script)
    })
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