/**
 * fetch-trending-keywords Edge Function 수동 호출 후 trending_keywords 테이블 확인
 * 사용: node scripts/invoke-fetch-trending-keywords.mjs
 * .env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 필요
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

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

const functionUrl = `${url.replace(/\/$/, '')}/functions/v1/fetch-trending-keywords`

async function main() {
  console.log('1) Edge Function 호출:', functionUrl)
  let res
  try {
    res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  } catch (e) {
    console.error('호출 실패:', e.message)
    process.exit(1)
  }

  const body = await res.text()
  let json
  try {
    json = JSON.parse(body)
  } catch {
    json = { raw: body }
  }

  if (!res.ok) {
    console.log('응답 상태:', res.status, res.statusText)
    console.log('응답 본문:', json?.error ?? json?.message ?? body)
    if (res.status === 404) {
      console.log('\n→ 이 프로젝트에 fetch-trending-keywords 함수가 배포되어 있지 않습니다.')
      console.log('  Supabase Dashboard에서 배포하거나: supabase functions deploy fetch-trending-keywords')
    }
  } else {
    console.log('응답:', json)
    if (json.ok && json.count != null) {
      console.log(`\n→ ${json.count}개 키워드 반영됨 (google: ${json.google ?? '-'}, youtube: ${json.youtube ?? '-'})`)
    }
  }

  console.log('\n2) trending_keywords 테이블 최신 데이터 (최대 10건)')
  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from('trending_keywords')
    .select('id, platform, keyword, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('테이블 조회 실패:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.log('  (데이터 없음)')
    return
  }

  const latestAt = data[0]?.created_at
  console.log('  최신 created_at:', latestAt)
  data.forEach((row, i) => {
    console.log(`  ${i + 1}. [${row.platform ?? '-'}] ${(row.keyword || '').slice(0, 50)} | ${row.created_at}`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
