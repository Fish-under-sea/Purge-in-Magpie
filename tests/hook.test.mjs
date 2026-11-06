// 钩子端到端：模式为 off / 不在 agents 名单 / protocol 不认识时都不能动请求；
// 真正改写时按 options 取文本，并把这次生效写成 last.json 给页面看。
// 用临时目录造一份插件根，别把本机真实 state 写脏。
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { createHook } from '../hooks.js'

const dirs = []
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'purge-hook-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'page'), { recursive: true })
  return dir
}
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

const ctxOf = (extra = {}) => {
  const calls = []
  return {
    calls,
    ctx: {
      protocol: 'anthropic',
      agent: 'claude',
      model: 'claude-sonnet-4.5',
      report: (code, bytes) => calls.push(`${code}:${bytes}`),
      ...extra,
    },
  }
}

test('mode=off 直接放行，不动 body', async () => {
  const hook = createHook(workspace())
  const body = { system: 'You are Claude Code.' }
  const snapshot = JSON.stringify(body)
  const out = await hook.onRequest(body, ctxOf({ options: { mode: 'off' } }).ctx)
  assert.equal(out, undefined)
  assert.equal(JSON.stringify(body), snapshot)
})

test('不在 agents 名单里就跳过', async () => {
  const hook = createHook(workspace())
  const body = { system: 'You are Claude Code.' }
  const snapshot = JSON.stringify(body)
  const out = await hook.onRequest(body, ctxOf({ agent: 'codex', options: { mode: 'append', agents: ['claude'] } }).ctx)
  assert.equal(out, undefined)
  assert.equal(JSON.stringify(body), snapshot)
})

test('protocol 不认识时报 unavailable，不改请求', async () => {
  const hook = createHook(workspace())
  const body = { system: 'x' }
  const { ctx, calls } = ctxOf({ protocol: 'mystery', options: { mode: 'append' } })
  const out = await hook.onRequest(body, ctx)
  assert.equal(out, undefined)
  assert.equal(body.system, 'x')
  assert.deepEqual(calls, ['unavailable:0'])
})

test('非对象 body 原样放行', async () => {
  const hook = createHook(workspace())
  assert.equal(await hook.onRequest(null, ctxOf({ options: { mode: 'append' } }).ctx), undefined)
  assert.equal(await hook.onRequest([1, 2], ctxOf({ options: { mode: 'append' } }).ctx), undefined)
})

test('有人设时按模式改写并写下 last.json', async () => {
  const root = workspace()
  const src = join(root, 'src')
  mkdirSync(src)
  writeFileSync(join(src, 'anima.md'), '---\nid: anima\nname: Anima\n---\n你是 Anima。')
  const hook = createHook(root)
  const body = { system: [{ type: 'text', text: 'You are Claude Code.\nBe brief.', cache_control: { type: 'ephemeral' } }] }
  const { ctx, calls } = ctxOf({ options: { mode: 'replace', persona: 'anima', sources: [src], refreshAt: 12345 } })
  const out = await hook.onRequest(body, ctx)
  assert.ok(out, '有文本时应返回改过的 body')
  assert.equal(body.system.length, 2)
  assert.equal(body.system[0].text, '你是 Anima。')
  assert.equal(body.system[1].text, 'Be brief.')
  assert.deepEqual(body.system[1].cache_control, { type: 'ephemeral' })
  assert.match(calls.at(-1), /^ready:/)

  const last = JSON.parse(readFileSync(join(root, 'state', 'last.json'), 'utf8'))
  assert.equal(last.mode, 'replace')
  assert.equal(last.persona, 'anima')
  assert.equal(last.protocol, 'anthropic')
})

test('来源目录空的时候不注入，也不改请求', async () => {
  const root = workspace()
  const src = join(root, 'src')
  mkdirSync(src)
  const hook = createHook(root)
  const body = { system: 'You are Claude Code.' }
  const out = await hook.onRequest(body, ctxOf({ options: { mode: 'strict', sources: [src], refreshAt: 999 } }).ctx)
  assert.equal(out, undefined)
  assert.equal(body.system, 'You are Claude Code.')
})