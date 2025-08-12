create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  session_code text not null,
  guest_name text,
  text text not null,              -- Original-Wunschtext
  status text not null default 'pending', -- pending | approved | rejected | queued | played
  spotify_track_id text,           -- gewählter Spotify-Track
  title text,
  artist text,
  note text,
  ip_hash text,                    -- für simples Rate-Limit
  created_at timestamptz default now()
);
create index if not exists idx_requests_session_status on requests(session_code, status);
