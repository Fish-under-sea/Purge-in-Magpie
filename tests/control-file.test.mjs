// agent-purge 的 state.json 是控制面，不是素材：它不该出现在条目列表里。
// 否则页面看起来像「导入了一个清单」，实际什么也不会发生。
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { scan } from '../lib/inventory.mjs'

const dirs = []
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'purge-ctrl-'))
  dirs.push(dir)
  return dir
}
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

test('agent-purge 的 state.json 不进条目表', () => {
  const dir = workspace()
  mkdirSync(join(dir, 'personas'), { recursive: true })
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ default: { mode: 'replace' }, persona: 'anima' }))
  writeFileSync(join(dir, 'personas', 'anima.md'), '---\nid: anima\nname: Anima\n---\n正文')
  const { entries } = scan([dir])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].kind, 'persona')
  assert.ok(!entries.some((e) => e.name === 'state.json'))
})

test('普通 JSON 清单仍然进条目表（别把控制面过滤误伤成全部过滤）', () => {
  const dir = workspace()
  writeFileSync(join(dir, 'notes.json'), JSON.stringify({ name: '我的清单', items: ['a', 'b'] }))
  const { entries } = scan([dir])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].kind, 'manifest')
  assert.equal(entries[0].name, '我的清单')
})

test('名字像 state.json 但内容不是控制面的，照样登记', () => {
  const dir = workspace()
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ name: '别的清单', items: [] }))
  const { entries } = scan([dir])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].kind, 'manifest')
})