import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { value?: number; trackId?: string }
  const value = body?.value
  let trackId: string | undefined = body?.trackId

  if (value !== 1 && value !== -1) {
    return NextResponse.json({ error: "invalid vote value" }, { status: 400 })
  }

  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  // Falls keine Track-ID mitkam: aus now_playing lesen
  if (!trackId) {
    const np = await supa
      .from("now_playing")
      .select("track_spotify_id")
      .eq("session_code", sessionCode())
      .single()
    if (np.error) return NextResponse.json({ error: np.error.message }, { status: 500 })
    trackId = (np.data as any)?.track_spotify_id
  }

  if (!trackId) {
    return NextResponse.json({ error: "no active track" }, { status: 400 })
  }

  const ins = await supa.from("votes").insert({
    session_code: sessionCode(),
    track_spotify_id: trackId,
    value,
  })

  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}