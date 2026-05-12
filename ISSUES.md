### P0 — `memories.is_deleted` schema drift makes ALL stored memories invisible to GET (prod-wide)
**상태:** 데이터 백필 완료 (2026-05-11). 코드 패치 + 스키마 마이그레이션은 `docs/handoff/2026-05-11-prod-p0-memories-and-webhook-rootcause.md` §1.1-1.3로 codex 핸드오프.
**날짜:** 2026-05-11
**증상:** `POST /api/v1/memories`는 200 success + memory ID 반환하지만, 같은 ID로 `GET /api/v1/memories/{id}` 호출 시 404 "Memory not found". `GET /api/v1/memories` (browse), `?tags=...` 필터, `?include_history=true`, 비-v1 `/api/memories` 모두 0건 반환. `profile.memory_count`는 정상 증가. 100% 재현. 영향: ALL API customers — 저장된 메모리를 API로 다시 읽지 못함. 검증 deployment: `dpl_8ndoY6ZMxmwfGXyNzeMH6uXqwW5t` (2026-05-10 어제 codex 배포 빌드).

**원인:** 마이그레이션 025 (`025_summer_versioning.sql`)는 `ALTER TABLE memories ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE`로 선언되었지만, prod DB 실제 컬럼 메타데이터는:
- `is_nullable: YES`
- `column_default: null`

`information_schema.columns` 직접 조회로 확인. 마이그레이션이 적용되지 않았거나, 이전에 다른 정의로 추가된 후 025의 `IF NOT EXISTS` 가드가 정의 변경을 막은 것으로 추정.

POST insertPayload에는 `is_deleted` 키가 없음 (DB default 의존). 따라서 새 행은 `is_deleted = NULL`로 저장됨. GET 핸들러 3곳 모두 `.eq('is_deleted', false)` 필터 사용 → PostgreSQL 3-valued logic으로 NULL 행 제외 → 404/0.

**증거 (DB 직접 조회 2026-05-11):**
- 2개 테스트 행 모두 존재, `user_id='34821db7-71e6-401f-a376-e9f1e215cd7c'`, `canon_status='canon'`, `is_deleted=NULL`, `deleted_at=NULL`
- 컬럼 메타: `is_deleted boolean YES null` ← 마이그레이션 025 의도와 불일치
- `user_id` 컬럼은 `text` (uuid 아님 — 2026-02-21 FK 타입 mismatch 이슈와 동일 패턴)

**해결:**
- ✅ **데이터 백필 (2026-05-11 03:14 UTC)**: `UPDATE memories SET is_deleted = false WHERE is_deleted IS NULL` 실행, 20행 영향. 백필 후 GET /api/v1/memories/{id} 및 browse 정상 동작 확인.
- ⏳ **코드 패치 (pending — codex)**: `src/app/api/v1/memories/route.ts` insertPayload에 `is_deleted: false`, `deleted_at: null` 명시. 다른 insert path 동시 패치.
- ⏳ **스키마 마이그레이션 (pending — codex)**: `ALTER COLUMN is_deleted SET NOT NULL, SET DEFAULT FALSE`. 핸드오프 doc에 마이그레이션 sql 포함.
- ⏳ **E2E 회귀 테스트 (pending — codex)**: POST→GET-by-id round-trip. 이 버그는 e2e 부재로 prod 진입.

**참조:** `src/app/api/v1/memories/route.ts:903-950, 1392-1396` (browse `is_deleted=false` 필터), `src/app/api/v1/memories/[id]/route.ts:85-93` (GET-by-id 필터), `supabase/migrations/025_summer_versioning.sql:11`.

---

### P0 — Stripe webhook URL apex→www 308 redirect으로 모든 결제 webhook이 prod에서 stuck
**상태:** URL hotfix 적용 완료 (2026-05-11). Stripe가 pending 이벤트 자동 재시도 중. 회귀 방지 가드는 codex 핸드오프 §2.2-2.3.
**날짜:** 2026-05-11
**증상:** Stripe Dashboard 등록 URL은 `https://seizn.com/api/webhooks/stripe`. 실제 핸들러는 `https://www.seizn.com/api/webhooks/stripe`. apex → www가 308 redirect되는데 Stripe는 webhook 전송 시 redirect 미추적 → 모든 결제 이벤트가 `pending: 1` 상태로 영구 stuck. 영향: 결제는 Stripe에 정상 기록되지만 DB sync 코드(api_keys 업데이트 등)가 전혀 안 돔. 어제 codex의 "Fix dashboard API key issuance" 패치는 API 키 생성 시 Stripe를 직접 조회해서 이 문제를 우회 — 하지만 webhook 자체 문제는 그대로.

**증거:** test customer `cus_UUbogaNptWlOF5` 의 핵심 5개 이벤트 (`checkout.session.completed`, `customer.subscription.created`, `invoice.paid`, `customer.created`, `customer.updated`) 모두 `pending_webhooks: 1`. apex URL 직접 POST → `HTTP 308 → Location: https://www.seizn.com/...`로 확인.

