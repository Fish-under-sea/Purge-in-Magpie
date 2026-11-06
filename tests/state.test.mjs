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

  // 不再有「来源目录」：唯一入口是导入（原件被复制进 state/imports 再扫描）。
  const { catalog, snapshot } = sync(here, {
    imports: [{ op: 'import', path: join(src, 'anima.md'), at: 1 }],
    mode: 'append',
  }, { force: true })
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

test('导入与刷新戳都没变时不重扫', () => {
  const here = workspace()
  const src = join(here, 'src')
  mkdirSync(src)
  writeFileSync(join(src, 'a.md'), '---\nid: a\n---\nA')
  const imports = [{ op: 'import', path: join(src, 'a.md'), at: 1 }]
  const first = sync(here, { imports, refreshAt: 1 }, { force: true })
  const second = sync(here, { imports, refreshAt: 1 })
  assert.equal(second.changed, false)
  assert.equal(second.catalog.version, first.catalog.version)

  const forced = sync(here, { imports, refreshAt: 2 })
  assert.equal(forced.changed, true)
  assert.ok(forced.catalog.version > first.catalog.version)
})

test('导入时指定的类型写进副本的 frontmatter，判定就按它来', () => {
  const here = workspace()
  const outside = join(here, 'outside')
  mkdirSync(outside)
  // 这份正文长得像人设（第二人称、无标题），但用户说它是技能——以用户的为准。
  const file = join(outside, 'thing.md')
  writeFileSync(file, '---\nid: thing\nname: 我的东西\n---\n你是某个东西。')

  const { catalog, snapshot } = sync(here, {
    imports: [{ op: 'import', path: file, at: 20, kind: 'skill' }],
  }, { force: true })

  const entry = snapshot.entries.find((e) => e.id === 'thing')
  assert.ok(entry, '导入后应该有条目')
  assert.equal(entry.kind, 'skill', '用户指定 skill 就该是 skill')
  // 副本里确实写进去了：类型跟着文件走，不靠 options 里一份易失的映射。
  const onDisk = readFileSync(catalog.imports[0].file, 'utf8')
  assert.match(onDisk, /^kind: skill$/m)
  // frontmatter 不进 system：正文还是干净的那一句。
  assert.equal(catalog.entries.find((e) => e.id === 'thing').text, '你是某个东西。')
})

test('导入请求把文件复制进 state/imports，并作为来源出现在快照里', () => {
  const here = workspace()
  const outside = join(here, 'outside')
  mkdirSync(outside)
  const file = join(outside, 'mine.md')
  writeFileSync(file, '---\nid: mine\nname: 导入的人设\n---\n导入正文')

  const { catalog, snapshot } = sync(here, {
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