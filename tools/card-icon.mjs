// card-icon：把 page/card.png 写进 package.json 的 magpie.icon（data URI）。
//
// 为什么必须内联：magpie 只认 `https://` 或 `data:image/` 开头的值
// （internal/provider 的 iconOf 会直接丢弃相对路径），所以 `page/card.png`
// 这种写法在卡片上根本不生效。内联之后 magpie 会把它收进 plugin-icons.json，
// 卡片就显示这张图——而侧栏用的仍是 magpie.page.icon，两者互不影响。
//
//   node tools/card-icon.mjs          # 从 page/card.png 生成并写回 package.json
//   node tools/card-icon.mjs --check  # 只校验 package.json 里的那份是否与文件一致
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(here, 'package.json')
const cardPath = join(here, 'page', 'card.png')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const b64 = readFileSync(cardPath).toString('base64')
const uri = `data:image/png;base64,${b64}`

if (process.argv.includes('--check')) {
  const ok = pkg.magpie?.icon === uri
  console.log(ok ? 'magpie.icon 与 page/card.png 一致' : 'magpie.icon 与 page/card.png 不一致，跑一次 tools/card-icon.mjs')
  process.exit(ok ? 0 : 1)
}

// magpie 的上限是 1 MB（3 << 19 字节的字符串），超了会被丢弃；这里提前拦。
if (uri.length > 3 << 19) {
  console.error(`卡片图太大：${(uri.length / 1024).toFixed(0)} KiB 的 data URI，magpie 只收到 1.5 MB 字符以内`)
  process.exit(1)
}

pkg.magpie.icon = uri
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
console.log(`page/card.png → magpie.icon  ${(uri.length / 1024).toFixed(1)} KiB 的 data URI`)