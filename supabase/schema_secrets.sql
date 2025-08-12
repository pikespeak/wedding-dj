create table if not exists secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
