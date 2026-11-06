// 从真实的 skills/ 与 personas/ 重新生成演示快照的 entries。
// 手写演示数据最容易和真身脱节——以前就有过「加了技能但预览看不见」。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const ROOT = 'D:/Fish-code/DSH-NEXT/插件/插件创作/Purge in Magpie'
const DEMO = join(ROOT, 'preview/catalog.demo.js')

const fm = (head, key) => {
  const m = head.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  return m ? m[1].trim() : ''
}
const split = (raw) => {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  return m ? { head: m[1], body: raw.slice(m[0].length).trim() } : { head: '', body: raw.trim() }
}

const rows = []
for (const [dir, fallbackKind] of [['personas', 'persona'], ['skills', 'skill']]) {
  for (const name of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.md')).sort()) {
    const raw = readFileSync(join(ROOT, dir, name), 'utf8')
    const { head, body } = split(raw)
    const kind = fm(head, 'kind') || fallbackKind
    rows.push({
      id: fm(head, 'id') || name.replace(/\.md$/, ''),
      name: fm(head, 'name') || name.replace(/\.md$/, ''),
      kind,
      status: 'ok',
      reason: '',
      source: { root: '（包内）' + dir, rel: name },
      size: Buffer.byteLength(raw, 'utf8'),
      digest: createHash('sha256').update(raw).digest('hex').slice(0, 16),
      importedAt: 0,
      version: 1,
      default: fm(head, 'default') === 'true' ? true : undefined,
      meta: {
        format: 'bundled',
        description: fm(head, 'description'),
        version: fm(head, 'version'),
        whenToUse: fm(head, 'whenToUse'),
        source: fm(head, 'source'),
      },
      chars: body.length,
      injectable: true,
      builtin: true,
      text: body,
    })
  }
}

// 一条「页面导入」的演示条目：它带着「删除导入 / 改判」两个按钮，不导入看不到
const inlineDemo = {
  id: 'mine',
  name: '我的技能',
  kind: 'skill',
  status: 'ok',
  reason: '',
  source: { root: 'state/imports', rel: 'mine.md' },
  size: 48,
  digest: 'de1a2b3c4d5e6f70',
  importedAt: 1794561661000,
  version: 1,
  meta: { format: 'markdown', description: '演示用的外来技能：正文从页面导入。' },
  chars: 30,
  injectable: true,
  builtin: false,
  text: '这是从页面导入的正文。\n\n## 用法\n\n点一下就来。\n',
}
// 一条素材：会话导出包，验证「不会进 system」那条路径
const materialDemo = {
  id: '5556',
  name: '5556',
  kind: 'session-archive',
  status: 'ok',
  reason: '',
  source: { root: 'state/imports', rel: '5556.zip' },
  size: 177986,
  digest: '948c5f9615e0c1d2',
  importedAt: 1794561661000,
  version: 1,
  meta: { format: 'dsh-session-archive', version: 1, sessions: 1, turns: 12, cwd: '/root/comfy ui' },
  chars: 0,
  injectable: false,
}

const entries = [...rows, inlineDemo, materialDemo]
const skills = rows.filter((r) => r.kind === 'skill')
const persona = rows.find((r) => r.default === true) || rows[0]

const firstSkill = skills[0]
const totalChars = persona.chars + firstSkill.chars

const body = `// 演示快照：给预览用。条目由 tools/build-demo.mjs 从真实的 skills/ 与 personas/ 生成，
// 别手改——改了会与真身脱节。真要改演示内容，改源文件再跑一次生成。
//   node preview/serve.mjs --demo
window.PURGE_CATALOG = {
  version: 12,
  generatedAt: 1794561661000,
  sources: [
    { path: '（包内）personas + skills', ok: true, count: ${rows.length}, error: '', bundled: true },
    { path: 'state/imports', ok: true, count: 2, error: '' },
  ],
  entries: ${JSON.stringify(entries, null, 2)},
  rejected: [],
  options: { mode: 'replace', enabled: { '${firstSkill.id}': true }, agents: [] },
  imports: [],
  duplicates: [],
  purge: { bound: false, mode: '', persona: '', disabled: [], error: '' },
  plan: {
    mode: 'replace',
    modeFrom: 'page',
    personaId: '${persona.id}',
    personaName: '${persona.name}',
    personaFrom: 'auto',
    skills: [{ id: '${firstSkill.id}', name: '${firstSkill.name}', text: '…' }],
    blocked: '',
    blockedCode: '',
    ready: true,
  },
  last: {
    at: 1794561421000,
    agent: 'claude',
    protocol: 'anthropic',
    model: 'claude-sonnet-4.5',
    mode: 'replace',
    persona: '${persona.id}',
    skills: ['${firstSkill.id}'],
    chars: ${totalChars},
    missingPin: [],
    catalogVersion: 12,
  },
}

// 预览开关：?unsent=1 把「最近一次生效」抹掉，好看到「确认注入」尚未按下的样子。
if (new URLSearchParams(location.search).get('unsent') === '1') {
  window.PURGE_CATALOG.last = null
}

// 预览开关：?inline=1 在「我的来源」里多造一条页面导入的条目（那条已默认包含）。
`

writeFileSync(DEMO, body, 'utf8')
console.log(`写入 ${DEMO}`)
console.log(`条目 ${entries.length} 条（人设 ${rows.filter((r) => r.kind === 'persona').length} / 技能 ${skills.length} / 演示导入 1 / 素材 1）`)
console.log(`默认人设：${persona.name}；演示启用的技能：${firstSkill.name}`)