**원인:** Webhook endpoint 등록 시점에 apex/www 분리를 인지 못 한 채 apex URL을 등록. Vercel 도메인 설정에 apex → www 308 redirect 룰이 들어 있어서 처음부터 작동 불가였음.

**해결:**
- ✅ **URL 변경 (2026-05-11 03:13 UTC)**: `PATCH /v1/webhook_endpoints/we_1TJdnB8XSoMws9Ufpu272MHY` `url=https://www.seizn.com/api/webhooks/stripe`. 즉시 enabled 상태로 적용. Stripe 자동 재시도가 pending 이벤트를 처리할 것 (수시간~3일 retry window).
- ⏳ **회귀 방지 가드 (pending — codex)**:
  - production smoke test에 webhook URL 308 체크 추가
  - Stripe webhook URL drift detector (cron 또는 CI assertion)

**참조:** `docs/handoff/2026-05-11-prod-p0-memories-and-webhook-rootcause.md` §2.

---

### P0 — Stripe checkout 완료 후 `profile.plan` 미동기화 (UI 표시는 어제 fix, DB sync는 여전히 깨짐)
**상태:** 본인 계정 hotfix 적용 (2026-05-11). 다른 결제자 동일 문제 — webhook 핸들러 코드 패치 필요 (codex 핸드오프 §3).
**날짜:** 2026-05-11
**증상:** 사용자(`iruhana25@gmail.com`, `user_id=34821db7-71e6-401f-a376-e9f1e215cd7c`)가 Track 2 Pro BYOK Charter Monthly ($23/월) 결제 완료. Stripe subscription `sub_1TVdva8XSoMws9UfForYHtyY` 상태 `active`, payment_intent `succeeded`, invoice `paid`. 그러나 `/api/me`와 `profiles` 테이블 모두 `plan: "free"`. API rate limit과 entitlement이 Free로 적용됨.

**어제 codex fix와의 관계:** 2026-05-10 codex 작업("Track 2 API Pro 결제 후에도 Free / inactive로 보이던 표시 문제를 수정했습니다")은 dashboard UI 표시 레이어를 fix함. 즉 화면엔 "Pro active"로 보이게 됨. 하지만 백엔드 `profiles.plan` row 자체는 'free'로 남아있어 API 엔트리먼트(`/api/me`, rate limit, feature gating)는 여전히 Free 동작. UI fix와 sync fix는 별개 문제.

**Stripe 데이터:**
- Customer `cus_UUbogaNptWlOF5` created 2026-05-10 19:00 UTC, metadata.user_id 정확히 매핑
- Checkout session `cs_live_b1G0DK2k...` status=complete, payment_status=paid, mode=subscription, paid 2026-05-10 20:26 UTC
- Subscription metadata: `track2_tier=pro`, `billing_cadence=monthly`, `billing_channel=track2`, `price_lock_version=v9`
- Subscription `current_period_start`/`current_period_end`는 null (status active임에도 — 별도 확인 필요)
- (참고) 결제 전에 3번 abandoned checkout: $11 indie/$11 indie/$29 indie

**원인 (추정):** `checkout.session.completed` 또는 `customer.subscription.created` 웹훅 핸들러가 `profiles.plan='pro'`를 INSERT/UPDATE하지 못했거나, 웹훅이 도달 안 했거나, track2 분기에서 매핑 누락. Stripe Dashboard webhook 로그 확인 필요.

**해결:**
- ✅ **본인 계정 hotfix (2026-05-11 03:11 UTC)**: `UPDATE profiles SET plan='pro', updated_at=NOW() WHERE id='34821db7-71e6-401f-a376-e9f1e215cd7c'`. `/api/me`가 plan='pro' Pro limits 반환 확인.
- ✅ **근본 원인 #1 (Stripe URL) 해결됨**: 별도 entry 참고 — webhook 재시도가 일어나면 `customer.subscription.created` 핸들러는 작동하지만 `applyV9Track2TierToApiKeys`만 호출되어 `api_keys` 테이블만 업데이트. 이 함수는 `profile.plan`을 안 건드림 — **이게 #2 별개 버그**.
- ⏳ **근본 원인 #2 (handler 패치) pending — codex**: `src/app/api/webhooks/stripe/route.ts` `customer.subscription.created` 분기에 `profile.plan = v9.tier` 업데이트 추가. `updated`/`deleted` 분기도 미러링. Path A/B 결정 + 패치 코드는 핸드오프 doc §3에 명시.

**참조:** `docs/handoff/2026-05-11-prod-p0-memories-and-webhook-rootcause.md` §3. Stripe customer `cus_UUbogaNptWlOF5`, subscription `sub_1TVdva8XSoMws9UfForYHtyY`.

---

