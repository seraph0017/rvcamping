import { readFileSync } from 'node:fs'
import { importCsv, seedIfEmpty, listFamilies, db } from '../server/db.ts'

const file = process.argv[2]
if (!file) {
  console.error('用法: npm run import -- data/families.csv')
  process.exit(1)
}
seedIfEmpty()
const res = importCsv(readFileSync(file, 'utf8'))
const all = listFamilies(true)
console.log(`✓ 导入完成：新增 ${res.inserted}，更新 ${res.updated}，当前共 ${all.length} 家`)
for (const f of all.slice(0, 5)) console.log(`  ${f.code}  ${f.display_name}  ${f.campsite ?? '-'}  ${f.token.slice(0, 8)}…`)
if (all.length > 5) console.log(`  … 其余 ${all.length - 5} 家`)
db.close()
