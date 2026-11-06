// 测试用的最小 ZIP 写入器：只写 store（不压缩）条目，够造夹具。
// 生产代码只读 ZIP，这里是唯一「写」的地方，且只存在于测试里。
import { crc32 } from 'node:zlib'

export function makeZip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8) // store
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    locals.push(local, data)

    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10) // store
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)
    centrals.push(central)
    offset += local.length + data.length
  }
  const cen = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(Object.keys(files).length, 8)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(cen.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, cen, eocd])
}