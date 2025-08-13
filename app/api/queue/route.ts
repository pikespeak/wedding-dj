// app/api/queue/route.ts
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"
import { getRefreshToken, refreshAccessToken, saveRefreshToken } from "@/lib/spotify"

type QueueItem = {
  id: string
  title: string
  artist: string
  uri?: string
  duration_ms?: number
  source: "playlist" | "db"
}

// --- Hilfsfunktion: Playlist-Titel holen (aus persistierter Auswahl) ---
async function fetchPlaylistItemsFromSpotify(): Promise<QueueItem[] | null> {
  const supa = getAdminSupabase()
  if (!supa) return null

  // persistierte Auswahl lesen
  const sel = await supa
    .from("settings")
    .select("value")
    .eq("session_code", sessionCode())
    .eq("key", "selected_playlist")
    .single()

  const playlistId = (sel.data?.value as any)?.id || ""
  if (!playlistId) return null

  // Spotify Access holen
  const rt = await getRefreshToken()
  if (!rt) return null
  const t = await refreshAccessToken(rt)
  if ((t as any)?.refresh_token) await saveRefreshToken((t as any).refresh_token)
  const access = (t as any).access_token as string

  // Tracks abrufen (erste 100 reichen hier)
  const url = new URL(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`)
  url.searchParams.set("limit", "100")

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  })
  if (!res.ok) return null

  const json = await res.json().catch(() => ({} as any))
  const items: QueueItem[] = (json?.items || []).map((it: any) => {
    const tr = it?.track ?? {}
    const artists = Array.isArray(tr.artists)
      ? tr.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
      : ""
    return {
      id: tr.id as string,
      title: tr.name as string,
      artist: artists,
      uri: tr.uri as string | undefined,
      duration_ms: typeof tr.duration_ms === "number" ? tr.duration_ms : undefined,
      source: "playlist" as const,
    }
  })

  return items
}

// --- Fallback: bisherige DB-Queue (falls vorhanden) ---
async function fetchQueueFromDb(): Promise<QueueItem[]> {
  const supa = getAdminSupabase()
  if (!supa) return []

  // Versuche eine generische Queue-Struktur
  const { data, error } = await supa
    .from("queue")
    .select("*")
    .eq("session_code", sessionCode())
    .order("position", { ascending: true })
    .limit(100)

  if (error || !Array.isArray(data)) return []

  return data.map((q: any) => ({
    id: String(q.id),
    title: q.title || q.name || q.text || "",
    artist: q.artist || "",
    uri: q.spotify_uri || q.spotify_track_id || undefined,
    duration_ms: q.duration_ms || undefined,
    source: "db" as const,
  }))
}

export async function GET() {
  try {
    // 1) Bevorzugt: Playlist-Inhalt
    const fromPlaylist = await fetchPlaylistItemsFromSpotify()
    if (fromPlaylist && fromPlaylist.length) {
      return NextResponse.json({ items: fromPlaylist })
    }

    // 2) Fallback: alte Queue aus DB
    const fromDb = await fetchQueueFromDb()
    return NextResponse.json({ items: fromDb })
  } catch (e: any) {
    // Bei Fehler: leere Liste zurückgeben (Frontend bleibt stabil)
    return NextResponse.json({ items: [], error: e?.message || "failed" }, { status: 200 })
  }
}