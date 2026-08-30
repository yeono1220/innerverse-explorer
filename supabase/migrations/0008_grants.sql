-- 0008_grants.sql
-- 목적: public 스키마의 모든 테이블/시퀀스/함수에 anon·authenticated 롤 권한을 복구한다.
--
-- 배경:
--   0001~0007 마이그레이션은 테이블마다 RLS(행 수준 보안)는 켜지만,
--   테이블 수준 GRANT는 user_cards(0002) 하나에만 명시돼 있었다.
--   나머지 테이블은 Supabase 기본 권한(default privileges)에 의존했는데,
--   이 프로젝트 DB에는 그 기본 권한이 적용돼 있지 않아 authenticated 롤이
--   profiles·diary_entries 등 모든 테이블에서 403(permission denied)을 맞았다.
--   (PostgREST hint: "GRANT SELECT ON public.profiles TO authenticated;")
--
-- 안전성:
--   각 테이블에 RLS가 켜져 있으므로, 아래 GRANT는 "테이블 접근 게이트"만 열 뿐
--   행 필터링(본인 데이터만)은 기존 RLS 정책(id = auth.uid() 등)이 그대로 강제한다.
--
-- 멱등성: GRANT / ALTER DEFAULT PRIVILEGES 는 반복 실행해도 안전(no-op).

-- 스키마 사용 권한
grant usage on schema public to anon, authenticated;

-- 기존 테이블: 로그인 사용자는 CRUD, 비로그인(anon)은 읽기만. (행 접근은 RLS가 제한)
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

-- 시퀀스(자동증가 PK insert용) · 함수(RPC) 실행 권한
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- 앞으로 추가될 테이블/시퀀스/함수도 같은 권한을 자동 상속 (403 재발 방지)
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
