// lib/spotify.ts
import { getRefreshTokenServer, saveRefreshTokenServer } from "@/lib/spotify.tokenstore.server"
import { cookies } from "next/headers"


// ---- ENV ----
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!
const SPOTIFY_REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI || "http://localhost:3000/api/spotify/callback"
const SPOTIFY_MARKET = process.env.SPOTIFY_MARKET || "DE"

const COOKIE_REFRESH_TOKEN = "spotify_refresh_token"

// ---- Refresh-Token speichern/lesen (derzeit Cookie; später ggf. DB) ----
export async function saveRefreshToken(token: string) {
  // Cookie für Browser-Flows
  try {
    cookies().set("spotify_refresh_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })
  } catch {}
  // Zusätzlich in DB für Server-Jobs
  try {
    await saveRefreshTokenServer(token)
  } catch (e) {
    console.warn("[spotify] saveRefreshTokenServer failed:", (e as any)?.message)
  }
}

export async function getRefreshToken(): Promise<string | null> {
  // 1) Serverseitig aus DB (funktioniert in API/Background)
  try {
    const dbRt = await getRefreshTokenServer()
    if (dbRt) return dbRt
  } catch {}
  // 2) Fallback: Cookie (funktioniert im Browser-Kontext)
  const c = cookies().get("spotify_refresh_token")
  return c?.value || null
}

// ---- Token tauschen/auffrischen ----
export async function exchangeCodeForToken(code: string) {
  const params = new URLSearchParams()
  params.set("grant_type", "authorization_code")
  params.set("code", code)
  params.set("redirect_uri", SPOTIFY_REDIRECT_URI)

  const basicAuth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: params,
  })

  if (!res.ok) {
    throw new Error(`Spotify token exchange failed: ${res.status}`)
  }

  return res.json() as Promise<{
    access_token: string
    token_type: "Bearer"
    scope: string
    expires_in: number
    refresh_token?: string
  }>
}

export async function refreshAccessToken(refreshToken: string) {
  const params = new URLSearchParams()
  params.set("grant_type", "refresh_token")
  params.set("refresh_token", refreshToken)

  const basicAuth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: params,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Spotify token refresh failed: ${res.status} ${text}`)
  }

  return res.json() as Promise<{
    access_token: string
    token_type: "Bearer"
    scope: string
    expires_in: number
    refresh_token?: string
  }>
}

/** Baut die Login-URL für Spotify */
export function getSpotifyAuthUrl() {
  const scopes = [
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-private",
    "playlist-modify-public",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
  ]
  const state = Math.random().toString(36).substring(2)

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: scopes.join(" "),
    state,
  })

  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

// ---- interner Helper: gültiges Access Token holen ----
export async function getAccessToken(): Promise<string> {
  const rt = await getRefreshToken()
  if (!rt) throw new Error("no refresh token saved")
  const t = await refreshAccessToken(rt)
  if (t.refresh_token) await saveRefreshToken(t.refresh_token)
  return t.access_token
}

// ---- Spotify Web API Wrapper (Basis) ----
async function spotifyGet<T = any>(url: string, accessToken: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (res.status === 204) return null // z.B. nothing currently playing
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`spotify GET ${res.status}: ${text || url}`)
  }
  return (await res.json()) as T
}

async function spotifyPut<T = any>(url: string, accessToken: string, body?: any): Promise<T | null> {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": body ? "application/json" : undefined as any,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`spotify PUT ${res.status}: ${text || url}`)
  }
  return (await res.json().catch(() => null)) as T | null
}

async function spotifyPost<T = any>(url: string, accessToken: string, body?: any): Promise<T | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": body ? "application/json" : undefined as any,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`spotify POST ${res.status}: ${text || url}`)
  }
  return (await res.json().catch(() => null)) as T | null
}

// ---- Exportierte High-Level-Funktionen ----

/** Aktuelle Wiedergabe holen. Liefert `null`, wenn nichts läuft. */
export async function currentPlayback(): Promise<{
  is_playing: boolean
  progress_ms: number
  item?: {
    id?: string
    uri?: string
    name?: string
    artists?: string
    duration_ms?: number
  }
  device?: { id?: string; name?: string; is_active?: boolean }
} | null> {
  const access = await getAccessToken()
  // „currently-playing“ ist präziser für den aktuellen Track; 204 wenn nichts läuft.
  const url = new URL("https://api.spotify.com/v1/me/player/currently-playing")
  url.searchParams.set("market", SPOTIFY_MARKET)
  const json = await spotifyGet<any>(url.toString(), access) // kann null sein

  if (!json) return null

  const item = json.item || {}
  const artists = Array.isArray(item.artists) ? item.artists.map((a: any) => a?.name).filter(Boolean).join(", ") : undefined
  return {
    is_playing: !!json.is_playing,
    progress_ms: typeof json.progress_ms === "number" ? json.progress_ms : 0,
    item: {
      id: item.id,
      uri: item.uri,
      name: item.name,
      artists,
      duration_ms: item.duration_ms,
    },
    device: json.device ? { id: json.device.id, name: json.device.name, is_active: json.device.is_active } : undefined,
  }
}

/** Verfügbare Geräte listen */
export async function listDevices(): Promise<Array<{ id: string; name: string; is_active: boolean }>> {
  const access = await getAccessToken()
  const data = await spotifyGet<any>("https://api.spotify.com/v1/me/player/devices", access)
  const devices = (data?.devices || []) as any[]
  return devices.map(d => ({ id: d.id, name: d.name, is_active: !!d.is_active })).filter(d => d.id)
}

/** Playback auf anderes Gerät übertragen */
export async function transferPlayback(deviceId: string) {
  const access = await getAccessToken()
  await spotifyPut("https://api.spotify.com/v1/me/player", access, {
    device_ids: [deviceId],
    play: true,
  })
  return { ok: true }
}

/** Play (start/resume). Optional: Track-URI(s) oder Kontext übergeben. */
export async function play(opts?: { uris?: string[]; context_uri?: string; position_ms?: number }) {
  const access = await getAccessToken()
  await spotifyPut("https://api.spotify.com/v1/me/player/play", access, opts || undefined)
  return { ok: true }
}

/** Pause */
export async function pause() {
  const access = await getAccessToken()
  await spotifyPut("https://api.spotify.com/v1/me/player/pause", access)
  return { ok: true }
}