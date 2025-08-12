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
