// 页面侧判定（page/plan.js）与网关侧判定（lib/plan.mjs）必须是同一套结论。
//
// 两边不同步的后果很具体：页面答应「会注入」，网关却没改请求；
// 或者页面说「不会注入」，其实已经改了。所以拿同一批输入跑两边，逐字段比。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolve as nodeResolve } from '../lib/plan.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/** loadPagePlan 把 page/plan.js 当普通脚本跑一遍，取出它挂到全局的那个对象。 */
function loadPagePlan() {
  const code = readFileSync(join(here, '..', 'page', 'plan.js'), 'utf8')
  const sandbox = { globalThis: {}, window: undefined }
  // page/plan.js 是 IIFE，只用 globalThis；用 Function 跑，不给它任何 Node 的全局。
  const fn = new Function('globalThis', `${code}\nreturn globalThis.PurgePlan`)
  const api = fn(sandbox.globalThis)
  assert.ok(api && typeof api.resolve === 'function', 'page/plan.js 应该导出 resolve')
  return api
}

const pagePlan = loadPagePlan()

const entries = [
  { id: 'base', name: '大肥鱼', kind: 'persona', text: '底座正文', builtin: true, default: true },
  { id: 'anima', name: 'Anima', kind: 'persona', text: '人设正文' },
  { id: 'recon', name: '侦察', kind: 'skill', text: '技能正文' },
  { id: 'hunter', name: '入口', kind: 'skill', text: '技能二' },
]

// 同一条输入分别喂给两边。node 侧不需要 agent-purge，所以传 state: null。
const cases = [
  ['没选模式', {}],
  ['模式 off', { mode: 'off' }],
  ['只有模式，人设靠底座顶上', { mode: 'replace' }],
  ['模式 + 显式人设', { mode: 'append', persona: 'anima' }],
  ['模式 + 指定的底座人设', { mode: 'replace', persona: 'base' }],
  ['底座人设被停用后回退到用户人设', { mode: 'replace', enabled: { base: false } }],
  ['人设指向不存在的东西', { mode: 'replace', persona: 'ghost' }],
  ['启用了技能', { mode: 'replace', enabled: { recon: true } }],
  ['启用了多个技能', { mode: 'replace', enabled: { recon: true, hunter: true } }],
  ['技能未显式启用', { mode: 'replace', enabled: {} }],
  ['strict 模式', { mode: 'strict', enabled: { recon: true } }],
]

test('页面判定与网关判定逐条一致', () => {
  for (const [name, options] of cases) {
    const fromPage = pagePlan.resolve({ options, entries })
    const fromNode = nodeResolve({ options, state: null, entries })
    const pick = (p) => ({
      mode: p.mode,
      modeFrom: p.modeFrom,
      personaId: p.personaId,
      personaName: p.personaName,
      personaFrom: p.personaFrom,
      skills: p.skills.map((s) => s.id).sort(),
      blocked: p.blocked,
      blockedCode: p.blockedCode,
      ready: p.ready,
      missingPersona: p.missingPersona || '',
    })
    assert.deepEqual(pick(fromPage), pick(fromNode), `用例「${name}」两边结论不同`)
  }
})

test('页面判定覆盖同一组模式取值', () => {
  assert.deepEqual([...pagePlan.MODES], ['off', 'strict', 'replace', 'append'])
})

// ---- 编辑与删除：options.overrides / options.removed ----
// 页面写不了磁盘，改过的正文和删掉的条目都只存在 options 里。
// hooks.js 与 page/plan.js 必须套用同一套规则，否则页面答应的事网关不认。

const { applyPrefs: nodePrefs } = await import('../lib/plan.mjs')

test('applyPrefs 两边逐条一致', () => {
  const cases = [
    ['没有改过也没删过', {}],
    ['改了一条', { overrides: { recon: '改过的侦察正文' } }],
    ['删了一条', { removed: { hunter: true } }],
    ['改了也删了', { overrides: { recon: '新正文' }, removed: { hunter: true } }],
    ['覆盖成空白等于没改', { overrides: { recon: '   ' } }],
    ['removed 里写 false 不算删', { removed: { hunter: false } }],
    ['删了不存在的 id 不影响别人', { removed: { ghost: true } }],
  ]
  for (const [name, options] of cases) {
    const a = pagePlan.applyPrefs(entries, options)
    const b = nodePrefs(entries, options)
    const pick = (list) => list.map((e) => ({ id: e.id, text: e.text, edited: Boolean(e.edited) }))
    assert.deepEqual(pick(a), pick(b), `用例「${name}」两边结果不同`)
  }
})

test('删除的条目不再参与判定，改过的正文会进 plan', () => {
  const options = {
    mode: 'replace',
    enabled: { recon: true, hunter: true },
    overrides: { recon: '新正文' },
    removed: { hunter: true },
  }
  const page = pagePlan.resolve({ options, entries: pagePlan.applyPrefs(entries, options) })
  const node = nodeResolve({ options, state: null, entries: nodePrefs(entries, options) })
  assert.deepEqual(page.skills.map((s) => s.id), node.skills.map((s) => s.id), '两边选中的技能不同')
  assert.deepEqual(page.skills.map((s) => s.id), ['recon'], '被删除的 hunter 不该出现')
  assert.equal(page.skills[0].text, '新正文', '技能应该带上改过的正文')
})

test('删掉当前人设后不会卡在 persona-missing', () => {
  // 页面删除时会同时把 options.persona 清空，这里验证清空之后确实能回落到默认人设
  const options = { mode: 'replace', persona: '', removed: { anima: true } }
  const plan = pagePlan.resolve({ options, entries: pagePlan.applyPrefs(entries, options) })
  assert.equal(plan.ready, true)
  assert.equal(plan.personaId, 'base', '应该回落到标了 default 的底座人设')
})
