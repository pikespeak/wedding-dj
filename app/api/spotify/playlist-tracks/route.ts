// app/api/spotify/playlist-tracks/route.ts
import { NextResponse } from "next/server"
import { getPlaylistTracks } from "@/lib/spotify"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    let playlistId = url.searchParams.get("playlistId") || ""

    if (!playlistId) {
      const supa = getAdminSupabase()
      if (!supa) return NextResponse.json({ items: [], error: "supabase not configured" }, { status: 500 })
      const { data } = await supa
        .from("settings")
        .select("value")
        .eq("session_code", sessionCode())
        .eq("key", "selected_playlist")
        .single()
      playlistId = (data?.value as any)?.id || ""
    }

    if (!playlistId) return NextResponse.json({ items: [], error: "missing_playlistId" }, { status: 200 })

    const j = await getPlaylistTracks(playlistId)
    const items = Array.isArray(j?.items)
      ? j.items.map((it: any) => {
          const t = it.track || it
          return {
            id: t.uri || t.id,
            title: t.name,
            artist: Array.isArray(t.artists) ? t.artists.map((a: any) => a.name).join(", ") : "",
            duration_ms: t.duration_ms,
          }
        })
      : []
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || "failed" }, { status: 200 })
  }
}