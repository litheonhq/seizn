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
