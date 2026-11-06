// ownOptions：从 magpie 自己的 plugins.json 读回本插件的 options。
// 没有它，插件页在没有任何流量时只能显示空表（钩子没被调用过）。
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { ownOptions } from '../lib/state.mjs'

const dirs = []
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'purge-own-'))
  dirs.push(dir)
  return dir
}
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

test('按 spec 精确匹配取回 options', () => {
  const home = workspace()
  const cfg = join(home, 'config', 'magpie')
  mkdirSync(cfg, { recursive: true })
  const here = join(home, 'plugin')
  writeFileSync(join(cfg, 'plugins.json'), JSON.stringify({
    plugins: [
      { spec: join(home, 'other'), options: { mode: 'off' } },
      { spec: here, options: { mode: 'append', persona: 'anima', sources: ['D:/purge'] } },
    ],
  }))
  const got = ownOptions(here, { XDG_CONFIG_HOME: join(home, 'config') })
  assert.equal(got.mode, 'append')
  assert.equal(got.persona, 'anima')
  assert.deepEqual(got.sources, ['D:/purge'])
})

test('没登记过就返回 null，让调用方退回默认来源', () => {
  const home = workspace()
  const cfg = join(home, 'config', 'magpie')
  mkdirSync(cfg, { recursive: true })
  writeFileSync(join(cfg, 'plugins.json'), JSON.stringify({ plugins: [{ spec: join(home, 'other') }] }))
  assert.equal(ownOptions(join(home, 'plugin'), { XDG_CONFIG_HOME: join(home, 'config') }), null)
})

test('plugins.json 不存在或坏掉都不抛异常', () => {
  const home = workspace()
  assert.equal(ownOptions(join(home, 'plugin'), { XDG_CONFIG_HOME: join(home, 'config') }), null)
  const cfg = join(home, 'config', 'magpie')
  mkdirSync(cfg, { recursive: true })
  writeFileSync(join(cfg, 'plugins.json'), '{ broken')
  assert.equal(ownOptions(join(home, 'plugin'), { XDG_CONFIG_HOME: join(home, 'config') }), null)
})