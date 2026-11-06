#!/usr/bin/env node
// 离线清点：不装进 magpie、不开 magpie，也能列出条目表并写出快照。
//
//   node tools/scan.mjs                              # 只清点包内内容 + 已导入的文件
//   node tools/scan.mjs --import "D:\a.md" --mode strict --persona anima
//   node tools/scan.mjs --json                       # 只把快照打到 stdout，不写文件
//
// 预览（preview/serve.mjs）用的就是它：同一条扫描路径，避免「预览一套、真跑另一套」。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KINDS } from '../lib/inventory.mjs'
import { sync } from '../lib/state.mjs'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const out = { imports: [], mode: '', persona: '', json: false, force: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') out.json = true
    else if (a === '--import') {
      // 每个 --import 一个文件；用合成时间戳让它们都算「待处理的导入请求」。
      const path = String(argv[++i] || '').trim()
      if (path) out.imports.push({ op: 'import', path, at: out.imports.length + 1 })
    } else if (a === '--mode') out.mode = String(argv[++i] || '').trim()
    else if (a === '--persona') out.persona = String(argv[++i] || '').trim()
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const options = {
  mode: args.mode || 'off',
  persona: args.persona,
  imports: args.imports,
  refreshAt: Date.now(),
}
const { catalog, snapshot } = sync(here, options, { force: args.force })

if (args.json) {
  process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n')
  process.exit(0)
}

const lines = []
lines.push(`# Purge in Magpie · 清点 ${new Date(catalog.generatedAt).toLocaleString('zh-CN')}`)
lines.push('')
lines.push('## 来源')
for (const s of snapshot.sources) lines.push(`- ${s.path}${s.ok ? `：${s.count} 条` : `：${s.error}`}`)
lines.push('')
lines.push('## 条目（' + snapshot.entries.length + '）')
for (const e of snapshot.entries) {
  const size = e.size >= 1048576 ? `${(e.size / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(e.size / 1024))} KiB`
  lines.push(`- [${e.kind}] ${e.name} · ${size} · v${e.version} · ${e.source.rel}`)
}
if (snapshot.rejected.length) {
  lines.push('')
  lines.push('## 拒绝（' + snapshot.rejected.length + '）')
  for (const r of snapshot.rejected) lines.push(`- ${r.name}：${r.reason}`)
}
lines.push('')
lines.push(`快照：${join(here, 'page', 'catalog.js')}`)
lines.push(`条目表：${join(here, 'state', 'catalog.json')}`)
console.log(lines.join('\n'))

const kinds = new Map()
for (const e of snapshot.entries) kinds.set(e.kind, (kinds.get(e.kind) || 0) + 1)
console.log('\n类型分布：' + [...kinds].map(([k, n]) => `${KINDS[k] || k} ${n}`).join(' · '))