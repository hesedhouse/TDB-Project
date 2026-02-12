/**
 * trending_keywords 테이블에 가짜 트렌드 데이터 삽입 (테스트용)
 * 사용: node scripts/seed-trending-keywords.mjs
 * .env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 필요
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnvLocal() {
  const path = join(root, '.env.local')
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf8')
  content.split('\n').forEach((line) => {
    const i = line.indexOf('=')
    if (i <= 0) return
    const key = line.slice(0, i).trim()
    const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (key) process.env[key] = val
  })
}

loadEnvLocal()

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key)

const MOCK_ROWS = [
  { word: '애교챌린지', source: 'mockup' },
  { word: '삼각김밥 꿀조합', source: 'mockup' },
  { word: '2026 월드컵', source: 'mockup' },
  { word: '올겨울 히트곡', source: 'mockup' },
  { word: '재택카페', source: 'mockup' },
  { word: '요즘 대세 드라마', source: 'mockup' },
  { word: '맛있는 라면 레시피', source: 'mockup' },
  { word: '겨울 스포츠', source: 'mockup' },
  { word: '새해 다짐', source: 'mockup' },
  { word: '인생 사진', source: 'mockup' },
]

async function main() {
  const { data, error } = await supabase.from('trending_keywords').insert(MOCK_ROWS).select('id')
  if (error) {
    console.error('Insert failed:', error.message)
    process.exit(1)
  }
  console.log('Inserted', data?.length ?? 0, 'rows into trending_keywords')
}

main()
