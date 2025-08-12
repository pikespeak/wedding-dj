-- supabase/schema_settings.sql
-- Settings pro Session (key/value Store)
create table if not exists settings (
  session_code text not null,
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (session_code, key)
);