### P1 — SpringV4 bridge 미러링이 prod에서 매 POST마다 실패 (target 테이블 부재)
**날짜:** 2026-05-11
**증상:** `POST /api/v1/memories` 응답에 항상 `bridge.springV4: { mirrored: false, springNoteId: null, skippedReason: "mirror_failed" }`. 서버 로그에 `[v1/memories] Spring v4 mirror error` 매 POST마다 기록되어 Sentry/Vercel logs 오염.

**원인:** `MEMORY_V1_SPRING_BRIDGE_MIRROR` env var가 enabled (default 또는 명시) 이지만 target 테이블 `spring_memory_notes`가 prod DB에 존재하지 않음 (`relation "spring_memory_notes" does not exist` DB 직접 조회 확인). `mirrorLegacyMemoryToSpringV4()`가 throw → catch 블록에서 `mirror_failed` 반환. `MEMORY_V1_SPRING_BRIDGE_MIRROR_REQUIRED=false`로 추정되어 사용자에겐 200 반환되지만 로그 노이즈.

**권장 해결 (택1):**
- A. SpringV4 schema 마이그레이션 (`020_spring_schema.sql`) prod 적용 → 미러링 정상 동작
- B. Vercel env에서 `MEMORY_V1_SPRING_BRIDGE_MIRROR=false` 설정 → SpringV4 도입 전까지 미러 시도 차단 → 깔끔한 로그

**참조:** `src/lib/memory/v1-spring-bridge.ts:110-158`, `src/app/api/v1/memories/route.ts:1189-1232`, `supabase/migrations/020_spring_schema.sql`.

---

### P2 — `/api/v1/memories?mode=hybrid` Vercel timeout (504)
**날짜:** 2026-05-11
**증상:** 인증된 hybrid search 호출이 콜드 스타트에서 504 Gateway Timeout. 빈 메모리 풀에서도 발생.

**원인 (추정):** Voyage AI embedding 생성 + 벡터 + 키워드 + hybrid rerank 체인이 Vercel function timeout (60s) 초과. 빈 상태에선 더 빨라야 정상인데 504 → embedding API 호출 자체가 콜드 스타트에서 느림 + (위 P1과 같이) SpringV4 search 경로 실패 폴백까지 가는 동안 시간 소진 가능성.

**권장 해결:**
1. POST 후 hybrid search 재현 + Vercel function 메트릭(latency, max duration) 확인
2. SpringV4 search 폴백 timeout 추가 (현재 catch만 있고 자체 timeout 없음 — search hang 가능)
3. Voyage AI 호출에 명시적 fetch timeout 적용

**참조:** `src/app/api/v1/memories/route.ts:1887-1920` (Spring v4 bridge search), `searchViaSpringV4Bridge`.

---

### BYOK Encryption KDF Collapse — Re-encryption Pending
**날짜:** 2026-05-09  
**증상:** R27 보안 audit에서 `getEncryptionKey()`가 `BYOK_ENCRYPTION_SECRET || NEXTAUTH_SECRET` + `BYOK_ENCRYPTION_SALT || NEXTAUTH_SECRET`로 fallback. 두 환경변수 모두 미설정 시 scrypt(NEXTAUTH_SECRET, NEXTAUTH_SECRET) — salt 효과 무력화.  
**원인:** R-prior 시점부터 dev ergonomics 위해 fallback 허용했지만 prod 검증 부재.  
**해결 (R28.1):** `src/lib/byok/encryption.ts`에서 prod 시 `BYOK_ENCRYPTION_SECRET`/`BYOK_ENCRYPTION_SALT` 명시 필수 + 두 값이 같으면 throw. dev는 fallback 허용 + console.warn 1회.  
**잔여 작업 (operator action):**  
1. Vercel prod env에 `BYOK_ENCRYPTION_SECRET` (랜덤 32+ bytes base64), `BYOK_ENCRYPTION_SALT` (다른 32+ bytes base64) 설정.  
2. R28 배포 후 prod 시작 실패 시 위 1번 조치.  
3. **기존 암호화된 BYOK 키 row 재암호화**: 현재 prod의 `provider_keys.key_encrypted`는 collapsed KDF로 암호화됨. 새 KEK으로 교체하려면:  
   - 임시로 `BYOK_ENCRYPTION_SECRET=BYOK_ENCRYPTION_SALT=<NEXTAUTH_SECRET 값>` 으로 호환 시작  
   - 백그라운드 작업 또는 마이그레이션 스크립트로 row별 decrypt → 새 KEK으로 re-encrypt → key_version column 갱신  
   - operator가 새 SECRET/SALT 값으로 env 교체  
   - **현재는 사용자 0명, encrypted row 0개 — 재암호화 마이그레이션 우선순위 낮음**. Charter 모집 + 첫 BYOK 등록 시점에 이 잔여 작업 재평가.  
**참조:** `src/lib/byok/encryption.ts:28-77`, R27 audit (이 세션).

