// app/api/spotify/playlist-tracks/route.ts
import { NextResponse } from "next/server"
import { getRefreshToken, refreshAccessToken, saveRefreshToken } from "@/lib/spotify"

/**
 * GET /api/spotify/playlist-tracks?playlistId=...
 * Optional: ?limit=100&offset=0 (Spotify-Pagination)
 * Antwort: { items: [{ id, uri, name, artists, duration_ms?, added_at? }], next?: string, prev?: string }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const playlistId = searchParams.get("playlistId") || ""
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")

    if (!playlistId) {
      return NextResponse.json({ items: [], error: "missing_playlistId" }, { status: 400 })
    }

    const rt = await getRefreshToken()
    if (!rt) {
      // 200 zurückgeben, damit die UI „Nicht verbunden“ anzeigen kann
      return NextResponse.json({ items: [], error: "not_connected" }, { status: 200 })
    }

    const t = await refreshAccessToken(rt)
    const access = (t as any).access_token as string
    if ((t as any)?.refresh_token) await saveRefreshToken((t as any).refresh_token)

    const url = new URL(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`)
    url.searchParams.set("limit", String(Math.min(Math.max(Number(limitParam || 100), 1), 100)))
    if (offsetParam) url.searchParams.set("offset", String(Math.max(Number(offsetParam), 0)))

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${access}` },
      cache: "no-store",
    })

    if (!res.ok) {
      // Fehler an die UI durchreichen, aber 200 halten, damit nichts crasht
      return NextResponse.json({ items: [], error: `spotify_${res.status}` }, { status: 200 })
    }

    const json = await res.json().catch(() => ({} as any))

    const items = (json?.items || []).map((it: any) => {
      const tr = it?.track ?? {}
      const artists = Array.isArray(tr.artists)
        ? tr.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
        : ""
      return {
        id: tr.id as string,
        uri: tr.uri as string,
        name: tr.name as string,
        artists,
        duration_ms: typeof tr.duration_ms === "number" ? tr.duration_ms : undefined,
        added_at: it?.added_at as string | undefined,
      }
    })

    // Optional: Spotify liefert next/previous-URLs für Pagination
    const next = json?.next || null
    const previous = json?.previous || null

    return NextResponse.json({ items, next, previous })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || "failed" }, { status: 200 })
  }
}