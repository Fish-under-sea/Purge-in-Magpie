// 选人与选版本：页面把 id / enabled / pinned 写进 options，钩子只按它取文本。
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

  const withSkill = pick(catalog, { enabled: { outline: true } })
  assert.equal(withSkill.skills.length, 1)
  assert.equal(withSkill.text, '新版人设\n\n## 技能：提纲\n\n先列三层')
})

test('固定到旧版本时用旧正文，并标出缺失的固定版本', () => {
  const pinned = pick(catalog, { persona: 'anima', pinned: { anima: 'd1' } })
  assert.equal(pinned.text, '旧版人设')

  const missing = pick(catalog, { persona: 'anima', pinned: { anima: 'gone' } })
  assert.equal(missing.text, '新版人设')
  assert.deepEqual(missing.missingPin, ['anima'])
})

test('人设指向不存在的条目时回落到默认，不注入空文本', () => {
  const picked = pick(catalog, { persona: 'nope' })
  assert.equal(picked.personaId, 'anima')
  assert.ok(picked.text.length > 0)
})

test('页面导入的人设（options.inline）也参与选择', () => {
  const inline = { inline: [{ id: 'mine', name: '我的人设', kind: 'persona', text: '我自己的正文' }] }
  const picked = pick(catalog, { ...inline, persona: 'mine' })
  assert.equal(picked.text, '我自己的正文')
})

test('不可注入的条目不会被选成人设', () => {
  const onlyArchive = { entries: [catalog.entries[2]] }
  const picked = pick(onlyArchive, {})
  assert.equal(picked.personaId, '')
  assert.equal(picked.text, '')
})