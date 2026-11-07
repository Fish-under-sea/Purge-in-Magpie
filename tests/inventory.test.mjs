// 清点与判型：四类输入（会话导出包 / DSH 插件包 / 人设技能 / 裸文本）都要认得出，
// 坏包要拒绝并说原因，不能把「未知」当成功。
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { mergeEntries, scan, validateArchive } from '../lib/inventory.mjs'
import { makeZip } from './helpers/zip-store.mjs'

const dirs = []
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'purge-scan-'))
  dirs.push(dir)
  return dir
}
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

const PERSONA_MD = `---
id: anima
name: Anima
description: 一个小写手人设
---
你是 Anima，写东西时只讲看见的细节。`

const SKILL_MD = `---
name: outline
description: 把长文拆成提纲
---
## 用法

先列三层提纲，再补细节。`

test('目录里的人生设、技能、裸文本各认各的', () => {
  const dir = workspace()
  writeFileSync(join(dir, 'p.md'), PERSONA_MD)
  writeFileSync(join(dir, 's.md'), SKILL_MD)
  writeFileSync(join(dir, 'note.txt'), '随手记的一条规则')
  const { entries, sources } = scan([dir])
  const kinds = entries.map((e) => e.kind).sort()
  assert.deepEqual(kinds, ['persona', 'skill', 'text'])
  assert.equal(entries.length, 3)
  const persona = entries.find((e) => e.kind === 'persona')
  assert.equal(persona.name, 'Anima')
  assert.equal(persona.injectable, true)
  assert.ok(!persona.text.includes('description:'), 'frontmatter 不该进正文')
  assert.ok(persona.text.startsWith('你是 Anima'))
  assert.equal(sources[0].ok, true)
  assert.equal(sources[0].count, 3)
})

test('ZIP 形态的会话导出包：清单 + 会话文件都校验', () => {
  const dir = workspace()
  const manifest = {
    format: 'dsh-session-archive',
    version: 1,
    rootPath: 'session.v4.jsonl',
    root: { title: '夜里的对话', cwd: '/root/x' },
    sessions: [{ id: 's1', path: 'session.v4.jsonl', title: '夜里的对话' }],
    selection: { turns: [1, 2, 3] },
  }
  writeFileSync(join(dir, 'chat.zip'), makeZip({
    'manifest.json': JSON.stringify(manifest),
    'session.v4.jsonl': '{"type":"message"}\n',
  }))
  const { entries, rejected } = scan([dir])
  assert.equal(rejected.length, 0)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].kind, 'session-archive')
  assert.equal(entries[0].name, '夜里的对话')
  assert.equal(entries[0].meta.turns, 3)
})

test('ZIP 里的 manifest 指向不存在的会话文件 → 拒绝', () => {
  const dir = workspace()
  const manifest = { format: 'dsh-session-archive', version: 1, rootPath: 'missing.jsonl', sessions: [{ id: 's1', path: 'missing.jsonl' }] }
  writeFileSync(join(dir, 'half.zip'), makeZip({ 'manifest.json': JSON.stringify(manifest) }))
  const { entries, rejected } = scan([dir])
  assert.equal(entries.length, 0)
  assert.equal(rejected.length, 1)
  assert.match(rejected[0].reason, /不在包里/)
  assert.equal(validateArchive(manifest, ['manifest.json']), 'manifest.rootPath 指向的 missing.jsonl 不在包里')
})

test('ZIP 形态的 DSH 插件包按 cordis.patch.yml 认出来', () => {
  const dir = workspace()
  writeFileSync(join(dir, 'plug.zip'), makeZip({
    'demo/package.json': JSON.stringify({ name: '@local/demo', version: '1.0.0' }),
    'demo/cordis.patch.yml': 'name: demo\n',
    'demo/index.js': 'export default {}\n',
  }))
  const { entries } = scan([dir])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].kind, 'cordis-plugin')
  assert.equal(entries[0].name, '@local/demo')
})

test('路径越界的 ZIP 整个拒绝，不是跳过那一条', () => {
  const dir = workspace()
  writeFileSync(join(dir, 'evil.zip'), makeZip({
    'manifest.json': '{}',
    '../escaped.md': 'x',
  }))
  const { entries, rejected } = scan([dir])
  assert.equal(entries.length, 0)
  assert.equal(rejected.length, 1)
  assert.match(rejected[0].reason, /越界/)
})

test('坏 JSON 记成拒绝，别的条目不受影响', () => {
  const dir = workspace()
  writeFileSync(join(dir, 'broken.json'), '{ this is not json')
  writeFileSync(join(dir, 'ok.md'), PERSONA_MD)
  const { entries, rejected } = scan([dir])
  assert.equal(entries.length, 1)
  assert.equal(rejected.length, 1)
  assert.match(rejected[0].reason, /JSON 坏了/)
})

test('超过大小上限的文件被拒绝', () => {
  const dir = workspace()
  writeFileSync(join(dir, 'big.md'), 'x'.repeat(9 * 1024 * 1024))
  const { entries, rejected } = scan([dir])
  assert.equal(entries.length, 0)
  assert.match(rejected[0].reason, /超过/)
})

test('不认的后缀不进清单', () => {
  const dir = workspace()
  writeFileSync(join(dir, 'tool.exe'), Buffer.from([0x4d, 0x5a]))
  const { entries, rejected } = scan([dir])
  assert.equal(entries.length, 0)
  assert.equal(rejected.length, 0)
})

test('同一个摘要算重复，同 id 新摘要算新版本', () => {
  const base = { id: 'anima', name: 'Anima', kind: 'persona', status: 'ok', injectable: true, source: { root: '/x', rel: 'a.md' }, size: 10, importedAt: 1 }
  const v1 = { ...base, digest: 'd1', text: '第一版' }
  const v2 = { ...base, digest: 'd2', text: '第二版' }
  const merged = mergeEntries([v2], [v1])
  assert.equal(merged.entries.length, 1)
  assert.equal(merged.entries[0].version, 2)
  assert.equal(merged.entries[0].history[0].digest, 'd1')
  // 历史不再留正文副本：正文一律现读源文件（避免把手册聚进 state 里被判毒）
  assert.equal(merged.entries[0].history[0].text, '')

  const dup = mergeEntries([{ ...v1 }], [v1])
  assert.equal(dup.entries.length, 1)
  assert.equal(dup.duplicates.length, 1)
  assert.match(dup.duplicates[0].reason, /内容相同/)
})