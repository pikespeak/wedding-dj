// lib/spotify.search.ts
import { getRefreshToken, refreshAccessToken, saveRefreshToken } from "@/lib/spotify"

/**
 * Unterstützt Eingaben wie:
 * - "abba dancing queen"
 * - "https://open.spotify.com/track/3a1lNhkSLSkpJE4MSHpDu9"
 * - "spotify:track:3a1lNhkSLSkpJE4MSHpDu9"
 */
function parseSpotifyTrackId(input: string): string | null {
  const s = input.trim()
  // URI
  const m1 = s.match(/^spotify:track:([A-Za-z0-9]+)$/i)
  if (m1) return m1[1]
  // URL
  const m2 = s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)(\?|$)/i)
  if (m2) return m2[1]
  return null
}

type TrackLite = {
  id: string        // Spotify URI oder ID (wir nehmen URI, wenn vorhanden)
  uri: string       // Spotify URI
  title: string
  artist: string
  year?: number
  popularity?: number
  album?: string
  image_url?: string | null
  preview_url?: string | null
}

/** Holt ein frisches Access Token (und speichert ggf. ein neues Refresh-Token). */
async function getAccessToken(): Promise<string> {
  const rt = await getRefreshToken()
  if (!rt) throw new Error("no refresh token saved")
  const t = await refreshAccessToken()
  if ((t as any)?.refresh_token) {
    await saveRefreshToken((t as any).refresh_token)
  }
  return (t as any).access_token as string
}

function market(): string {
  return process.env.SPOTIFY_MARKET || "DE"
}

/** Einmalige Fetch-Helfer mit 429-Retry (ein Versuch). */
async function spotifyGet<T = any>(url: string, accessToken: string): Promise<T> {
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (res.status === 429) {
    const ra = parseInt(res.headers.get("Retry-After") || "0", 10)
    if (ra > 0) {
      await new Promise((r) => setTimeout(r, ra * 1000))
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      })
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`spotify ${res.status}: ${text || url}`)
  }
  return (await res.json()) as T
}

/** Mappt Spotify Track Objekt auf unser TrackLite */
function mapTrack(item: any): TrackLite {
  const artists = Array.isArray(item?.artists) ? item.artists.map((a: any) => a?.name).filter(Boolean) : []
  const album = item?.album?.name ?? undefined
  const release = item?.album?.release_date as string | undefined
  let year: number | undefined = undefined
  if (release) {
    const y = parseInt(release.slice(0, 4), 10)
    if (!Number.isNaN(y)) year = y
  }
  const images = item?.album?.images ?? []
  const image_url = images?.[0]?.url ?? null

  const uri: string = item?.uri || (item?.id ? `spotify:track:${item.id}` : "")
  return {
    id: uri || item?.id,
    uri,
    title: item?.name ?? "Unknown",
    artist: artists.join(", "),
    year,
    popularity: typeof item?.popularity === "number" ? item.popularity : undefined,
    album,
    image_url,
    preview_url: item?.preview_url ?? null,
  }
}

/**
 * Suche Top-5 Kandidaten für eine Freitext-Anfrage oder eine direkte Spotify-Track-ID/URL/URI.
 * Gibt immer maximal 5 Ergebnisse zurück (0..5).
 */
export async function searchTop5(query: string): Promise<TrackLite[]> {
  const access = await getAccessToken()

  // Direkter Track?
  const direct = parseSpotifyTrackId(query)
  if (direct) {
    const url = new URL(`https://api.spotify.com/v1/tracks/${direct}`)
    url.searchParams.set("market", market())
    const json = await spotifyGet<any>(url.toString(), access)
    return [mapTrack(json)]
  }

  // Volltextsuche
  const url = new URL("https://api.spotify.com/v1/search")
  url.searchParams.set("q", query)
  url.searchParams.set("type", "track")
  url.searchParams.set("limit", "5")
  url.searchParams.set("market", market())

  const json = await spotifyGet<any>(url.toString(), access)
  const items: any[] = json?.tracks?.items || []
  return items.map(mapTrack)
}

/** Bequemer Top‑1 Wrapper (null wenn nichts gefunden) */
export async function searchTrack(query: string): Promise<TrackLite | null> {
  const items = await searchTop5(query)
  return items[0] ?? null
}