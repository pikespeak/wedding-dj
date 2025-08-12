import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function POST() {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  // 1) nächsten Queue-Eintrag holen
  const { data: qItems, error: qErr } = await supa
    .from("queue")
    .select("id, spotify_id, title, artist, created_at")
    .eq("session_code", sessionCode())
    .order("created_at", { ascending: true })
    .limit(1)

  if (qErr) {
    console.error("[queue.select first]", qErr)
    return NextResponse.json({ error: "queue select failed" }, { status: 500 })
  }

  const next = qItems?.[0]
  if (!next) {
    // Falls leer: NowPlaying beenden
    await supa.from("now_playing").delete().eq("session_code", sessionCode())
    return NextResponse.json({ ok: true, now_playing: null, note: "queue empty" })
  }

  // 2) NowPlaying setzen (simulierte Dauer)
  const durationMs = 200_000 // 3:20
  const started = new Date()
  const ends = new Date(started.getTime() + durationMs)

  const up = await supa
    .from("now_playing")
    .upsert({
      session_code: sessionCode(),
      track_spotify_id: next.spotify_id,
      title: next.title ?? null,
      artist: next.artist ?? null,
      started_at: started.toISOString(),
      ends_at: ends.toISOString(),
    })
    .select()
    .single()

  if (up.error) {
    console.error("[now_playing.upsert]", up.error)
    return NextResponse.json({ error: "now_playing upsert failed" }, { status: 500 })
  }

  // 3) den verwendeten Queue-Eintrag löschen
  const del = await supa.from("queue").delete().eq("id", next.id)
  if (del.error) {
    console.error("[queue.delete used item]", del.error)
  }

  return NextResponse.json({ ok: true, now_playing: up.data })
}