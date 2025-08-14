// lib/spotify.ts
import querystring from "querystring"
import { cookies } from "next/headers"

const CLIENT_ID =
  process.env.SPOTIFY_CLIENT_ID ||
  process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ||
  ""

const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || ""

// Scopes
export const scopes = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ")

// ---------- Cookies (Next 15: async cookies()) ----------
export async function saveRefreshToken(token: string) {
  const jar = await cookies()
  jar.set("spotify_refresh_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
  })
}
export async function getRefreshToken(): Promise<string | null> {
  const jar = await cookies()
  const c = jar.get("spotify_refresh_token")
  return c?.value ?? null
}

// ---------- OAuth ----------
export function getSpotifyAuthUrl(scopes: string[] = [], origin?: string, force = false) {
  const redirect = origin
    ? new URL("/api/spotify/callback", origin).toString()
    : (process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:3000/api/spotify/callback")

  const params = new URLSearchParams({
    response_type: "code",
    client_id: (process.env.SPOTIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "") as string,
    redirect_uri: redirect,
    scope: scopes.join(" "),
    state: "spotify-oauth",
  })
  if (force) {
    // erzwingt erneuten Consent-Dialog → Spotify liefert wieder refresh_token
    params.set("show_dialog", "true")
  }
  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  })
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`token_exchange_failed: ${res.status} ${text}`)
  }
  return res.json()
}

// Access‑Token über RT holen (keine Argumente mehr nötig)
export async function refreshAccessToken(): Promise<string | null> {
  const rt = await getRefreshToken()
  if (!rt) return null
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: querystring.stringify({ grant_type: "refresh_token", refresh_token: rt }),
  })
  if (!resp.ok) return null
  const j = await resp.json()
  if (j.refresh_token) await saveRefreshToken(j.refresh_token) // RT ggf. rotieren
  return j.access_token as string
}

async function getAccessTokenOrThrow(): Promise<string> {
  const t = await refreshAccessToken()
  if (!t) throw new Error("not_connected")
  return t
}

// ---------- Generic Spotify fetch ----------
async function spotifyFetch(endpoint: string, options?: RequestInit) {
  const accessToken = await getAccessTokenOrThrow()
  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://api.spotify.com/v1${endpoint}`

  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    cache: "no-store",
  })

  // Einige Endpunkte geben 204 ohne Body zurück (play/pause/next/transfer)
  if (resp.status === 204) return { ok: true }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    throw new Error(`spotify_${resp.status}: ${text}`)
  }
  return resp.json()
}

// ---------- Devices ----------
export async function listDevices() {
  return spotifyFetch("/me/player/devices")
}
export async function transferPlayback(deviceId: string, playNow = true) {
  return spotifyFetch("/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play: playNow }),
  })
}

// ---------- Player ----------
export async function play(
  opts?: string | { uris?: string[]; context_uri?: string; position_ms?: number }
) {
  let body: any = undefined
  if (typeof opts === "string") body = { uris: [opts] }
  else if (opts && (opts.uris || opts.context_uri || typeof opts?.position_ms === "number")) body = opts
  return spotifyFetch("/me/player/play", { method: "PUT", body: body ? JSON.stringify(body) : undefined })
}
export async function pause() {
  return spotifyFetch("/me/player/pause", { method: "PUT" })
}
export async function nextTrack() {
  return spotifyFetch("/me/player/next", { method: "POST" })
}
export { nextTrack as skipNext } // falls woanders skipNext importiert wird
export async function previousTrack() {
  return spotifyFetch("/me/player/previous", { method: "POST" })
}
export async function currentPlayback() {
  // Kann 204 liefern, dann werfen wir keinen Fehler, sondern null
  try {
    const resp = await spotifyFetch("/me/player/currently-playing")
    return resp ?? null
  } catch (e: any) {
    if (String(e?.message || "").includes("spotify_204")) return null
    throw e
  }
}

// ---------- Playlists ----------
export async function getUserPlaylists() {
  return spotifyFetch("/me/playlists?limit=50")
}
export async function getPlaylistTracks(playlistId: string) {
  return spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`)
}
export async function addTrackToPlaylist(playlistId: string, trackUri: string) {
  return spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
    method: "POST",
    body: JSON.stringify({ uris: [trackUri] }),
  })
}