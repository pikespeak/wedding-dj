#!/usr/bin/env zsh
set -euo pipefail

backup_if_exists() { [[ -f "$1" ]] && cp "$1" "$1.bak.$(date +%s)" && echo "Backup -> $1.bak.*" || true }

echo "→ SQL-Datei für Musikwünsche anlegen"
mkdir -p supabase
REQSQL="supabase/schema_requests.sql"
backup_if_exists "$REQSQL"
cat > "$REQSQL" <<'SQL'
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
SQL

echo "→ API-Routen anlegen"
mkdir -p app/api/request
mkdir -p app/api/admin/requests/pending
mkdir -p app/api/admin/requests/resolve
mkdir -p app/api/admin/requests/reject

# Hilfsfunktion zur IP-Hash Bildung auf Server (ohne echte IP speichern)
SALT_JS='const SALT = process.env.ADMIN_PIN || "salt"; function ipHash(ip){const c=require("crypto");return c.createHash("sha256").update(`${ip}:${SALT}`).digest("hex").slice(0,32)}'

REQ_ROUTE="app/api/request/route.ts"
backup_if_exists "$REQ_ROUTE"
cat > "$REQ_ROUTE" <<'TS'
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"
import { searchTrack } from "@/lib/spotify.search"

const SALT = process.env.ADMIN_PIN || "salt"
import crypto from "crypto"
function ipHash(ip: string){ return crypto.createHash("sha256").update(`${ip}:${SALT}`).digest("hex").slice(0,32) }

export async function POST(req: Request) {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const body = await req.json().catch(() => ({} as any))
  const text = (body?.text || body?.spotifyId || "").toString().trim()
  const guest = (body?.guest || "").toString().trim() || null

  if (!text) return NextResponse.json({ error: "missing text" }, { status: 400 })

  // simples Rate-Limit: max 3 Wünsche in 5 Minuten pro IP/Session
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0"
  const hash = ipHash(ip)
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const recent = await supa
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("session_code", sessionCode())
    .eq("ip_hash", hash)
    .gte("created_at", since)
  if ((recent.count ?? 0) >= 3) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  // Wunsch speichern (zunächst pending)
  const ins = await supa
    .from("requests")
    .insert({
      session_code: sessionCode(),
      guest_name: guest,
      text,
      ip_hash: hash,
      status: "pending",
    })
    .select()
    .single()
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })

  // Optional: gleich Spotify-Suche anstoßen (Top-Kandidat nur als Hinweis; Entscheidung im Admin)
  try {
    const suggestion = await searchTrack(text)
    return NextResponse.json({ ok: true, request: ins.data, suggestion })
  } catch {
    return NextResponse.json({ ok: true, request: ins.data })
  }
}
TS

# Admin: Pending-Liste
PENDING_ROUTE="app/api/admin/requests/pending/route.ts"
backup_if_exists "$PENDING_ROUTE"
cat > "$PENDING_ROUTE" <<'TS'
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function GET() {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const { data, error } = await supa
    .from("requests")
    .select("id, text, guest_name, created_at")
    .eq("session_code", sessionCode())
    .eq("status", "pending")
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}
TS

# Admin: Resolve (approve) → wählt Spotify-Track + schreibt in Queue
RESOLVE_ROUTE="app/api/admin/requests/resolve/route.ts"
backup_if_exists "$RESOLVE_ROUTE"
cat > "$RESOLVE_ROUTE" <<'TS'
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"
import { searchTrack } from "@/lib/spotify.search"

export async function POST(req: Request) {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const body = await req.json().catch(() => ({} as any))
  const id = body?.id as string | undefined
  let spotifyId = body?.spotifyId as string | undefined
  const query = (body?.query || "").toString()

  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 })

  // Falls spotifyId fehlt: Suche durchführen (Top-1)
  if (!spotifyId) {
    if (!query) return NextResponse.json({ error: "missing spotifyId or query" }, { status: 400 })
    const s = await searchTrack(query)
    spotifyId = s?.id
    if (!spotifyId) return NextResponse.json({ error: "no_match" }, { status: 404 })
  }

  // Wunsch lesen
  const w = await supa.from("requests").select("*").eq("id", id).single()
  if (w.error) return NextResponse.json({ error: w.error.message }, { status: 500 })

  // Wunsch als approved markieren + Metadaten schreiben
  const upd = await supa
    .from("requests")
    .update({ status: "approved", spotify_track_id: spotifyId, title: w.data.title || null, artist: w.data.artist || null })
    .eq("id", id)
    .select()
    .single()
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 })

  // In Queue eintragen (vereinfachtes Schema – passt es bei dir?)
  const q = await supa.from("queue").insert({
    session_code: sessionCode(),
    track_spotify_id: spotifyId,
    requested_by: w.data.guest_name || null,
    reason: w.data.text,
    source: "wish",
  })
  if (q.error) return NextResponse.json({ error: q.error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
TS

# Admin: Reject
REJECT_ROUTE="app/api/admin/requests/reject/route.ts"
backup_if_exists "$REJECT_ROUTE"
cat > "$REJECT_ROUTE" <<'TS'
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"

export async function POST(req: Request) {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const body = await req.json().catch(() => ({} as any))
  const id = body?.id as string | undefined
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 })

  const upd = await supa.from("requests").update({ status: "rejected" }).eq("id", id)
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
TS

echo "→ Spotify-Suche Helper anlegen"
mkdir -p lib
SEARCH_LIB="lib/spotify.search.ts"
backup_if_exists "$SEARCH_LIB"
cat > "$SEARCH_LIB" <<'TS'
import { refreshAccessToken, getRefreshToken, saveRefreshToken } from "@/lib/spotify"

export async function searchTrack(query: string): Promise<{ id: string; title: string; artist: string } | null> {
  const rt = await getRefreshToken()
  if (!rt) throw new Error("no refresh token saved")
  const t = await refreshAccessToken(rt)
  if (t.refresh_token) await saveRefreshToken(t.refresh_token)

  const url = new URL("https://api.spotify.com/v1/search")
  url.searchParams.set("q", query)
  url.searchParams.set("type", "track")
  url.searchParams.set("limit", "5")
  url.searchParams.set("market", "DE")

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${t.access_token}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`spotify search ${res.status}`)
  const json = await res.json()
  const item = json?.tracks?.items?.[0]
  if (!item) return null
  return { id: item.uri || item.id, title: item.name, artist: (item.artists || []).map((a: any) => a.name).join(", ") }
}
TS

echo "✓ Fertig. Bitte als nächstes ausführen:"
echo "1) Supabase SQL: supabase/schema_requests.sql"
echo "2) Dev neu starten: rm -rf .next && npm run dev"
echo "3) Gästewunsch: POST /api/request  { text: \"Songtitel\" }"
echo "4) Admin: GET /api/admin/requests/pending  → Liste"
echo "   Approve: POST /api/admin/requests/resolve  { id, spotifyId? oder query }"
echo "   Reject:  POST /api/admin/requests/reject   { id }"