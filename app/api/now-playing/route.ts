import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function GET() {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const { data, error } = await supa
    .from("now_playing")
    .select("*")
    .eq("session_code", sessionCode())
    .single()

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found
    console.error("[now_playing.select]", error)
    return NextResponse.json({ error: "select failed" }, { status: 500 })
  }

  if (!data) return NextResponse.json(null)

  const remaining_ms =
    data.ends_at && new Date(data.ends_at).getTime() > Date.now()
      ? new Date(data.ends_at).getTime() - Date.now()
      : 0

  return NextResponse.json({
    track_spotify_id: data.track_spotify_id,
    title: data.title,
    artist: data.artist,
    started_at: data.started_at,
    ends_at: data.ends_at,
    remaining_ms,
  })
}

export async function POST(req: Request) {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })
  const body = await req.json().catch(() => ({}))

  const durationMs = Number(body?.durationMs ?? 180_000)
  const started = new Date()
  const ends = new Date(started.getTime() + durationMs)

  const { data, error } = await supa
    .from("now_playing")
    .upsert({
      session_code: sessionCode(),
      track_spotify_id: String(body?.spotifyId || "demo:manual"),
      title: body?.title ?? null,
      artist: body?.artist ?? null,
      started_at: started.toISOString(),
      ends_at: ends.toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error("[now_playing.upsert]", error)
    return NextResponse.json({ error: "upsert failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, now_playing: data })
}