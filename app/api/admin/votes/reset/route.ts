import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function POST(req: Request) {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const body = (await req.json().catch(() => ({}))) as { trackId?: string }
  let trackId = body?.trackId

  // Falls keine Track-ID mitkommt: aktuelle aus now_playing ermitteln
  if (!trackId) {
    const np = await supa
      .from("now_playing")
      .select("track_spotify_id")
      .eq("session_code", sessionCode())
      .single()
    if (np.error) return NextResponse.json({ error: np.error.message }, { status: 500 })
    trackId = (np.data as any)?.track_spotify_id
  }

  if (!trackId) return NextResponse.json({ error: "no active track" }, { status: 400 })

  const del = await supa
    .from("votes")
    .delete()
    .eq("session_code", sessionCode())
    .eq("track_spotify_id", trackId)

  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 })
  return NextResponse.json({ ok: true, trackId })
}