### Supabase Autopilot Migration Prerequisite Missing
**날짜:** 2026-02-14  
**증상:** `20260214_autopilot_prbot_schema.sql` 적용 시 `autopilot_analyses` 등 base autopilot 테이블이 없어 실패.  
**원인:** 선행 마이그레이션 `045_combo_b_autopilot.sql`이 DB에 적용되지 않은 상태에서 `ALTER TABLE`이 실행됨.  
**해결:** `045_combo_b_autopilot.sql` 적용 후 `20260214_autopilot_prbot_schema.sql` 적용. 재현/적용용 스크립트: `scripts/run-migration-20260214.mjs`.

### Supabase Pooler TLS 인증서 검증 실패 (One-off Scripts)
**날짜:** 2026-02-14  
**증상:** `pg`로 pooler 접속 시 “self-signed certificate in certificate chain” 류의 SSL 검증 에러.  
**원인:** 로컬 환경/체인 설정에서 pooler 인증서 검증이 엄격 모드에서 실패.  
**해결:** 마이그레이션/인트로스펙션 같은 one-off 스크립트에서만 `ssl.rejectUnauthorized=false` 사용. `NODE_TLS_REJECT_UNAUTHORIZED=0`는 전역 TLS 비활성화라서 사용하지 않음. 런타임 코드에서는 사용 금지.

### autopilot_webhooks 권한 과다 노출 (RLS만으로 불충분)
**날짜:** 2026-02-14  
**증상:** `autopilot_webhooks`가 RLS enabled + policy 0개 상태인데도 `anon/authenticated`에 테이블 권한(SELECT/INSERT/UPDATE/DELETE 등)이 부여됨.  
**원인:** RLS는 “DB grants”를 대체하지 않음. grants가 열려 있으면 정책 설정 실수 시 노출 위험이 커짐.  
**해결:** `supabase/migrations/20260214_autopilot_webhooks_internal_only.sql`로 `anon/authenticated/public` 권한 전부 REVOKE, `service_role`만 GRANT.

### 레포에 DB 크리덴셜 하드코딩 파일 존재
**날짜:** 2026-02-14  
**증상:** `scripts/apply-migration.js`에 DB 접속 비밀번호가 코드로 포함됨.  
**원인:** 임시 마이그레이션 실행 편의를 위해 하드코딩된 것으로 추정.  
**해결:** 파일을 “credential-less wrapper”로 변경하여 `.env.local`의 `POSTGRES_URL_NON_POOLING`을 사용하는 `scripts/run-migration-file.mjs`로 위임.  
**후속 조치:** 이미 커밋/배포된 이력이 있다면 해당 비밀번호는 유출로 간주하고 즉시 회전(rotate) 권장. 히스토리 purge는 별도 승인 후 진행.

### Content Hash Dedup Scope Mismatch (Import API)
**날짜:** 2026-02-20  
**증상:** `/api/memories/import` with `skip_duplicates=true` skipped memories across different namespaces and could fail an entire batch on a single duplicate/conflict.  
**원인:** Dedup pre-check used user-level comparison only, while DB uniqueness is scoped to `(user_id, namespace, content_hash)`. Batch insert also treated one insert error as full-batch failure.  
**해결:** Switched dedup key to `namespace + content_hash`, added in-request dedup tracking, and changed insert flow to row-level resilient insert with `upsert(... ignoreDuplicates)` when dedup is enabled.

### Memory Personalization Migration FK Type Mismatch
**날짜:** 2026-02-21  
**증상:** `20260221_memory_personalization_learning.sql` 적용 시 `foreign key constraint "user_memory_learning_profiles_user_id_fkey" cannot be implemented` 오류로 롤백됨.  
**원인:** 실DB 스키마에서 `profiles.id` / `memories.user_id` 타입이 `text`인데 신규 마이그레이션의 `user_id`를 `uuid`로 정의하여 FK 타입 불일치 발생.  
**해결:** 마이그레이션을 `user_id TEXT REFERENCES profiles(id)`로 수정하고 RLS 비교를 `auth.uid()::text`로 변경 후 재적용. 생성 테이블/RLS/policies 검증 완료.

### Summer Vector RPC Overload Ambiguity (PGRST203)
**날짜:** 2026-02-22
**증상:** `/api/summer/rag` 요청 시 Supabase RPC 호출이 `PGRST203`로 실패하며 500 반환. `summer_hybrid_search_chunks`/`summer_search_chunks`의 `real` vs `double precision` 시그니처 선택 실패.
**원인:** PostgREST가 동일 함수명 오버로드 중 인자 타입을 단일 후보로 해석하지 못해 RPC 라우팅이 불안정.
**해결:** `src/lib/summer/vectorstore/supabase.ts`에 RPC 실패(`PGRST203`) fallback 추가.
- Hybrid: semantic + keyword를 개별 실행 후 JS 로컬 RRF fusion
- Semantic: `summer_chunks` 직접 조회 후 임베딩 cosine 유사도 로컬 계산
결과적으로 오버로드 충돌 상황에서도 검색이 정상 동작하며 RAG가 200으로 복구됨.


