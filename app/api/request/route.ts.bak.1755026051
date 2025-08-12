import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const spotifyId = String(body?.spotifyId || "").trim()
  const note = (body?.note ?? "").toString().slice(0, 200)

  if (!spotifyId) {
    return NextResponse.json({ error: "spotifyId required" }, { status: 400 })
  }
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  // 0) Existiert schon in Queue?
  const { data: exists, error: exErr } = await supa
    .from("queue")
    .select("id")
    .eq("session_code", sessionCode())
    .eq("spotify_id", spotifyId)
    .limit(1)

  if (exErr) {
    console.error("[queue.exists]", exErr)
    return NextResponse.json({ error: "queue check failed" }, { status: 500 })
  }
  if (exists && exists.length > 0) {
    return NextResponse.json({ status: "duplicate_ignored", spotifyId }, { status: 200 })
  }

  // 1) Request speichern
  const reqIns = await supa
    .from("requests")
    .insert({ session_code: sessionCode(), spotify_id: spotifyId, note })
    .select()
    .single()

  if (reqIns.error) {
    console.error("[request.insert]", reqIns.error)
    return NextResponse.json({ error: "insert request failed" }, { status: 500 })
  }

  // 2) In Queue hängen
  const qIns = await supa
    .from("queue")
    .insert({
      session_code: sessionCode(),
      spotify_id: spotifyId,
      title: null,
      artist: null,
      score: 0,
      reason: "guest request",
    })
    .select()
    .single()

  if (qIns.error) {
    console.error("[queue.insert]", qIns.error)
    // nicht fatal – request existiert
  }

  return NextResponse.json({ status: "queued", request: reqIns.data, queue: qIns.data }, { status: 201 })
}