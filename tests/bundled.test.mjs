// 包内专家技能：随包分发、永远在场、不进「来源」的增删，页面能区分它们。
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { readBundled } from '../lib/bundled.mjs'
import { sync } from '../lib/state.mjs'

const dirs = []
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'purge-bundled-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'page'), { recursive: true })
  mkdirSync(join(dir, 'skills'), { recursive: true })
  mkdirSync(join(dir, 'personas'), { recursive: true })
  return dir
}
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

const skill = (id, name) => `---\nid: ${id}\nname: ${name}\nkind: skill\ndescription: ${name} 的说明\n---\n${name} 的正文`

test('读包内 skills/ 与 personas/，按 kind 分', () => {
  const root = workspace()
  writeFileSync(join(root, 'skills', 'recon.md'), skill('recon', '侦察'))
  writeFileSync(join(root, 'personas', 'forge.md'), '---\nid: forge\nname: Forge\nkind: persona\n---\n编译器正文')
  const got = readBundled(root)
  assert.equal(got.ok, true)
  assert.equal(got.entries.length, 2)
  const byKind = Object.fromEntries(got.entries.map((e) => [e.kind, e]))
  assert.equal(byKind.skill.name, '侦察')
  assert.equal(byKind.persona.name, 'Forge')
  assert.equal(byKind.skill.builtin, true)
  assert.ok(byKind.skill.text.includes('侦察 的正文'))
})

test('人设排在技能前（列表里先看到「谁来写」，再看到「会什么」）', () => {
  const root = workspace()
  writeFileSync(join(root, 'skills', 'a.md'), skill('a', 'A'))
  writeFileSync(join(root, 'personas', 'p.md'), '---\nid: p\nname: P\nkind: persona\n---\n正文')
  const got = readBundled(root)
  assert.equal(got.entries[0].kind, 'persona')
})

test('目录不存在时不算错，只是没有内置条目', () => {
  const root = mkdtempSync(join(tmpdir(), 'purge-nobuiltin-'))
  dirs.push(root)
  const got = readBundled(root)
  assert.equal(got.entries.length, 0)
  assert.equal(got.ok, false)
  assert.equal(got.error, '')
})

test('sync 把内置条目放进快照，且标 builtin', () => {
  const root = workspace()
  writeFileSync(join(root, 'skills', 'recon.md'), skill('recon', '侦察'))
  const { snapshot, catalog } = sync(root, { sources: [] }, { force: true })
  assert.equal(snapshot.entries.length, 1)
  assert.equal(snapshot.entries[0].builtin, true)
  assert.equal(catalog.entries[0].id, 'recon')
  // 内置目录作为一条「来源」出现在快照里，页面能显示它是包内的
  assert.ok(snapshot.sources.some((s) => s.bundled === true))
})

test('内置专家随包更新：改了正文，签名变了会重扫', () => {
  const root = workspace()
  writeFileSync(join(root, 'skills', 'recon.md'), skill('recon', '侦察'))
  const first = sync(root, { sources: [] }, { force: true })
  const same = sync(root, { sources: [] })
  assert.equal(same.changed, false, '内容没变不该重扫')

  writeFileSync(join(root, 'skills', 'recon.md'), skill('recon', '侦察') + '\n新增一段')
  const next = sync(root, { sources: [] })
  assert.equal(next.changed, true, '专家正文变了必须重扫')
  assert.ok(next.catalog.entries[0].text.includes('新增一段'))
  assert.ok(next.catalog.version > first.catalog.version)
})