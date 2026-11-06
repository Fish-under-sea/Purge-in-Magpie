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
