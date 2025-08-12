#!/usr/bin/env zsh
set -euo pipefail

ROOT="$(pwd)"

backup_if_exists() {
  local f="$1"
  if [ -f "$f" ]; then
    cp "$f" "$f.bak"
    echo "  • Backup: $f -> $f.bak"
  fi
}

echo "→ Spotify Setup: Ordner anlegen…"
mkdir -p lib
mkdir -p app/api/spotify/login
mkdir -p app/api/spotify/callback
mkdir -p app/api/spotify/status
mkdir -p app/api/spotify/devices
mkdir -p app/api/spotify/transfer
mkdir -p app/api/spotify/play
mkdir -p app/api/spotify/pause
mkdir -p supabase
mkdir -p scripts

echo "→ Helper-Dateien schreiben…"

# lib/appConfig.ts
backup_if_exists lib/appConfig.ts
cat > lib/appConfig.ts <<'EOF'
export function sessionCode() {
  return process.env.NEXT_PUBLIC_APP_SESSION_CODE || process.env.APP_SESSION_CODE || "GOCH-2026"
}
EOF

# lib/spotify.types.ts
backup_if_exists lib/spotify.types.ts
cat > lib/spotify.types.ts <<'EOF'
export type SpotifyTokenResponse = {
  access_token: string
  token_type: "Bearer"
  expires_in: number
  refresh_token?: string
  scope?: string
}

export type SpotifyDevice = {
  id: string
  is_active: boolean
  is_private_session: boolean
  is_restricted: boolean
  name: string
  type: string
  volume_percent: number | null
}
EOF

# lib/spotify.ts  (echte Web API + OAuth)
backup_if_exists lib/spotify.ts
cat > lib/spotify.ts <<'EOF'
import { getAdminSupabase } from "@/lib/supabase.server"
import type { SpotifyTokenResponse, SpotifyDevice } from "@/lib/spotify.types"
import { sessionCode } from "@/lib/appConfig"

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!

const TOKEN_KEY = `spotify_refresh_token_${sessionCode()}`

function b64(str: string) {
  return Buffer.from(str).toString("base64")
}

export async function saveRefreshToken(refreshToken: string) {
  const supa = getAdminSupabase()
  if (!supa) throw new Error("supabase not configured")
  await supa.from("secrets").upsert({ key: TOKEN_KEY, value: refreshToken })
}

export async function getRefreshToken(): Promise<string | null> {
  const supa = getAdminSupabase()
  if (!supa) throw new Error("supabase not configured")
  const { data } = await supa.from("secrets").select("value").eq("key", TOKEN_KEY).single()
  return (data?.value as string | undefined) ?? null
}

export function authorizeUrl(scopes: string[]) {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: scopes.join(" "),
    state: Math.random().toString(36).slice(2),
  })
  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
  })
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${b64(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body,
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`)
  return (await res.json()) as SpotifyTokenResponse
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${b64(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body,
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`)
  return (await res.json()) as SpotifyTokenResponse
}

async function getAccessToken(): Promise<string> {
  const rt = await getRefreshToken()
  if (!rt) throw new Error("no refresh token saved")
  const tokens = await refreshAccessToken(rt)
  if (tokens.refresh_token) {
    // Spotify kann ein neues RT liefern → speichern
    await saveRefreshToken(tokens.refresh_token)
  }
  return tokens.access_token
}