### Device Approval Failed with Auth/Profile ID Drift
**??:** 2026-03-06
**??:** `POST /api/auth/device/approve`? production?? `Failed to create API key` 500? ???? device flow? ?? ???? ??.
**??:** NextAuth credentials ??? `session.user.id`? Supabase Auth user id? ?????, production `api_keys.user_id` FK? `profiles.id`? ???? ?? legacy profile id? ??? ? insert? ???.
**??:** `C:/Users/admin/Projects/seizn/src/lib/profile/resolve.ts`? ?? id? `profiles.id` ???? ?????, `C:/Users/admin/Projects/seizn/src/lib/auth.ts` JWT/session ??? `C:/Users/admin/Projects/seizn/src/lib/api/request-user.ts` ??? ????. ??? ?? API key ?? ??? scoped payload? ????.

### Auth.js Session Cookie Fallback Missed Chunked Production Cookies
**날짜:** 2026-03-06
**증상:** `POST /api/auth/device/approve` 수정 후에도 production에서 세션 기반 API가 간헐적으로 raw Auth user id를 사용하거나 `Unauthorized`로 떨어졌다.
**원인:** 커스텀 세션 fallback이 `next/headers`의 `cookies().get()`로 단일 cookie만 읽고 있어서 Auth.js `SessionStore`가 처리하는 production/chunked session cookie를 안정적으로 복원하지 못했다. 또한 `auth()`를 직접 쓰는 라우트들은 `session.user.id`를 별도 정규화하지 않았다.
**해결:** `C:/Users/admin/Projects/seizn/src/lib/auth/session-token.ts`를 `@auth/core/jwt.getToken()` 기반으로 교체해 Auth.js와 동일한 cookie parsing 경로를 사용하도록 수정했다. 추가로 `C:/Users/admin/Projects/seizn/src/lib/profile/normalize.ts`를 도입하고 `C:/Users/admin/Projects/seizn/src/lib/auth.ts`의 `session` callback과 `C:/Users/admin/Projects/seizn/src/lib/api/request-user.ts`가 공통 profile id 정규화를 사용하도록 통일했다.

### Active Organization Personal Selection Reverted To Default Org
**Date:** 2026-03-06
**Symptom:** In dashboard org switching, selecting personal scope could snap back to the default organization, and org-switch persistence in local E2E often fell back to session-only state.
**Cause:** The session token treated organizationId = null as an unset value, so server callbacks re-resolved a default org from memberships. TopBar also had a same-tab org creation refresh race that could overwrite the current selection.
**Fix:** Added an explicit organizationSelection session claim, propagated it through Auth.js callbacks, session-token parsing, request-user resolution, and org resolution helpers, and made the dashboard org UI event/session aware. Added a dedicated org switch API, same-tab org-created event detail handling, stale fetch guards in TopBar, and a Playwright regression test for org switching.

### DB Utility Scripts Ignored Local Env Overrides
**Date:** 2026-03-06
**Symptom:** Migration and verification scripts could report success against one Supabase project while the local runtime still showed the original schema drift.
**Cause:** `dotenv.config()` was loading `.env.local` without `override: true`, so pre-existing shell `POSTGRES_*` and `SUPABASE_*` variables could silently win. That sent `run-migration-file.mjs` and DB verification scripts to the wrong database.
**Fix:** Added `scripts/load-local-env.mjs` and switched DB-facing scripts to load `.env.local` with `override: true`. Then re-applied the `profiles.organization_id` compatibility migration to the actual local target DB and corrected the runtime primitive verifier so budget tables are checked against `auth.users.id`, which matches the live schema.

### Production Status Route Reported Cross-Region DB Latency
**Date:** 2026-03-06
**Symptom:** `https://www.seizn.com/api/status` could intermittently report the Database service as degraded even when the rest of production was healthy.
**Cause:** The public status route was executing in Vercel `iad1` while Supabase was hosted in `ap-northeast-1`, so the DB health probe paid inter-region latency and occasional cold-start spikes. The status endpoint then cached that degraded result.
**Fix:** Switched the status probe to `profiles`, raised degraded/down thresholds, disabled caching for non-operational states, and set `vercel.json` `regions` to `["hnd1"]` so Node functions execute near the Supabase region. A route-level `preferredRegion` hint on the Node status handler did not change the actual runtime region and was removed.

### Post-Mortem Runtime Verification Needed CJS Bundle
**Date:** 2026-04-21
**Symptom:** One-off STAGE-09 runtime verification could not run with `npx tsx` on Windows, and an esbuild ESM bundle failed on dynamic `require("crypto")` from PDF dependencies.
**Cause:** The local workspace did not expose a `tsx` shim, and the PDF dependency chain still uses CommonJS dynamic requires that are not valid inside an ESM verification bundle.
**Fix:** Bundle the temporary verification entry with esbuild as CommonJS (`--format=cjs --platform=node`) and run the generated `.cjs` file. Keep the generated file under `%TEMP%` and delete it after the run.

