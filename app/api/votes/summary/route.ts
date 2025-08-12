// app/api/votes/summary/route.ts
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function GET() {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  // aktuellen Track holen
  const { data: np, error: npErr } = await supa
    .from("now_playing")
    .select("track_spotify_id")
    .eq("session_code", sessionCode())
    .single()

  if (npErr && npErr.code !== "PGRST116") {
    console.error("[votes.summary now_playing]", npErr)
    return NextResponse.json({ error: "now_playing select failed" }, { status: 500 })
  }

  if (!np) return NextResponse.json({ likes: 0, dislikes: 0, track_spotify_id: null })

  const trackId = np.track_spotify_id as string

  // Likes zählen
  const likeRes = await supa
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("session_code", sessionCode())
    .eq("track_spotify_id", trackId)
    .eq("value", 1)

  // Dislikes zählen
  const dislikeRes = await supa
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("session_code", sessionCode())
    .eq("track_spotify_id", trackId)
    .eq("value", -1)

  const likes = likeRes.count ?? 0
  const dislikes = dislikeRes.count ?? 0

  return NextResponse.json({ likes, dislikes, track_spotify_id: trackId })
}