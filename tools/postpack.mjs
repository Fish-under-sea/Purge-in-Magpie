// postpack：把 prepack 打进 page/index.html 的版本号还原成占位。
//
// 包已经生成好了（里面有 v=真实版本），工作区回到 ?v=0——否则每发一次版，
// index.html 都留着一处与 package.json 联动的改动，提交时容易顺手带进去。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const indexFile = join(here, 'page', 'index.html')

try {
  const html = readFileSync(indexFile, 'utf8')
  // 只还原 ?v=数字 这一种，别碰别的查询参数
  const back = html.replace(/(\?v=)\d+(\.\d+)*/g, '$10')
  if (back !== html) {
    writeFileSync(indexFile, back, 'utf8')
    console.log('restored page/index.html asset versions to ?v=0')
  }
} catch (error) {
  console.log(`postpack: 还原 index.html 失败（不影响已生成的包）：${error?.message || error}`)
}
