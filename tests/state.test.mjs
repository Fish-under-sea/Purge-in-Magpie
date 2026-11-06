// 落盘：后端把清点结果写成两份——state/catalog.json（含正文）与 page/catalog.js（页面快照）。
// 页面永远读不到正文全集，这是这个插件「页面不读盘」的落实点。
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { loadCatalog, snapshotFrom, sync } from '../lib/state.mjs'

const dirs = []
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'purge-state-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'page'), { recursive: true })
  return dir
}
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

test('sync 写出条目表与页面快照，可注入条目的正文随快照下来', () => {
  const here = workspace()
  const src = join(here, 'src')
  mkdirSync(src)
  writeFileSync(join(src, 'anima.md'), '---\nid: anima\nname: Anima\n---\n正文在这里')

  const { catalog, snapshot } = sync(here, { sources: [src], mode: 'append' }, { force: true })
  assert.equal(catalog.entries.length, 1)
  assert.equal(catalog.entries[0].text, '正文在这里')
  assert.equal(snapshot.entries.length, 1)
  // 页面要能「查看原文」：可注入条目的正文必须跟着快照走，否则按钮点开是空的。
  assert.equal(snapshot.entries[0].text, '正文在这里', '可注入条目要带正文')
  assert.equal(snapshot.options.mode, 'append')

  const onDisk = readFileSync(join(here, 'page', 'catalog.js'), 'utf8')
  assert.match(onDisk, /^window\.PURGE_CATALOG = /)
  assert.equal(loadCatalog({ catalogFile: join(here, 'state', 'catalog.json') }).entries.length, 1)
})

test('来源与刷新戳没变时不重扫', () => {
  const here = workspace()
  const src = join(here, 'src')
  mkdirSync(src)
  writeFileSync(join(src, 'a.md'), '---\nid: a\n---\nA')
  const first = sync(here, { sources: [src], refreshAt: 1 }, { force: true })
  const second = sync(here, { sources: [src], refreshAt: 1 })
  assert.equal(second.changed, false)
  assert.equal(second.catalog.version, first.catalog.version)

  const forced = sync(here, { sources: [src], refreshAt: 2 })
  assert.equal(forced.changed, true)
  assert.ok(forced.catalog.version > first.catalog.version)
})

test('导入请求把文件复制进 state/imports，并作为来源出现在快照里', () => {
  const here = workspace()
  const outside = join(here, 'outside')
  mkdirSync(outside)
  const file = join(outside, 'mine.md')
  writeFileSync(file, '---\nid: mine\nname: 导入的人设\n---\n导入正文')

  const { catalog, snapshot } = sync(here, {
    sources: [join(here, 'empty')],
    imports: [{ op: 'import', path: file, at: 10 }],
  }, { force: true })

  assert.equal(catalog.imports.length, 1)
  assert.equal(catalog.imports[0].ok, true)
  assert.ok(existsSync(catalog.imports[0].file))
  assert.equal(snapshot.entries.some((e) => e.id === 'mine'), true)
})

test('导入只认白名单后缀，拒绝也留原因', () => {
  const here = workspace()
  const outside = join(here, 'outside')
  mkdirSync(outside)
  const file = join(outside, 'tool.exe')
  writeFileSync(file, Buffer.from([0x4d, 0x5a]))

  const { catalog } = sync(here, { sources: [], imports: [{ op: 'import', path: file, at: 1 }] }, { force: true })
  assert.equal(catalog.imports[0].ok, false)
  assert.match(catalog.imports[0].error, /只接受/)
})

test('snapshotFrom 带上最近一次生效记录', () => {
  const here = workspace()
  mkdirSync(join(here, 'state'), { recursive: true })
  writeFileSync(join(here, 'state', 'last.json'), JSON.stringify({ at: 5, agent: 'claude', mode: 'strict' }))
  const snap = snapshotFrom({ stateDir: join(here, 'state'), lastFile: join(here, 'state', 'last.json') }, { version: 1, entries: [], sources: [], rejected: [] }, {})
  assert.equal(snap.last.mode, 'strict')
})