### Seizn Pooler Env Drift Blocked Migration Verification
**Date:** 2026-04-21
**Symptom:** `node scripts/run-migration-file.mjs supabase/migrations/20260421021_pro_features.sql` failed against `.env.local` with either `password authentication failed for user "postgres"` or `Tenant or user not found`.
**Cause:** The workspace `.env.local` and original project `.env.local` had stale Supabase pooler credentials/hosts, while `C:\Users\admin\.env.litheon` still had the valid Seizn pooler URL under `POSTGRES_URL_SEIZN`.
**Resolution:** Added `SEIZN_ENV_FILE` support to `scripts/load-local-env.mjs` and ran the migration with `POSTGRES_URL_NON_POOLING` populated from `POSTGRES_URL_SEIZN` without printing secret values.

### Runtime DB Verifier Guardrails Drifted On Active Seizn DB
**Date:** 2026-04-21
**Symptom:** Post-migration `verify:e2e-encryption-db` exited non-zero even after the BA-01 SQL applied successfully.
**Cause:** The active DB target was missing `hybrid_search_memories` and `search_memories`, `keyword_search_memories` still cast text user ids to UUID, and `flight_recorder_traces` still allowed anon/authenticated SELECT.
**Resolution:** Added and applied `supabase/migrations/20260421022_runtime_verification_guardrails.sql`, restoring the three search RPCs for the text `memories.user_id` schema and revoking public view access while preserving `service_role` access.

### Local Supabase Reset Blocked By Legacy Migration Replay Drift
**Date:** 2026-04-22
**Symptom:** `pnpm exec supabase start` and `pnpm exec supabase db reset` failed repeatedly while replaying legacy migrations.
**Cause:** Historical migrations were not clean-replay safe after `profiles.id` moved to `text`; overlapping migrations reused table, index, policy, trigger, and view names, and some DDL assumed optional extensions or compatibility columns.
**Resolution:** Made legacy migrations replay-safe with idempotent policy, trigger, and index creation, text casts for profile-scoped IDs, conditional PGroonga DDL, additive compatibility columns, and function/view signature fixes. Verified with `pnpm exec supabase db reset`.

### Author UI Slug Regex Patch Context Mismatch
**Date:** 2026-05-02
**Symptom:** Direct `apply_patch` replacement for the Author UI slug regex failed because the shell-rendered context showed mojibake while the file contained the valid Korean range `가-힣`.
**Cause:** PowerShell output encoding did not match the file's actual Unicode content, so the patch context copied from terminal output was stale.
**Fix:** Re-read the actual line with `Select-String`, then patched the real Unicode regex context. For future edits, verify suspect non-ASCII context from the file before building a manual patch.

### Next Stable Audit Advisory Required Canary Install Guard
**Date:** 2026-05-02
**Symptom:** `npm audit --omit=dev` stayed nonzero after routine dependency updates because the stable Next.js line still resolved a vulnerable PostCSS dependency. Moving to the patched Next.js canary cleared the audit, but `npm ci` then rejected peer ranges that did not accept a prerelease Next version.
**Cause:** The stable Next.js dependency graph had no patched PostCSS release available for this project yet, while several peer dependencies expressed ranges for stable Next versions only.
**Resolution:** Upgraded the Next.js toolchain to `16.3.0-canary.8`, added a repo-local `.npmrc` with `legacy-peer-deps=true`, and verified `npm ci --dry-run`, `npm audit --omit=dev`, `npm run typecheck`, `npm run lint`, `npm run test:run`, and `npm run build`.

### Scoped API Key Organization Binding Spoof
**Date:** 2026-05-02
**Symptom:** Scoped API keys could carry an organization binding that did not match the validated scope owner, and legacy API key validation trusted `api_keys.organization_id` directly.
**Cause:** Scope configuration validation did not reject user-scoped organization/project bindings, and API key authentication did not re-check organization membership before returning an organization context.
**Resolution:** Added scoped config validation, membership checks for organization/project scoped API keys, normalized user-scope updates, and route-level `graph:*` / `fall:*` scope enforcement with focused regression tests.

