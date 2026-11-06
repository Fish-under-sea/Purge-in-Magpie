// 扫描结果的落盘与刷新：把「本地 purge 目录」变成两份产物。
//
//   state/catalog.json  ← 完整条目表（含正文），只给 hooks.js 读
//   page/catalog.js     ← 页面快照（window.PURGE_CATALOG，不含正文），页面用 <script> 读
//
// 页面在沙箱帧里，不能 fetch、不能读盘；所以「后端 → 页面」的唯一通道就是 page/ 下这份脚本。
// 页面侧的「导入」也走同一条思路：把要导入的路径写进 options.imports，宿主重启插件后
// 这里（Bun 侧）把文件复制进 state/imports，再重新扫描，页面下次刷新就看到结果。
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  LIMITS,
  defaultSources,
  mergeEntries,
  scan,
  snapshotOf,
} from './inventory.mjs'

const IMPORT_EXT = new Set(['.zip', '.md', '.markdown', '.txt', '.json'])

export function paths(here) {
  return {
    here,
    stateDir: join(here, 'state'),
    importsDir: join(here, 'state', 'imports'),
    catalogFile: join(here, 'state', 'catalog.json'),
    lastFile: join(here, 'state', 'last.json'),
    snapshotFile: join(here, 'page', 'catalog.js'),
  }
}

const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

const sha = (text) => createHash('sha256').update(String(text)).digest('hex').slice(0, 16)

/** sourceSignature 是「这次要不要重扫」的判断依据：目录 mtime + 导入请求 + 强制刷新戳。 */
function sourceSignature(sources, imports = [], refreshAt = 0) {
  const stamps = []
  for (const dir of sources) {
    try {
      const st = statSync(dir)
      stamps.push(`${dir}:${st.mtimeMs}`)
    } catch {
      stamps.push(`${dir}:missing`)
    }
  }
  return sha([...stamps, imports.map((i) => `${i.path}@${i.at}`).join(','), refreshAt].join('|'))
}

/**
 * loadCatalog 读上一次的完整条目表；没有就当成空的。
 */
export function loadCatalog(p) {
  return readJson(p.catalogFile, { version: 0, generatedAt: 0, entries: [], sources: [], rejected: [], imports: [] })
}

/** lastApplied 是 hooks 记下的最近一次改写记录；页面用它回答「上一次生效是什么时候」。 */
export function loadLast(p) {
  return readJson(p.lastFile, null)
}

/**
 * sync 重新清点来源目录，必要时处理导入请求，然后写两份产物。
 * @returns {{ catalog: object, changed: boolean, snapshot: object }}
 */
export function sync(here, options = {}, { force = false, limits = LIMITS, now = Date.now() } = {}) {
  const p = paths(here)
  mkdirSync(p.stateDir, { recursive: true })
  mkdirSync(p.importsDir, { recursive: true })

  const configured = Array.isArray(options.sources) ? options.sources.filter((s) => typeof s === 'string' && s.trim()) : []
  const sources = configured.length ? configured : defaultSources()
  const imports = Array.isArray(options.imports) ? options.imports.filter((i) => i && typeof i.path === 'string') : []
  const previous = loadCatalog(p)
  const signature = sourceSignature(sources.map((s) => s), imports, options.refreshAt ?? 0)

  if (!force && previous.signature === signature) {
    return { catalog: previous, changed: false, snapshot: snapshotFrom(p, previous, options, now) }
  }

  const importRows = applyImports(p, imports, previous, now)
  // 导入的副本本身就是一个来源目录：放在最前面，页面能看到「来源：导入」。
  const scanned = scan([p.importsDir, ...sources], { limits, now })
  const { entries, duplicates } = mergeEntries(scanned.entries, previous.entries)
  const rejected = [...scanned.rejected, ...duplicates.map((d) => ({ name: d.name, path: d.source.rel, reason: d.reason, at: d.importedAt, root: d.source.root }))]

  const catalog = {
    version: (previous.version || 0) + 1,
    generatedAt: now,
    signature,
    sources: scanned.sources,
    entries,
    rejected,
    imports: importRows,
  }
  writeFileSync(p.catalogFile, JSON.stringify(catalog, null, 2), 'utf8')
  const snapshot = snapshotFrom(p, catalog, options, now)
  writeSnapshot(p, snapshot)
  return { catalog, changed: true, snapshot }
}

/** snapshotFrom 合成页面快照：条目元数据 + 生效记录 + 当前设置。 */
export function snapshotFrom(p, catalog, options, now = Date.now()) {
  const snap = snapshotOf(catalog.entries, catalog.sources, catalog.rejected, {
    version: catalog.version,
    now: catalog.generatedAt || now,
    options: pickOptions(options),
  })
  snap.imports = catalog.imports || []
  snap.last = loadLast(p)
  return snap
}

function pickOptions(options) {
  const out = {}
  for (const key of ['mode', 'persona', 'agents', 'enabled', 'pinned', 'sources', 'gatewayTimeoutMs']) {
    if (options?.[key] !== undefined) out[key] = options[key]
  }
  return out
}

function writeSnapshot(p, snapshot) {
  const body = `window.PURGE_CATALOG = ${JSON.stringify(snapshot, null, 2)};\n`
  try {
    writeFileSync(p.snapshotFile, body, 'utf8')
  } catch {
    /* 装到只读目录时写不进去：页面会显示「快照缺失」，不要让请求跟着挂 */
  }
}

/**
 * applyImports 处理 options.imports 里的请求：复制进 state/imports 或删除副本。
 * 只认白名单后缀，复制前再判一次大小；失败把原因留在结果里，页面显示，不静默吞掉。
 */
export function applyImports(p, imports, previous, now) {
  const done = new Set((previous.imports || []).map((r) => `${r.path}@${r.at}`))
  const rows = Array.isArray(previous.imports) ? previous.imports.filter((r) => r && r.keep) : []
  for (const req of imports) {
    const key = `${req.path}@${req.at}`
    if (done.has(key)) continue
    const op = req.op === 'delete' ? 'delete' : 'import'
    const row = { path: req.path, at: req.at, op, ok: false, error: '', file: '', keep: false }
    try {
      if (op === 'delete') {
        row.ok = removeImport(p, req.path)
        row.error = row.ok ? '' : '没有找到这条导入的副本'
      } else {
        row.file = importFile(p, req.path)
        row.ok = Boolean(row.file)
        row.error = row.ok ? '' : `只接受 ${[...IMPORT_EXT].join(' / ')} 文件`
        row.keep = row.ok
      }
    } catch (error) {
      row.error = error?.message || String(error)
    }
    rows.push(row)
  }
  return rows
}

function importFile(p, rawPath) {
  const src = String(rawPath).trim()
  if (!src) throw new Error('空路径')
  const ext = extname(src).toLowerCase()
  if (!IMPORT_EXT.has(ext)) return ''
  const st = statSync(src)
  if (!st.isFile()) throw new Error('不是文件')
  if (st.size > LIMITS.fileBytes) throw new Error(`文件超过 ${LIMITS.fileBytes / 1024} KiB 上限`)
  const digest = sha(`${st.size}:${st.mtimeMs}:${src}`)
  const target = join(p.importsDir, `${digest}${ext}`)
  if (!existsSync(target)) copyFileSync(src, target)
  return target
}

function removeImport(p, rawPath) {
  const base = basename(String(rawPath).trim())
  const target = join(p.importsDir, base)
  if (!existsSync(target)) return false
  if (!readdirSync(p.importsDir).includes(base)) return false
  rmSync(target, { force: true })
  return true
}