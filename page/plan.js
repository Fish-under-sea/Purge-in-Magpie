// 页面侧的「这次到底注不注入」判定。
//
// 为什么页面要自己算一遍：后端只在有请求经过网关时才重扫并写快照。
// 用户在页面上改完模式/人设/技能，只要还没发起 agent 请求，快照就一直是旧的——
// 状态条说「等重扫」、点技能看着没反应、装配面板空着，全是这一件事引起的。
//
// 这里的规则必须与 lib/plan.mjs 一致（Node 侧用它决定真改不改请求）。
// 两边不同步的话，页面会答应一件网关不会做的事——所以 tests/plan-parity.test.mjs
// 拿同一批输入分别跑两边，逐个比结果。
//
// 与 lib/plan.mjs 的唯一差别：这里不含 agent-purge 那一层。
// 页面读不到 state.json，useAgentPurge 打开时由调用方改用快照里的 plan。
;(() => {
  const MODES = ['off', 'strict', 'replace', 'append']

  const blank = (modeFrom, mode, blocked, blockedCode) => ({
    mode: mode || 'off',
    modeFrom,
    personaId: '',
    personaName: '',
    personaFrom: '',
    skills: [],
    blocked,
    blockedCode: blockedCode || '',
    ready: false,
    missingPersona: '',
  })

  /**
   * applyPrefs 与 lib/plan.mjs 的同名函数同语义：
   * 把「改过的正文」和「删掉的条目」套回列表。
   * 页面写不了磁盘，编辑与删除都只能存在 options 里，由网关侧照同一套规则套用。
   */
  function applyPrefs(entries = [], options = {}) {
    const ov = options && typeof options.overrides === 'object' && options.overrides ? options.overrides : {}
    const rm = options && typeof options.removed === 'object' && options.removed ? options.removed : {}
    return entries
      .filter((e) => e && typeof e.id === 'string' && rm[e.id] !== true)
      .map((e) => {
        const edited = ov[e.id]
        return typeof edited === 'string' && edited.trim() ? { ...e, text: edited, edited: true } : e
      })
  }

  /** resolve 与 lib/plan.mjs 同语义：页面设置优先，人设优先标了 default 的底座人设。 */
  function resolve({ options = {}, entries = [] } = {}) {
    const pageMode = MODES.includes(options.mode) ? options.mode : ''
    const mode = pageMode || 'off'
    const modeFrom = pageMode ? 'page' : 'default'

    const byId = new Map()
    for (const e of entries) if (e && typeof e.id === 'string' && !byId.has(e.id)) byId.set(e.id, e)
    const personas = entries.filter((e) => e.kind === 'persona')

    // 人设的解析放在「注入关着」之前：关掉注入只是「这次不写请求」，
    // 用户选了哪位人设这件事没变。先返回的话 personaId 是空串，
    // 列表里每条人设都显示「未启用」，点它也就看着毫无反应。
    if (mode === 'off') {
      const picked = personas.find((e) => e.id === (typeof options.persona === 'string' ? options.persona.trim() : ''))
        || personas.find((e) => e.default === true && options.enabled?.[e.id] !== false)
        || personas.find((e) => e.builtin !== true && options.enabled?.[e.id] !== false)
      return {
        ...blank(modeFrom, mode, '', modeFrom === 'default' ? 'no-mode' : 'mode-off'),
        // blank 的第三个参数是「被挡住的文案」，不是 personaId，所以人设得另塞
        personaId: picked?.id || '',
        blocked: modeFrom === 'default'
          ? '注入是关的：请求原样放行。按右侧「开始注入」才会改写请求'
          : '当前模式是 off，请求原样放行',
      }
    }

    let personaId = ''
    let personaFrom = ''
    let missingPersona = ''
    const pagePersona = typeof options.persona === 'string' ? options.persona.trim() : ''
    if (pagePersona && byId.has(pagePersona)) {
      personaId = pagePersona
      personaFrom = 'page'
    } else if (pagePersona) {
      missingPersona = pagePersona
    } else {
      const fallback =
        personas.find((e) => e.default === true && options.enabled?.[e.id] !== false) ||
        personas.find((e) => e.builtin !== true && options.enabled?.[e.id] !== false)
      if (fallback) {
        personaId = fallback.id
        personaFrom = 'auto'
      }
    }

    if (!personaId) {
      if (missingPersona) {
        const names = personas.slice(0, 4).map((e) => e.name || e.id).join('、')
        return {
          ...blank(modeFrom, mode, '', 'persona-missing'),
          blocked: names
            ? `指定的「${missingPersona}」已经不在了：现在可用的有 ${names}${personas.length > 4 ? ' 等' : ''}`
            : `指定的「${missingPersona}」已经不在了，来源里也还没有其它人设`,
          missingPersona,
        }
      }
      const why = personas.length
        ? '还没有选人设：左边挑一条「人设」点"设为当前人设"'
        : '来源里还没有人设（.md）：导入一份试试'
      return { ...blank(modeFrom, mode, '', personas.length ? 'no-persona' : 'no-persona-file'), blocked: why }
    }

    const persona = byId.get(personaId)
    const skills = entries
      .filter((e) => e.kind !== 'persona' && options.enabled?.[e.id] === true)
      .map((e) => ({ id: e.id, name: e.name, text: e.text }))

    return {
      mode,
      modeFrom,
      personaId,
      personaName: persona?.name || personaId,
      personaFrom,
      skills,
      blocked: '',
      blockedCode: '',
      ready: true,
    }
  }

  globalThis.PurgePlan = { resolve, applyPrefs, MODES }
})()