### Device Flow Plaintext Token Persistence
**Date:** 2026-05-09
**Symptom:** Approved device-flow rows kept the raw API token in `device_auth_codes.access_token`, and repeated token polls could receive the same bearer token.
**Cause:** The device authorization flow used the DB row as temporary token transfer storage but did not retain a hash-only record after first retrieval.
**Resolution:** Added `device_auth_codes.access_token_hash`, backfilled SHA-256 hashes for existing active flows without dropping `access_token`, wrote hashes during approval, and changed `/api/auth/device/token` to atomically clear the raw token on first successful poll. A later cleanup migration can drop `access_token` after all flows older than 15 minutes have expired.
### Policy Consistency Check False Positives and Hardcoded Legal Durations
**Date:** 2026-05-10
**Symptom:** `npm run check:policy` failed on policy pages, trust/docs copy, RTBF UI copy, and operational dashboard durations.
**Cause:** Legal/security/refund durations were still hardcoded in UI copy, while the policy scanner also treated non-policy usage windows, status history, demo dates, and filters as policy commitments.
**Resolution:** Added security, trial, design partner, and extended retention constants to `src/lib/policy.ts`; moved legal/trust/docs/RTBF copy to those constants; narrowed the scanner to ignore operational/demo durations while still detecting hardcoded policy numbers.

