// 选人与选版本：页面把 id / enabled / pinned 写进 options，钩子只按它取文本。
// 模式是判定的第一道门：没有模式（且没有 agent-purge state）就不注入。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pick } from '../hooks.js'

const catalog = {
  version: 3,
  entries: [
    { id: 'anima', name: 'Anima', kind: 'persona', status: 'ok', injectable: true, digest: 'd2', text: '新版人设', history: [{ digest: 'd1', version: 1, at: 1, text: '旧版人设' }] },
    { id: 'outline', name: '提纲', kind: 'skill', status: 'ok', injectable: true, digest: 's1', text: '先列三层', history: [] },
    { id: 'archive', name: '会话', kind: 'session-archive', status: 'ok', injectable: false, digest: 'z1', text: '', history: [] },
  ],
}

test('没指定人设时取第一个启用的人设，技能只认显式启用', () => {
  const picked = pick(catalog, { mode: 'append' })
  assert.equal(picked.personaId, 'anima')
  assert.equal(picked.skills.length, 0)
  assert.equal(picked.text, '新版人设')

  const withSkill = pick(catalog, { mode: 'append', enabled: { outline: true } })
  assert.equal(withSkill.skills.length, 1)
  assert.equal(withSkill.text, '新版人设\n\n## 技能：提纲\n\n先列三层')
})

test('固定到旧版本时用旧正文，并标出缺失的固定版本', () => {
  const pinned = pick(catalog, { mode: 'append', persona: 'anima', pinned: { anima: 'd1' } })
  assert.equal(pinned.text, '旧版人设')

  const missing = pick(catalog, { mode: 'append', persona: 'anima', pinned: { anima: 'gone' } })
  assert.equal(missing.text, '新版人设')
  assert.deepEqual(missing.missingPin, ['anima'])
})

test('人设指向不存在的条目时报 persona-missing，不偷偷换成别人', () => {
  const picked = pick(catalog, { mode: 'append', persona: 'nope' })
  assert.equal(picked.personaId, '')
  assert.equal(picked.text, '')
  assert.equal(picked.plan.blockedCode, 'persona-missing')
  assert.match(picked.plan.blocked, /nope/)
})

test('页面导入的人设（options.inline）也参与选择', () => {
  const inline = { inline: [{ id: 'mine', name: '我的人设', kind: 'persona', text: '我自己的正文' }] }
  const picked = pick(catalog, { ...inline, mode: 'append', persona: 'mine' })
  assert.equal(picked.text, '我自己的正文')
})

test('不可注入的条目不会被选成人设', () => {
  const onlyArchive = { entries: [catalog.entries[2]] }
  const picked = pick(onlyArchive, { mode: 'append' })
  assert.equal(picked.personaId, '')
  assert.equal(picked.text, '')
  assert.match(picked.plan.blocked, /还没有人设/)
})

test('没有模式（页面没选）时不注入，并说明原因', () => {
  const picked = pick(catalog, {})
  assert.equal(picked.text, '')
  assert.equal(picked.plan.mode, 'off')
  assert.match(picked.plan.blocked, /模式是 off/)
})

test('没打开 useAgentPurge 时上游的 state 不参与判定', () => {
  const state = { bound: true, mode: 'strict', persona: 'anima', disabled: [], overrides: {}, error: '' }
  const picked = pick(catalog, {}, state, 'claude')
  assert.equal(picked.plan.mode, 'off')
  assert.equal(picked.text, '')
})

test('打开 useAgentPurge 后才跟随上游的 state', () => {
  const state = { bound: true, mode: 'strict', persona: 'anima', disabled: [], overrides: {}, error: '' }
  const picked = pick(catalog, { useAgentPurge: true }, state, 'claude')
  assert.equal(picked.plan.mode, 'strict')
  assert.equal(picked.plan.modeFrom, 'agent-purge')
  assert.equal(picked.plan.personaFrom, 'agent-purge')
  assert.equal(picked.text, '新版人设')
})

test('页面显式选过模式时盖住上游', () => {
  const state = { bound: true, mode: 'strict', persona: 'anima', disabled: [], overrides: {}, error: '' }
  const picked = pick(catalog, { mode: 'append', useAgentPurge: true }, state, 'claude')
  assert.equal(picked.plan.mode, 'append')
  assert.equal(picked.plan.modeFrom, 'page')
})

test('上游关掉这个 harness 时整个不注入', () => {
  const state = { bound: true, mode: 'replace', persona: 'anima', disabled: ['claude'], overrides: {}, error: '' }
  const picked = pick(catalog, { mode: 'append', useAgentPurge: true }, state, 'claude')
  assert.equal(picked.text, '')
  assert.match(picked.plan.blocked, /关掉了这个 harness/)
})