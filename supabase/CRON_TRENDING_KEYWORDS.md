# 실시간 트렌드 키워드 수집 — 스케줄 설정 (Cron)

**메인 화면 키워드가 갱신되지 않을 때** 확인할 것:

1. **스케줄러 동작 여부** — 아래 방법 2(cron-job.org 등)에서 `fetch-trending-keywords` URL을 **30분마다** 호출하고 있는지 확인.
2. **수동 실행** — 아래 "로컬/수동 테스트"로 한 번 호출 후, Supabase Dashboard → Table Editor → `trending_keywords` 에 새 행이 들어오는지 확인.
3. **Edge Function 로그** — Dashboard → Edge Functions → `fetch-trending-keywords` → Logs 에서 Google Trends 실패(4xx/5xx) 또는 Insert 실패 로그 확인.

주 사용 함수: **`fetch-trending-keywords`** (Google Trends RSS + YouTube 인기 영상 → `trending_keywords` 테이블).  
예전 단일 함수 `fetch-google-trends` 를 1시간마다 쓰는 경우 아래 방법 1 참고.

---

## 방법 1: Supabase Dashboard (pg_cron)

1. **Supabase Dashboard** → 프로젝트 선택 → **Database** → **Extensions**
2. **pg_cron** 확장을 활성화합니다.
3. **SQL Editor**에서 다음을 실행합니다.

```sql
-- 1시간마다 Edge Function 호출 (서비스 역할 키 필요)
-- 실제 호출은 외부 Cron(예: cron-job.org) 또는 Supabase Scheduled Functions 사용 권장 (아래 방법 2)
select cron.schedule(
  'fetch-google-trends-hourly',
  '0 * * * *',  -- 매시 정각
  $$ select net.http_post(
       (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL') || '/functions/v1/fetch-google-trends',
       '{}',
       '{"Content-Type": "application/json", "Authorization": "Bearer " || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')}'
     ) as request_id
  $$
);
```

- `pg_net` 확장과 Vault에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 저장되어 있어야 합니다.  
- Supabase 프로젝트에 **pg_net**이 없으면 **방법 2**를 사용하는 것이 더 단순합니다.

---

## 방법 2: 외부 Cron 서비스 (권장)

Supabase Edge Function은 **HTTP 요청**으로 호출할 수 있으므로, 외부 스케줄러에서 1시간마다 호출하면 됩니다.

### 1) Edge Function URL

- URL: `https://<PROJECT_REF>.supabase.co/functions/v1/fetch-google-trends`
- Method: `POST`
- Header: `Authorization: Bearer <SUPABASE_ANON_KEY>` 또는 **서비스 역할 키** (서비스 역할 키는 노출되지 않도록 서버/환경변수에서만 사용)

### 2) Cron 예시 (cron-job.org / GitHub Actions 등)

- **cron-job.org**: 1시간마다(예: `0 * * * *`) 위 URL로 POST 요청, Authorization 헤더에 `Bearer <키>` 설정.
- **GitHub Actions**: `schedule: - cron: '0 * * * *'` 로 워크플로 실행 후 `curl -X POST ...` 로 위 URL 호출.

### 3) 로컬 테스트

```bash
# 로그인 후
supabase functions invoke fetch-google-trends --no-verify-jwt
```

---

## 방법 3: Supabase Scheduled Functions (Beta)

Supabase에서 **Scheduled Functions**가 지원되는 경우:

1. Dashboard → **Edge Functions** → `fetch-google-trends` 선택
2. **Schedule** 탭에서 **Cron** 추가: `0 * * * *` (1시간마다)

문서: https://supabase.com/docs/guides/functions/schedule-functions

---

## 요약

| 방법              | 난이도 | 비고                          |
|-------------------|--------|-------------------------------|
| pg_cron + pg_net  | 높음   | DB 확장·Vault 설정 필요       |
| 외부 Cron (권장)  | 낮음   | 1시간마다 HTTP POST로 호출   |
| Scheduled Functions | 낮음 | Supabase 지원 시 Dashboard에서 설정 |

**실제 적용 시**: 외부 Cron(cron-job.org 등)에서 `https://<PROJECT_REF>.supabase.co/functions/v1/fetch-google-trends` 를 1시간마다 POST로 호출하고, Authorization에 `Bearer <ANON_KEY 또는 SERVICE_ROLE_KEY>` 를 넣으면 됩니다.

---

## 통합 수집: fetch-trending-keywords (Google + YouTube, 30분마다)

Google Trends RSS와 YouTube 인기 영상 제목을 한 번에 수집하는 Edge Function입니다.

- **URL**: `https://<PROJECT_REF>.supabase.co/functions/v1/fetch-trending-keywords`
- **Method**: `POST`
- **Header**: `Authorization: Bearer <ANON_KEY 또는 SERVICE_ROLE_KEY>`
- **Secrets**: Edge Function에 `YOUTUBE_API_KEY` (YouTube Data API v3) 설정 시 YouTube 인기 영상 제목도 수집됩니다.

### 30분마다 실행

- **cron-job.org**: `*/30 * * * *` (30분 간격)으로 위 URL POST 호출.
- **로컬/수동 테스트**:
  ```bash
  # CLI (배포된 프로젝트 대상)
  supabase functions invoke fetch-trending-keywords --no-verify-jwt
  ```
  ```powershell
  # PowerShell curl (배포된 URL에 직접 호출 — SERVICE_ROLE_KEY 또는 ANON_KEY 사용)
  $url = "https://nkicvcmctysrewwherak.supabase.co/functions/v1/fetch-trending-keywords"
  $key = "YOUR_SUPABASE_ANON_OR_SERVICE_ROLE_KEY"
  Invoke-RestMethod -Uri $url -Method Post -Headers @{ Authorization = "Bearer $key" } -ContentType "application/json"
  ```
  성공 시 응답 예: `{"ok":true,"count":50,"google":50,"youtube":0}`.  
  DB 확인: Supabase Dashboard → Table Editor → `trending_keywords` → 최신 `created_at` 갱신 여부.