### P0 memories.is_deleted schema drift made stored memories invisible to GET
**Date:** 2026-05-11
**Status:** ✅ shipped (PR #355, code commit `bf2be8aa`). Runtime backfill was already applied before this code change.
**Symptom:** `POST /api/v1/memories` returned success, but `GET /api/v1/memories/{id}` and browse/search paths returned 404/0 rows for freshly inserted rows whose `is_deleted` was NULL.
**Cause:** Production `memories.is_deleted` drifted to nullable with no default, while read paths filter `is_deleted = false`.
**Resolution:** Memory insert paths now explicitly write `is_deleted=false`, `deleted_at=null`, and plain-text paths write `is_encrypted=false`. Added `supabase/migrations/20260511002_prod_p0_memory_schema_convergence.sql` to backfill and enforce NOT NULL/defaults for `memories.is_deleted` and sibling boolean drift columns. Added a POST -> GET-by-id route regression test and production smoke GET-by-id check.

### P0 Stripe webhook apex redirect kept billing events pending
**Date:** 2026-05-11
**Status:** ✅ shipped (PR #355, code commit `bf2be8aa`). Stripe Dashboard URL hotfix was already applied before this code change.
**Symptom:** Stripe webhook endpoint registered as `https://seizn.com/api/webhooks/stripe` received 308 redirects to `https://www.seizn.com/api/webhooks/stripe`, leaving webhook deliveries pending because Stripe does not follow redirects.
**Cause:** Externally registered Stripe URL used the apex domain while production webhook handling is on `www`.
**Resolution:** Production smoke now POSTs to the apex webhook URL with redirects disabled and fails on any 3xx. Added `npm run verify:stripe-webhook-url` to query Stripe webhook endpoint URLs and fail on drift from `https://www.seizn.com/api/webhooks/stripe`.

### P0 Track 2 Stripe subscriptions did not update profiles.plan
**Date:** 2026-05-11
**Status:** ✅ shipped (PR #355, code commits `bf2be8aa`, `f11267cc`). One-user SQL hotfix was already applied before this code change.
**Symptom:** A paid Track 2 API/MCP Pro subscription could keep `/api/me` and rate-limit logic on `profile.plan='free'`.
**Cause:** Track 2 webhook branches updated API key quotas but did not persist the Track 2 tier back to `profiles.plan`.
**Resolution:** Stripe webhook `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted` Track 2 branches now sync `profiles.plan`, subscription status fields, price lock version, and cancellation downgrade state. `studio_managed` maps to the existing `studio` profile plan.

### P1 SpringV4 bridge mirror enabled without production schema
**Date:** 2026-05-11
**Status:** ✅ shipped (PR #355, code commit `bf2be8aa`).
**Symptom:** Memory POSTs logged SpringV4 mirror failures because `spring_memory_notes` was absent in production, though legacy memory writes still succeeded.
**Cause:** `MEMORY_V1_SPRING_BRIDGE_MIRROR` was effectively on by default before the SpringV4 read/write schema was ready.
**Resolution:** Mirror is now explicit opt-in only (`MEMORY_V1_SPRING_BRIDGE_MIRROR=true`). SpringV4 search fallback is bounded by `MEMORY_V1_SPRING_BRIDGE_SEARCH_TIMEOUT_MS` with a 5s default.

### P2 Hybrid memory search cold-start timeout
**Date:** 2026-05-11
**Status:** ✅ shipped partial guard (PR #355, code commit `bf2be8aa`).
**Symptom:** `/api/v1/memories?mode=hybrid` could hit Vercel timeout during cold-start/empty-pool searches.
**Cause:** Voyage embedding and SpringV4 bridge search could consume too much function time without explicit local timeouts.
**Resolution:** Voyage embedding fetches now abort after `VOYAGE_FETCH_TIMEOUT_MS` with a 5s default, and SpringV4 bridge search is separately capped at 5s before falling back to legacy search.

### profile.memory_count drift on soft-delete
**Date:** 2026-05-11
**Status:** ✅ shipped (PR #355, code commit `bf2be8aa`).
**Symptom:** Soft-deleted memories could continue counting against profile memory quota.
**Cause:** The live `update_memory_count()` trigger behavior drifted from active-row counting semantics.
**Resolution:** `supabase/migrations/20260511002_prod_p0_memory_schema_convergence.sql` replaces `update_memory_count()` with explicit insert/delete/update soft-delete handling and recomputes `profiles.memory_count` from active memories.
### Track 2 API Key Revoke Surfaced HTML-as-JSON and Schema Drift
**Date:** 2026-05-10
**Symptom:** The dashboard API key revoke flow showed `Unexpected token '<', "<script ty"... is not valid JSON`, test keys remained active, and the revoke confirm dialog looked transparent.
**Cause:** The client was invoking a server action from the revoke dialog, so transport failures could surface as HTML parsed as JSON. The replacement revoke path also initially wrote `api_keys.updated_at`, but the active schema cache does not expose that column.
**Resolution:** Moved revoke to a CSRF-protected JSON DELETE route, wrapped client mutations so raw transport errors become product toasts, removed `updated_at` writes from API key revoke/rotate updates, and strengthened modal overlay/card opacity. Added a Playwright create-and-revoke regression.

### Billing Portal 404 For Accounts Without Stripe Customer
**Date:** 2026-05-10
**Symptom:** Clicking billing management on `/dashboard/author/settings` could show `{"error":"No billing account found"}` for Free/new accounts that had no Stripe customer yet.
**Cause:** Author settings, dashboard billing, and the legacy billing portal endpoint treated a missing `stripe_customer_id` as a hard portal error. That is valid backend state for Free accounts, but wrong UX for a billing management CTA.
**Resolution:** Portal actions now return a pricing destination (`/pricing`, `reason: no_billing_account`) when no Stripe customer exists, so the user can start checkout instead of seeing raw JSON. Stripe secret handling was also centralized so billing code accepts `STRIPE_SECRET_KEY_SEIZN` wherever the env guard allows it.

### Pricing Checkout Column Drift
**Date:** 2026-05-10
**Symptom:** The `/pricing` page could visually show BYOK pricing while `/api/billing/checkout` still selected a Managed price, or an active BYOK user could click a Managed CTA and be routed to the BYOK price.
**Cause:** The checkout API ignored the explicit Managed/BYOK column from the client and derived the column only from the saved BYOK state. Checkout metadata also did not include the billing column, so open checkout session reuse could cross Managed/BYOK selections for the same tier and cadence.
**Resolution:** Pricing and checkout clients now send `column`, the checkout route validates it, resolves the Stripe price from the explicit column first, records `billing_column` in metadata, and regression tests cover BYOK/Managed selection and invalid column fallback prevention.

### Author Token Meter Event Used Meter ID As Event Name
**Date:** 2026-05-10
**Symptom:** Managed author token overage events could be submitted to Stripe with a meter ID such as `meter_...` in the `event_name` field.
**Cause:** `emitAuthorTokenOverage()` read `STRIPE_METER_ID_MEMORIES` / `STRIPE_METER_ID_OPS` as the Stripe meter event name, but Stripe expects the configured meter event name, not the meter object ID.
**Resolution:** Author token overage now uses the canonical `seizn_memories_overage` event name from `stripe-metered.ts` while still requiring meter config and a Stripe secret before allowing over-cap managed usage. Tests now assert the correct event name.

### Production Checkout Failed With Expired Stripe Secret Key
**Date:** 2026-05-11
**Symptom:** Clicking a pricing checkout button on production returned `{"error":"Failed to create checkout session"}` and Vercel logs showed a Stripe authentication failure for an expired live API key.
**Cause:** Production only had the legacy `STRIPE_SECRET_KEY` configured, and that key had expired. A valid live restricted key was present in the local Litheon secret bucket but was not configured in Vercel or accepted first by the runtime helper.
**Resolution:** Verified the restricted key can retrieve prices, create/list/expire checkout sessions, list subscriptions, and create/delete customers without printing secret values. Stripe runtime resolution now prefers `STRIPE_RESTRICTED_KEY`, the production env guard accepts it, and focused billing/env tests cover the fallback.

### Track 2 Paid Subscription Displayed As Free In Dashboard
**Date:** 2026-05-11
**Symptom:** A paid API/MCP Pro monthly subscriber still saw `Free - $0` and `inactive` in the dashboard billing card, and the active API key retained Free quota.
**Cause:** Track 2 Stripe webhook branches applied quota to `api_keys` but did not persist Track 2 subscription state separately from Track 1 Author Memory fields. `/api/account/subscription` only read Track 1 profile columns, so a valid Track 2 subscription could look inactive in billing UI.
**Resolution:** Added separate `profiles.track2_*` subscription columns, synced them from Track 2 webhook events, added live Stripe recovery in `/api/account/subscription` and the API keys page, and updated billing UI to show Web and API/MCP subscriptions separately. Backfilled the affected account from Stripe live state and updated active API keys to Pro quota.
