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
