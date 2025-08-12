import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const sessionCode = process.env.APP_SESSION_CODE || "GOCH-2026"
  const valueNum = Number(body?.value)

  if (![1, -1].includes(valueNum)) {
    return NextResponse.json({ error: "value must be +1 or -1" }, { status: 400 })
  }

  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "server supabase not configured" }, { status: 500 })

  // TODO: Später echten Track aus now_playing lesen.
  const trackId = "demo:now"

  const { data, error } = await supa
    .from("votes")
    .insert({ session_code: sessionCode, track_spotify_id: trackId, value: valueNum })
    .select()
    .single()

  if (error) {
    console.error("[votes.insert]", error)
    return NextResponse.json({ error: "insert vote failed" }, { status: 500 })
  }

  return NextResponse.json({ status: "ok", vote: data })
}