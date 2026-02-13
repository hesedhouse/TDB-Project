# 실시간 트렌드 키워드 수집

## 1. 수집 스크립트

- **Python** `fetch_trends.py`: 구글 트렌드 한국 인기 검색어 10개 수집 (pytrends).
- **Node** `sync-trending-to-supabase.mjs`: 수집 결과를 Supabase `trending_keywords` 테이블에 저장.

### Python 환경 (pytrends)

```bash
pip install pytrends
python scripts/fetch_trends.py   # stdout에 JSON 배열 출력
```

### Supabase 동기화 (1회 실행)

```bash
node scripts/sync-trending-to-supabase.mjs
# 또는
npm run trending:sync
```

동기화 스크립트는 다음 순서로 키워드를 가져옵니다.

1. `TRENDS_JSON_PATH` 파일 경로가 있으면 해당 JSON 배열 사용
2. `TRENDS_API_URL`이 있으면 해당 URL GET 후 JSON 배열 파싱
3. 없으면 `python3 scripts/fetch_trends.py` 실행 결과 사용
4. 모두 실패 시 내장 fallback 10개 사용

## 2. 1시간마다 자동 업데이트 (Cron)

시스템 crontab 예시 (매시 정각):

```cron
0 * * * * cd /path/to/c/app && node scripts/sync-trending-to-supabase.mjs >> /tmp/trending-sync.log 2>&1
```

Windows 작업 스케줄러: 1시간마다 `node scripts/sync-trending-to-supabase.mjs` 실행하도록 등록.

Vercel 등 호스팅에서는 외부 Cron 서비스(예: cron-job.org)로 위 URL을 1시간마다 호출하거나, Supabase Edge Function + pg_cron으로 구현할 수 있습니다.

## 3. UI 비율

메인 플로팅 태그는 `boards` 방 제목 **70%** + `trending_keywords` **30%** 비율로 섞여 표시됩니다.
