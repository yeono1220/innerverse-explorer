-- 0016_diary_insight.sql
-- 감정 분석의 해석(reason/reframe/next_step)을 일기에 저장한다.
--   · 분석 결과 화면·일기 상세의 '모모의 해석' 카드 데이터.
--   · 규칙 기반 폴백으로 분석된 일기는 NULL (카드 미표시).
-- 실행: Supabase SQL Editor. 멱등.

alter table public.diary_entries add column if not exists insight jsonb;

comment on column public.diary_entries.insight is
  '모델 해석 {reason, reframe, next_step}. 휴리스틱 폴백이면 NULL.';
