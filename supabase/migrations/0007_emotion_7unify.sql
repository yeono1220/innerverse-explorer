-- 0007_emotion_7unify.sql
-- ─────────────────────────────────────────────────────────────
-- 감정 체계 7종 통일 (기쁨/차분/사랑/슬픔/분노/긴장/공허).
-- 행성 분기도 5종 → 7종 확장: bloom/calm/love/wither/rage/tense/void
--   (사랑=love, 분노=rage 가 1등 시민이 됨 — 과거엔 pos/ten 으로 접혔음)
--
-- 0001_init.sql 의 테이블(emotion_analyses/planets/weekly_reviews)은 현재 앱이
-- 직접 쓰지 않는 레거시지만(실사용 저장 경로는 0003 diary_entries 의 JSON),
-- 스키마 일관성을 위해 함께 7종으로 정렬한다.
--
-- 안전/멱등: 값 파괴 없음(컬럼 추가 + CHECK 확장만). 여러 번 실행해도 안전.
-- ※ 인라인 CHECK 의 자동 제약명은 Postgres 규칙상 "<table>_<column>_check" 이다.
-- ─────────────────────────────────────────────────────────────

begin;

-- 1) 행성 분기 CHECK 5종 → 7종 (love, rage 추가) ─ 레거시 3개 테이블
alter table public.emotion_analyses drop constraint if exists emotion_analyses_dominant_check;
alter table public.emotion_analyses
  add constraint emotion_analyses_dominant_check
  check (dominant in ('bloom','calm','love','wither','rage','tense','void'));

alter table public.planets drop constraint if exists planets_branch_check;
alter table public.planets
  add constraint planets_branch_check
  check (branch in ('bloom','calm','love','wither','rage','tense','void'));

alter table public.weekly_reviews drop constraint if exists weekly_reviews_dominant_check;
alter table public.weekly_reviews
  add constraint weekly_reviews_dominant_check
  check (dominant in ('bloom','calm','love','wither','rage','tense','void'));

-- 2) emotion_analyses 를 7감정 라벨 저장으로 정렬.
--    구 5감정 축 컬럼(pos/calm/ten/sad/emp)은 폐기 대상이나 파괴적 삭제 대신
--    7감정 JSON 컬럼을 추가해 신규 경로가 diary_entries 와 동일 형태로 저장하도록 한다.
alter table public.emotion_analyses
  add column if not exists emotions jsonb;        -- [{ "label": "사랑", "pct": 40 }, ...] (7감정)
alter table public.emotion_analyses
  add column if not exists primary_label text;    -- 대표 7감정 라벨

-- 신규 primary_label 은 7감정 라벨만 허용(과거 행 보호 위해 NULL 허용).
alter table public.emotion_analyses drop constraint if exists emotion_analyses_primary_label_check;
alter table public.emotion_analyses
  add constraint emotion_analyses_primary_label_check
  check (primary_label is null or primary_label in
         ('기쁨','차분','사랑','슬픔','분노','긴장','공허'));

comment on column public.emotion_analyses.emotions is
  '7감정 비중 [{label,pct}] — 단일 소스. (구 pos/calm/ten/sad/emp 5축 컬럼은 폐기 예정)';
comment on column public.emotion_analyses.primary_label is
  '대표 7감정 라벨(기쁨/차분/사랑/슬픔/분노/긴장/공허).';

-- 3) 실사용 테이블 diary_entries 는 이미 7감정 호환(emotions jsonb + primary_label text).
--    문서화만 남긴다(하드 CHECK 는 과거 행 보호 위해 생략).
comment on column public.diary_entries.emotions is
  '7감정 비중 [{label,pct}] — 유효 라벨: 기쁨/차분/사랑/슬픔/분노/긴장/공허.';
comment on column public.diary_entries.primary_label is
  '대표 7감정 라벨(기쁨/차분/사랑/슬픔/분노/긴장/공허).';

commit;