async function spotifyFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const make = async (): Promise<Response> => {
    const access = await getAccessToken()
    const url = path.startsWith("http") ? path : `https://api.spotify.com/v1${path}`
    return fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${access}`,
        "content-type": (init.headers as any)?.["content-type"] || "application/json",
      },
      cache: "no-store",
    })
  }

  let res = await make()
  if (res.status === 401) {
    // einmal neu versuchen
    res = await make()
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`spotify ${res.status}: ${text}`)
  }
  if (res.status === 204) return {} as T
  return (await res.json()) as T
}

// === Web API helpers ===
export async function listDevices(): Promise<SpotifyDevice[]> {
  const json = await spotifyFetch<{ devices: SpotifyDevice[] }>("/me/player/devices")
  return json.devices || []
}

export async function transferPlayback(deviceId: string) {
  await spotifyFetch(`/me/player`, {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play: true }),
  })
  return { ok: true }
}

export async function play() {
  await spotifyFetch(`/me/player/play`, { method: "PUT" })
  return { ok: true }
}

export async function pause() {
  await spotifyFetch(`/me/player/pause`, { method: "PUT" })
  return { ok: true }
}

export async function nextTrack() {
  await spotifyFetch(`/me/player/next`, { method: "POST" })
  return { ok: true }
}
EOF

echo "→ API-Routen schreiben…"

# app/api/spotify/login/route.ts
backup_if_exists app/api/spotify/login/route.ts
cat > app/api/spotify/login/route.ts <<'EOF'
import { NextResponse } from "next/server"
import { authorizeUrl } from "@/lib/spotify"

export async function GET() {
  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
  ]
  const url = authorizeUrl(scopes)
  return NextResponse.redirect(url)
}
EOF

# app/api/spotify/callback/route.ts
backup_if_exists app/api/spotify/callback/route.ts
cat > app/api/spotify/callback/route.ts <<'EOF'
import { NextResponse } from "next/server"
import { exchangeCodeForTokens, saveRefreshToken } from "@/lib/spotify"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  if (error) return NextResponse.redirect(`/?spotify_error=${encodeURIComponent(error)}`)
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 })

  try {
    const tokens = await exchangeCodeForTokens(code)
    if (tokens.refresh_token) await saveRefreshToken(tokens.refresh_token)
  } catch (e: any) {
    return NextResponse.redirect(`/?spotify_error=${encodeURIComponent(e.message || "auth_failed")}`)
  }

  return NextResponse.redirect(`/?spotify=connected`)
}
EOF

# app/api/spotify/status/route.ts
backup_if_exists app/api/spotify/status/route.ts
cat > app/api/spotify/status/route.ts <<'EOF'
import { NextResponse } from "next/server"
import { getRefreshToken } from "@/lib/spotify"

export async function GET() {
  try {
    const rt = await getRefreshToken()
    return NextResponse.json({ connected: !!rt })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
EOF

# app/api/spotify/devices/route.ts
backup_if_exists app/api/spotify/devices/route.ts
cat > app/api/spotify/devices/route.ts <<'EOF'
import { NextResponse } from "next/server"
import { listDevices } from "@/lib/spotify"

export async function GET() {
  try {
    const devices = await listDevices()
    return NextResponse.json({ devices })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "devices_failed" }, { status: 500 })
  }
}
EOF

# app/api/spotify/transfer/route.ts
backup_if_exists app/api/spotify/transfer/route.ts
cat > app/api/spotify/transfer/route.ts <<'EOF'
import { NextResponse } from "next/server"
import { transferPlayback } from "@/lib/spotify"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body?.deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 })
  try {
    const res = await transferPlayback(body.deviceId)
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "transfer_failed" }, { status: 500 })
  }
}
EOF

# app/api/spotify/play/route.ts
backup_if_exists app/api/spotify/play/route.ts
cat > app/api/spotify/play/route.ts <<'EOF'
import { NextResponse } from "next/server"
import { play } from "@/lib/spotify"

export async function POST() {
  try {
    const res = await play()
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "play_failed" }, { status: 500 })
  }
}
EOF

# app/api/spotify/pause/route.ts
backup_if_exists app/api/spotify/pause/route.ts
cat > app/api/spotify/pause/route.ts <<'EOF'
import { NextResponse } from "next/server"
import { pause } from "@/lib/spotify"

export async function POST() {
  try {
    const res = await pause()
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "pause_failed" }, { status: 500 })
  }
}
EOF

# Supabase schema for secrets
backup_if_exists supabase/schema_secrets.sql
cat > supabase/schema_secrets.sql <<'EOF'
create table if not exists secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
EOF

echo "✓ Dateien erstellt/aktualisiert."

echo
echo "Nächste Schritte:"
echo "1) ENV prüfen (.env.local / Vercel):"
echo "   SPOTIFY_CLIENT_ID=..."
echo "   SPOTIFY_CLIENT_SECRET=..."
echo "   SPOTIFY_REDIRECT_URI=http://localhost:3000/api/spotify/callback"
echo "   SPOTIFY_SCOPES='user-read-playback-state user-modify-playback-state user-read-currently-playing'"
echo "   (und Supabase-Keys sind gesetzt)"
echo "2) In Supabase SQL ausführen: supabase/schema_secrets.sql"
echo "3) Dev neu starten: rm -rf .next && npm run dev"
echo "4) Test:"
echo "   - Öffne /api/spotify/login → Login → Redirect"
echo "   - GET /api/spotify/status → { connected: true }"
echo "   - GET /api/spotify/devices → Liste"