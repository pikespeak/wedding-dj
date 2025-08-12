import { NextResponse } from "next/server"
import { currentPlayback } from "@/lib/spotify"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function POST() {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const playback = await currentPlayback().catch((e: any) => {
    return { error: e?.message || "current_failed" }
  })
  if ((playback as any)?.error) {
    return NextResponse.json(playback, { status: 500 })
  }

  if (!playback || !playback.item) {
    // nothing playing — clear now_playing for this session
    await supa.from("now_playing").delete().eq("session_code", sessionCode())
    return NextResponse.json({ ok: true, now_playing: null })
  }

  const item = playback.item
  const progressMs: number = playback.progress_ms ?? 0
  const durationMs: number = item.duration_ms ?? 0
  const endsIn = Math.max(0, durationMs - progressMs)

  const startedAt = new Date(Date.now() - progressMs)
  const endsAt = new Date(Date.now() + endsIn)

  const up = await supa
    .from("now_playing")
    .upsert({
      session_code: sessionCode(),
      track_spotify_id: item.uri || item.id || item.external_ids?.isrc || "spotify:track:unknown",
      title: item.name ?? null,
      artist: (item.artists?.map((a: any) => a.name).join(", ") ?? null) as string | null,
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .select()
    .single()

  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })
  return NextResponse.json({ ok: true, now_playing: up.data })
}