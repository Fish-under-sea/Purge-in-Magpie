// agent-purge 原生语义：state.json 的 default.mode / persona / overrides / disabledHarnesses。
// 插件要认它（用户原来怎么用还怎么用），但不能被一份坏 JSON 带坏。
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { forAgent, purgeHome, readState, statePath } from '../lib/agentpurge.mjs'

const dirs = []
function home() {
  const dir = mkdtempSync(join(tmpdir(), 'purge-state-'))
  dirs.push(dir)
  return dir
}
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

const write = (dir, data) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'state.json'), typeof data === 'string' ? data : JSON.stringify(data))
}

test('AGENT_PURGE_HOME 优先，否则 ~/.agent-purge', () => {
  assert.equal(purgeHome({ AGENT_PURGE_HOME: 'D:/p' }), 'D:/p')
  assert.match(purgeHome({}), /\.agent-purge$/)
  assert.equal(statePath({ AGENT_PURGE_HOME: 'D:/p' }).replace(/\\/g, '/'), 'D:/p/state.json')
})

test('没有 state.json 时 bound=false，不是错误', () => {
  const dir = home()
  const state = readState({ AGENT_PURGE_HOME: dir })
  assert.equal(state.bound, false)
  assert.equal(state.error, '')
  assert.equal(forAgent(state, 'claude').blocked, '')
})

test('读到 default.mode 与 persona', () => {
  const dir = home()
  write(dir, { default: { mode: 'replace' }, persona: 'anima' })
  const state = readState({ AGENT_PURGE_HOME: dir })
  assert.equal(state.bound, true)
  assert.equal(state.mode, 'replace')
  assert.equal(state.persona, 'anima')
  const pick = forAgent(state, 'claude')
  assert.equal(pick.mode, 'replace')
  assert.equal(pick.persona, 'anima')
  assert.equal(pick.blocked, '')
})

test('per-harness override 盖住全局', () => {
  const dir = home()
  write(dir, {
    default: { mode: 'replace' },
    persona: 'anima',
    overrides: { codex: { mode: 'strict', persona: 'other' } },
  })
  const state = readState({ AGENT_PURGE_HOME: dir })
  const codex = forAgent(state, 'codex')
  assert.equal(codex.mode, 'strict')
  assert.equal(codex.persona, 'other')
  const claude = forAgent(state, 'claude')
  assert.equal(claude.mode, 'replace')
  assert.equal(claude.persona, 'anima')
})

test('disabledHarnesses 让这个 agent 整个不做', () => {
  const dir = home()
  write(dir, { default: { mode: 'replace' }, persona: 'anima', disabledHarnesses: ['claude'] })
  const state = readState({ AGENT_PURGE_HOME: dir })
  const pick = forAgent(state, 'claude')
  assert.match(pick.blocked, /关掉了这个 harness/)
  assert.equal(forAgent(state, 'codex').blocked, '')
})

test('default.mode 为 off 时全局不做', () => {
  const dir = home()
  write(dir, { default: { mode: 'off' }, persona: 'anima' })
  const state = readState({ AGENT_PURGE_HOME: dir })
  assert.match(forAgent(state, 'claude').blocked, /off/)
})

test('坏 JSON / 非对象都不抛，bound=false 并带原因', () => {
  const bad = home()
  write(bad, '{ broken')
  const s1 = readState({ AGENT_PURGE_HOME: bad })
  assert.equal(s1.bound, false)
  assert.match(s1.error, /state\.json 坏了/)

  const arr = home()
  write(arr, '[]')
  const s2 = readState({ AGENT_PURGE_HOME: arr })
  assert.equal(s2.bound, false)
  assert.match(s2.error, /不是一个对象/)
})

test('认不出的 mode 被忽略，不会把请求改坏', () => {
  const dir = home()
  write(dir, { default: { mode: 'nonsense' }, persona: 'anima' })
  const state = readState({ AGENT_PURGE_HOME: dir })
  assert.equal(state.mode, '')
  assert.equal(forAgent(state, 'claude').mode, '')
})