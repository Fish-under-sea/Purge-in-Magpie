// 四种 protocol 的 system 落点与四种模式：改写只动该动的地方，块结构不能被打散。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compose, rewrite, stripIdentity, supported } from '../lib/rewrite.mjs'

const HOST = 'You are Claude Code, Anthropic\'s official CLI.\nBe brief.'

test('anthropic append：人设块在前，原块与 cache_control 原样保留', () => {
  const body = { system: [{ type: 'text', text: HOST, cache_control: { type: 'ephemeral' } }] }
  rewrite(body, 'anthropic', '你是 Anima', 'append')
  assert.equal(body.system.length, 2)
  assert.equal(body.system[0].text, '你是 Anima')
  assert.equal(body.system[1].text, HOST)
  assert.deepEqual(body.system[1].cache_control, { type: 'ephemeral' })
})

test('anthropic strict：只留人设；replace：删掉自称行', () => {
  const strict = { system: 'You are Claude Code.\nBe brief.' }
  rewrite(strict, 'anthropic', '你是 Anima', 'strict')
  assert.deepEqual(strict.system, [{ type: 'text', text: '你是 Anima' }])

  const replaced = { system: 'You are Claude Code.\nBe brief.' }
  rewrite(replaced, 'anthropic', '你是 Anima', 'replace')
  assert.equal(replaced.system[1].text, 'Be brief.')
})

test('chat：strict 把 system/developer 合成一条，append 保留原消息', () => {
  const body = { messages: [{ role: 'developer', content: 'You are Codex.' }, { role: 'user', content: 'hi' }] }
  rewrite(body, 'chat', '你是 Anima', 'append')
  assert.equal(body.messages[0].content, `你是 Anima\n\nYou are Codex.`)
  assert.equal(body.messages.length, 2)

  const strict = { messages: [{ role: 'system', content: 'You are Codex.' }, { role: 'user', content: 'hi' }] }
  rewrite(strict, 'chat', '你是 Anima', 'strict')
  assert.equal(strict.messages.length, 2)
  assert.equal(strict.messages[0].content, '你是 Anima')
  assert.equal(strict.messages[0].role, 'system')
})

test('responses：instructions 是唯一落点', () => {
  const body = { instructions: 'You are ChatGPT.' }
  rewrite(body, 'responses', '你是 Anima', 'replace')
  assert.equal(body.instructions, '你是 Anima')
})

test('gemini：systemInstruction.parts 保留其余字段', () => {
  const body = { systemInstruction: { role: 'system', parts: [{ text: 'You are Gemini.' }] } }
  rewrite(body, 'gemini', '你是 Anima', 'append')
  assert.equal(body.systemInstruction.role, 'system')
  assert.equal(body.systemInstruction.parts[0].text, '你是 Anima')
  assert.equal(body.systemInstruction.parts[1].text, 'You are Gemini.')
})

test('off、未知 protocol、空文本都不改请求', () => {
  const body = { system: 'You are Claude Code.' }
  const snapshot = JSON.stringify(body)
  rewrite(body, 'anthropic', '你是 Anima', 'off')
  rewrite(body, 'anthropic', '你是 Anima', 'nope')
  rewrite(body, 'gemini-pro', '你是 Anima', 'append')
  rewrite(body, 'anthropic', '', 'append')
  assert.equal(JSON.stringify(body), snapshot)
  assert.equal(supported('anthropic'), true)
  assert.equal(supported('weird'), false)
})

test('stripIdentity 只删同时有自称与点名的行', () => {
  const kept = 'You are wonderful.\n你没点名厂商，保留。'
  assert.equal(stripIdentity(kept), kept)
  assert.equal(stripIdentity('You are Claude.\n第二行'), '第二行')
  assert.equal(stripIdentity('我是 DeepSeek 助手。'), '')
})

test('compose：人设在前，技能带标题依次排开', () => {
  const text = compose({ persona: '人设正文', skills: [{ name: '提纲', text: '先列三层' }, { name: '空', text: '  ' }] })
  assert.equal(text, '人设正文\n\n## 技能：提纲\n\n先列三层')
})