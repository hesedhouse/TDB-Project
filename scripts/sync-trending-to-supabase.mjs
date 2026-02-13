/**
 * 실시간 트렌드 키워드 수집 → Supabase trending_keywords 1시간마다 업데이트용.
 * 1) Python(pytrends)으로 한국 구글 트렌드 10개 수집
 * 2) 또는 TRENDS_JSON_PATH / TRENDS_API_URL / fallback 사용
 * 3) Supabase에 insert (source='google_trends')
 *
 * 사용: node scripts/sync-trending-to-supabase.mjs
 * Cron 예시 (1시간마다): 0 * * * * cd /path/to/app && node scripts/sync-trending-to-supabase.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

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

const SOURCE = 'google_trends'
const FALLBACK = [
  '애교챌린지', '삼각김밥 꿀조합', '2026 월드컵', '올겨울 히트곡',
  '재택카페', '요즘 대세 드라마', '맛있는 라면 레시피', '겨울 스포츠',
  '새해 다짐', '인생 사진',
]

/** Python 스크립트 실행해서 JSON 배열 한 줄 읽기 */
function fetchFromPython() {
  return new Promise((resolve) => {
    const py = spawn('python3', [join(__dirname, 'fetch_trends.py')], { cwd: root })
    let out = ''
    let err = ''
    py.stdout.setEncoding('utf8')
    py.stderr.setEncoding('utf8')
    py.stdout.on('data', (d) => { out += d })
    py.stderr.on('data', (d) => { err += d })
    py.on('close', (code) => {
      if (code !== 0) {
        try { resolve(JSON.parse(out)) } catch { resolve(null) }
        return
      }
      try {
        const line = out.trim().split('\n').pop()
        resolve(line ? JSON.parse(line) : null)
      } catch {
        resolve(null)
      }
    })
  })
}

/** TRENDS_JSON_PATH 파일에서 키워드 배열 읽기 */
function fetchFromFile(path) {
  try {
    const raw = readFileSync(path, 'utf8')
    const data = JSON.parse(raw)
    const list = Array.isArray(data) ? data : (data.keywords || data.words || [])
    return list.slice(0, 10).map((w) => String(w).trim()).filter(Boolean)
  } catch {
    return null
  }
}

/** TRENDS_API_URL에서 GET 후 키워드 배열 파싱 */
async function fetchFromUrl(apiUrl) {
  try {
    const res = await fetch(apiUrl)
    const data = await res.json()
    const list = Array.isArray(data) ? data : (data.keywords || data.words || [])
    return list.slice(0, 10).map((w) => String(w).trim()).filter(Boolean)
  } catch {
    return null
  }
}

async function getKeywords() {
  const jsonPath = process.env.TRENDS_JSON_PATH
  const apiUrl = process.env.TRENDS_API_URL

  if (jsonPath && existsSync(jsonPath)) {
    const list = fetchFromFile(jsonPath)
    if (list?.length) return list
  }
  if (apiUrl) {
    const list = await fetchFromUrl(apiUrl)
    if (list?.length) return list
  }

  const fromPy = await fetchFromPython()
  if (fromPy?.length) return fromPy.slice(0, 10)

  return FALLBACK
}

async function main() {
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
    process.exit(1)
  }

  const keywords = await getKeywords()
  if (!keywords.length) {
    console.error('No keywords to sync')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const rows = keywords.map((word) => ({ word, source: SOURCE }))

  const { data, error } = await supabase.from('trending_keywords').insert(rows).select('id')
  if (error) {
    console.error('Insert failed:', error.message)
    process.exit(1)
  }

  console.log(`Synced ${data?.length ?? 0} trending keywords (source=${SOURCE})`)
}

main()
