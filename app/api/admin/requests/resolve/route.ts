// app/api/admin/requests/resolve/route.ts
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"
import { addTracksToPlaylist } from "@/lib/spotify.playlist"

export async function POST(req: Request) {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 500 })

  const body = await req.json().catch(() => ({} as any))
  const id = String(body?.id || "")
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 })

  // 1) Wunsch laden (inkl. AI-Ergebnis)
  const { data: wish, error: e1 } = await supa
    .from("requests")
    .select("id, text, title, artist, spotify_track_id, status")
    .eq("session_code", sessionCode())
    .eq("id", id)
    .single()
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 })

  // 2) Playlist bestimmen: Body > settings
  let playlistId: string | undefined = typeof body?.playlistId === "string" && body.playlistId ? body.playlistId : undefined
  if (!playlistId) {
    const s = await supa
      .from("settings")
      .select("value")
      .eq("session_code", sessionCode())
      .eq("key", "selected_playlist")
      .single()
    if (!s.error) playlistId = (s.data?.value as any)?.id || undefined
  }

  // 3) (Dein bestehender Logikteil:) Wunsch als „resolved/approved“ markieren, ggf. in deine interne Queue schreiben, etc.
  //    Beispiel (passe an dein Schema an):
  await supa.from("requests").update({ status: "approved" }).eq("id", id).eq("session_code", sessionCode())

  // 4) Optional in Spotify-Playlist hinzufügen, wenn Playlist vorhanden und Track erkannt
  if (playlistId && (wish?.spotify_track_id || wish?.title || wish?.artist)) {
    try {
      // Bevorzugt: exakte Track-ID
      let uri: string | null = null
      if (wish?.spotify_track_id) {
        uri = wish.spotify_track_id.startsWith("spotify:track:")
          ? wish.spotify_track_id
          : `spotify:track:${wish.spotify_track_id}`
      }

      // (Optionaler Fallback:) Wenn keine ID da, könntest du hier eine Suche nach Titel/Artist einbauen
      // z.B. via lib/spotify.search.ts -> searchTop5(`${wish.title} ${wish.artist}`) und bestes Ergebnis nehmen.
      // if (!uri && wish?.title) { ... set uri = 'spotify:track:...' }

      if (uri) {
        await addTracksToPlaylist(playlistId, [uri])
      }
    } catch (e: any) {
      // Nicht hart fehlschlagen lassen – UI soll weiterlaufen
      console.warn("[playlist] add failed:", e?.message)
    }
  }

  return NextResponse.json({ ok: true })
}