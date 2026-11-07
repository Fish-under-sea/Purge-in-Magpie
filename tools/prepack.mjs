// prepack：打包前把本机产物还原成空壳。
//
// page/catalog.js 里带着这台机器的目录与条目名，state/ 里是完整正文——
// 两样都不该跟着 npm 包发出去。装好之后第一次打开插件页会重新生成。
// catalog.js 不删而是写回空壳：页面用 <script> 加载它，文件缺失会变成一条
// 404 噪音，空壳能让页面直接画「还没有快照」。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')

rmSync(join(here, 'state'), { recursive: true, force: true })
console.log('cleaned state/')

const stub = {
  version: 0,
  generatedAt: 0,
  sources: [],
  entries: [],
  rejected: [],
  imports: [],
  options: {},
  last: null,
}
mkdirSync(join(here, 'page'), { recursive: true })
writeFileSync(join(here, 'page', 'catalog.js'), `window.PURGE_CATALOG = ${JSON.stringify(stub, null, 2)};\n`, 'utf8')
console.log('reset page/catalog.js')

// 给页面资源打上版本号：仓库里留着 ?v=0 占位，打包时换成真实版本。
// 不打的话，用户更新插件后浏览器可能一直拿缓存的旧 app.js / style.css，
// 表现就是「怎么更新界面都没变」。postpack 会把占位还原，免得工作区一直脏。
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
const indexFile = join(here, 'page', 'index.html')
const html = readFileSync(indexFile, 'utf8')
const stamped = html.replace(/(\?v=)0\b/g, `$1${pkg.version}`)
if (stamped !== html) {
  writeFileSync(indexFile, stamped, 'utf8')
  console.log(`stamped page/index.html assets with v=${pkg.version}`)
} else {
  console.log('page/index.html 没有 ?v=0 占位，跳过打版本号')
}