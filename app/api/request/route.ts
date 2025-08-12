import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const sessionCode = process.env.APP_SESSION_CODE || "GOCH-2026"
  const spotifyId = String(body?.spotifyId || "").trim()
  const note = (body?.note ?? "").toString().slice(0, 200)

  if (!spotifyId) {
    return NextResponse.json({ error: "spotifyId required" }, { status: 400 })
  }

  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "server supabase not configured" }, { status: 500 })

  // 1) Request ablegen
  const { data: reqRow, error: errReq } = await supa
    .from("requests")
    .insert({ session_code: sessionCode, spotify_id: spotifyId, note })
    .select()
    .single()

  if (errReq) {
    console.error("[request.insert]", errReq)
    return NextResponse.json({ error: "insert request failed" }, { status: 500 })
  }

  // 2) Für MVP direkt in die Queue hängen (ohne Metadaten/Scoring)
  const { data: qRow, error: errQ } = await supa
    .from("queue")
    .insert({ session_code: sessionCode, spotify_id: spotifyId, title: null, artist: null, score: 0, reason: "guest request" })
    .select()
    .single()

  if (errQ) {
    console.error("[queue.insert]", errQ)
    // nicht fatal — request ist trotzdem gespeichert
  }

  return NextResponse.json({ status: "queued", request: reqRow, queue: qRow }, { status: 201 })
}