alter table if exists requests add column if not exists ai_confidence double precision;
alter table if exists requests add column if not exists ai_rationale text;