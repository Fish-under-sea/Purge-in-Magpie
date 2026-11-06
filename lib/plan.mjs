// 「这一次请求会注入什么」的判定：钩子拿它决定改不改，页面拿它显示状态。
//
// 先到先得：
//   1. 插件页显式选过的（options.mode / options.persona）；
//   2. agent-purge 的 state.json —— 只在 options.useAgentPurge 明确打开时才看（默认关）；
//   3. 兜底：mode 视为 off；人设取标了 default 的内置人设，再不行取第一个启用的用户人设。
//
// 第 2 层默认关掉：装了这个插件的人未必装过上游，静默去读别人的 state.json
// 会让「我什么都没配，怎么 system 被换了」变成真的。要用就显式开。
import { MODES } from './rewrite.mjs'
import { forAgent } from './agentpurge.mjs'

/**
 * applyPrefs 把用户在页面上「改过 / 删过」的结果套回条目列表。
 *
 * 页面写不了磁盘（内置技能在包里，改不动；state/imports 归后端管），
 * 所以编辑与删除都存在 options 里，由这里统一套用：
 *   options.overrides[id] = 新正文   改了哪条就用这份正文，原件不动
 *   options.removed[id] = true       这条不再出现在列表里，也不参与注入
 *
 * hooks.js 与 page/plan.js 必须用同一套规则，否则页面答应的事网关不认。
 * tests/plan-parity.test.mjs 会拿同一批输入比两边。
 */
export function applyPrefs(entries = [], options = {}) {
  const ov = options && typeof options.overrides === 'object' && options.overrides ? options.overrides : {}
  const rm = options && typeof options.removed === 'object' && options.removed ? options.removed : {}
  return entries
    .filter((e) => e && typeof e.id === 'string' && rm[e.id] !== true)
    .map((e) => {
      const edited = ov[e.id]
      return typeof edited === 'string' && edited.trim() ? { ...e, text: edited, edited: true } : e
    })
}

/**
 * resolve 判定这次注入。
 * @param {object} p
 * @param {object} p.options 插件 options（plugins.json）
 * @param {object} p.state agent-purge 的 readState() 结果；没有就传 null
 * @param {object[]} p.entries 可注入的条目（带 text 的）
 * @param {string} [p.agent] 当前请求的 agent 名；页面判定全局时不传
 * @returns {{mode: string, modeFrom: string, personaId: string, personaName: string, personaFrom: string, skills: object[], blocked: string, ready: boolean}}
 */
export function resolve({ options = {}, state = null, entries = [], agent = '' } = {}) {
  const ap = options.useAgentPurge === true ? forAgent(state, agent) : { mode: '', persona: '', blocked: '' }
  if (ap.blocked) {
    return blank('agent-purge', ap.mode || '', ap.blocked, ap.mode === 'off' ? 'ap-off' : 'ap-disabled')
  }

  // ---- 模式 ----
  const pageMode = MODES.includes(options.mode) ? options.mode : ''
  const mode = pageMode || ap.mode || 'off'
  const modeFrom = pageMode ? 'page' : ap.mode ? 'agent-purge' : 'default'
  if (mode === 'off') {
    return {
      ...blank(modeFrom, mode, '', modeFrom === 'default' ? 'no-mode' : 'mode-off'),
      blocked: modeFrom === 'default'
        ? '还没选模式：模式是 off，请求原样放行。选一个模式（比如 replace）就开始注入'
        : '当前模式是 off，请求原样放行',
    }
  }

  // ---- 人设 ----
  const byId = new Map()
  for (const e of entries) if (e && typeof e.id === 'string' && !byId.has(e.id)) byId.set(e.id, e)
  const personas = entries.filter((e) => e.kind === 'persona')

  let personaId = ''
  let personaFrom = ''
  let missingPersona = ''
  const pagePersona = typeof options.persona === 'string' ? options.persona.trim() : ''
  if (pagePersona && byId.has(pagePersona)) {
    personaId = pagePersona
    personaFrom = 'page'
  } else if (ap.persona && byId.has(ap.persona)) {
    personaId = ap.persona
    personaFrom = 'agent-purge'
  } else if (pagePersona || ap.persona) {
    // 指名要谁却找不到，就不偷偷换一个人设顶上：那会让「明明选了 A，注入的却是 B」
    missingPersona = pagePersona || ap.persona
  } else {
    // 自动挑：先看有没有标了 default 的内置人设（大肥鱼这类「底座人设」就是为这个位置准备的），
    // 再退回第一个启用的用户人设。两条都找不到才算「还没选人设」。
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
      // 指名要谁却找不到：不偷偷换人（那会变成「我选了 A，注入的却是 B」），
      // 但要把「现在能挑谁」直接列出来——否则用户只看到一句「不在来源里」，无从下手。
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
      ? '还没有选人设：左边挑一条「人设」点“设为当前人设”'
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

function blank(modeFrom, mode, blocked, blockedCode = '') {
  return { mode: mode || 'off', modeFrom, personaId: '', personaName: '', personaFrom: '', skills: [], blocked, blockedCode, ready: false, missingPersona: '' }
}