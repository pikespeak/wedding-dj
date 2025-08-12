create table if not exists oauth_tokens (
  provider text not null,                 -- 'spotify'
  session_code text not null,             -- z.B. GOCH-2026
  refresh_token text not null,
  updated_at timestamptz default now(),
  primary key (provider, session_code)
);