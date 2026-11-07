// 「这次到底注不注、注谁、为什么没注」的判定：页面靠它显示状态条，钩子靠它决定改不改。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from '../lib/plan.mjs'

const entries = [
  { id: 'anima', name: 'Anima', kind: 'persona', text: '人设正文' },
  { id: 'outline', name: '提纲', kind: 'skill', text: '先列三层' },
]

const ap = (over = {}) => ({ bound: true, mode: 'replace', persona: 'anima', disabled: [], overrides: {}, error: '', ...over })

test('页面选了模式与人设 → 就绪，来源都写「本页设置」', () => {
  const plan = resolve({ options: { mode: 'append', persona: 'anima', enabled: { outline: true } }, state: null, entries })
  assert.equal(plan.ready, true)
  assert.equal(plan.mode, 'append')
  assert.equal(plan.modeFrom, 'page')
  assert.equal(plan.personaId, 'anima')
  assert.equal(plan.personaFrom, 'page')
  assert.deepEqual(plan.skills.map((s) => s.id), ['outline'])
})

test('没打开 useAgentPurge 时不读上游：即使有 state 也按「注入是关的」处理', () => {
  const plan = resolve({ options: {}, state: ap(), entries })
  assert.equal(plan.ready, false)
  assert.equal(plan.blockedCode, 'no-mode')
})

test('打开 useAgentPurge 后才跟随上游，并把来源标成 agent-purge', () => {
  const plan = resolve({ options: { useAgentPurge: true }, state: ap(), entries })
  assert.equal(plan.ready, true)
  assert.equal(plan.mode, 'replace')
  assert.equal(plan.modeFrom, 'agent-purge')
  assert.equal(plan.personaFrom, 'agent-purge')
})

test('都没有时没就绪，原因是「注入是关的」', () => {
  const plan = resolve({ options: {}, state: null, entries })
  assert.equal(plan.ready, false)
  assert.equal(plan.blockedCode, 'no-mode')
  // 「开不开」现在由页面那颗开关负责，所以文案说的是去按「开始注入」，
  // 不再让人去下拉里挑模式——模式本身已经选好了。
  assert.match(plan.blocked, /注入是关的/)
  assert.match(plan.blocked, /开始注入/)
})

test('有模式没人设：来源里一条人设都没有 → no-persona-file', () => {
  const plan = resolve({ options: { mode: 'append' }, state: null, entries: [entries[1]] })
  assert.equal(plan.blockedCode, 'no-persona-file')
  assert.match(plan.blocked, /还没有人设/)
})

test('有人设但没选 → auto 取第一条，并把来源标成 auto', () => {
  const plan = resolve({ options: { mode: 'append' }, state: null, entries })
  assert.equal(plan.ready, true)
  assert.equal(plan.personaId, 'anima')
  assert.equal(plan.personaFrom, 'auto')
})

test('人设被人为停用（enabled=false）时不参与 auto', () => {
  const plan = resolve({ options: { mode: 'append', enabled: { anima: false } }, state: null, entries })
  assert.equal(plan.ready, false)
  assert.equal(plan.blockedCode, 'no-persona')
})

test('上游指定的人设不在来源里 → persona-missing 并点名，不偷偷换人设', () => {
  const plan = resolve({ options: { useAgentPurge: true }, state: ap({ persona: 'ghost' }), entries })
  assert.equal(plan.ready, false)
  assert.equal(plan.blockedCode, 'persona-missing')
  assert.match(plan.blocked, /ghost/)
})

test('页面指定的人设不在来源里 → 同样 persona-missing', () => {
  const plan = resolve({ options: { mode: 'append', persona: 'ghost' }, state: null, entries })
  assert.equal(plan.ready, false)
  assert.equal(plan.blockedCode, 'persona-missing')
})

test('上游关掉这个 harness → blocked，模式字段不误导成 off', () => {
  const plan = resolve({ options: { useAgentPurge: true }, state: ap({ disabled: ['claude'] }), entries, agent: 'claude' })
  assert.equal(plan.ready, false)
  assert.equal(plan.blockedCode, 'ap-disabled')
  assert.match(plan.blocked, /关掉了这个 harness/)
})

test('auto：没指定人设时取第一条人设', () => {
  const plan = resolve({ options: { mode: 'strict' }, state: null, entries: [entries[1], entries[0]] })
  assert.equal(plan.ready, true)
  assert.equal(plan.personaId, 'anima')
  assert.equal(plan.personaFrom, 'auto')
})

test('普通内置人设不参与 auto：用户没选就不会被悄悄接管', () => {
  const withBuiltin = [
    { id: 'some-tool', name: '某工具人设', kind: 'persona', text: '工具人设', builtin: true },
    { id: 'anima', name: 'Anima', kind: 'persona', text: '人设正文' },
  ]
  const plan = resolve({ options: { mode: 'append' }, state: null, entries: withBuiltin })
  assert.equal(plan.personaId, 'anima', '应跳过内置，选用户自己的')

  const onlyBuiltin = resolve({ options: { mode: 'append' }, state: null, entries: [withBuiltin[0]] })
  assert.equal(onlyBuiltin.ready, false, '只有普通内置人设时不该自动注入')
})

test('标了 default 的底座人设参与 auto：没人设时由它顶上', () => {
  const withBase = [
    { id: 'dafeiyu', name: '大肥鱼', kind: 'persona', text: '底座正文', builtin: true, default: true },
    { id: 'recon', name: '侦察', kind: 'skill', text: '技能正文' },
  ]
  const plan = resolve({ options: { mode: 'replace', enabled: { recon: true } }, state: null, entries: withBase })
  assert.equal(plan.ready, true)
  assert.equal(plan.personaId, 'dafeiyu')
  assert.equal(plan.personaFrom, 'auto')
  assert.deepEqual(plan.skills.map((s) => s.id), ['recon'])
})

test('底座人设被停用后也能选用户自己的人设顶上', () => {
  const entries = [
    { id: 'dafeiyu', name: '大肥鱼', kind: 'persona', text: '底座正文', builtin: true, default: true },
    { id: 'anima', name: 'Anima', kind: 'persona', text: '人设正文' },
  ]
  const plan = resolve({ options: { mode: 'replace', enabled: { dafeiyu: false } }, state: null, entries })
  assert.equal(plan.personaId, 'anima')
  assert.equal(plan.personaFrom, 'auto')
})

test('显式指定内置人设时照用（用户点了就听用户的）', () => {
  const withBuiltin = [{ id: 'dafeiyu', name: '大肥鱼', kind: 'persona', text: '底座正文', builtin: true, default: true }]
  const plan = resolve({ options: { mode: 'append', persona: 'dafeiyu' }, state: null, entries: withBuiltin })
  assert.equal(plan.ready, true)
  assert.equal(plan.personaId, 'dafeiyu')
  assert.equal(plan.personaFrom, 'page')
})