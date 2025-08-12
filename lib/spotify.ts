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

export async function currentPlayback() {
  // /v1/me/player liefert 204, wenn nichts läuft
  try {
    // wir nutzen spotifyFetch; es gibt bei 204 ein leeres Objekt zurück ({}).
    const data = await spotifyFetch<any>("/me/player", { method: "GET" })
    if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
      return null
    }
    return data
  } catch (e) {
    throw e
  }
}