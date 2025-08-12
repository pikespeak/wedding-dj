create table if not exists locks (
  key text primary key,
  owner text not null,
  expires_at timestamptz not null,
  updated_at timestamptz default now()
);