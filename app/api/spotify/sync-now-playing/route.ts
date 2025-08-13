// app/api/spotify/sync-now-playing/route.ts
import { NextResponse } from "next/server"
import { currentPlayback } from "@/lib/spotify"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function POST() {
  try {
    // 1) Aktuelle Wiedergabe von Spotify holen (normalisiert)
    const now = await currentPlayback() // kann auch null sein, wenn nichts läuft

    // 2) Felder robust ableiten
    let trackId: string | null = null
    let title: string | null = null
    let artist: string | null = null
    let startedAt: Date | null = null
    let endsAt: Date | null = null

    if (now && now.item) {
      // spotify:track:... oder reine ID
      const idRaw = now.item.uri || now.item.id
      trackId = typeof idRaw === "string" && idRaw.length > 0 ? idRaw : null

      title = typeof now.item.name === "string" ? now.item.name : null

      // artists als String; falls dein currentPlayback Künstler schon joined liefert
      if (typeof now.item.artists === "string") {
        artist = now.item.artists
      } else if (Array.isArray((now.item as any).artists)) {
        const arr = (now.item as any).artists as Array<{ name?: string }>
        artist = arr.map((a) => a?.name).filter(Boolean).join(", ") || null
      } else {
        artist = null
      }

      const durationMs = typeof now.item.duration_ms === "number" ? now.item.duration_ms : undefined
      const progressMs = typeof now.progress_ms === "number" ? now.progress_ms : 0
      const nowMs = Date.now()

      if (durationMs && durationMs > 0) {
        startedAt = new Date(nowMs - Math.max(0, progressMs))
        endsAt = new Date(startedAt.getTime() + durationMs)
      }
    }

    // 3) In Supabase persistieren
    const supa = getAdminSupabase()
    if (!supa) {
      return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 500 })
    }

    // Wenn nichts läuft, schreibe leeren Eintrag (oder lass bestehen – hier: wir leeren Felder)
    const payload = {
      session_code: sessionCode(),
      track_spotify_id: trackId,
      title,
      artist,
      started_at: startedAt ? startedAt.toISOString() : null,
      ends_at: endsAt ? endsAt.toISOString() : null,
      // optional noch is_playing?
      // is_playing: now ? !!now.is_playing : false,
    }

    // Upsert auf die Session – passe onConflict an deinen Table-Index an
    const { error } = await supa
      .from("now_playing")
      .upsert(payload, { onConflict: "session_code" })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, track_spotify_id: trackId })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "sync_failed" },
      { status: 200 } // weich bleiben, damit der Leader-Loop nicht abbricht
    )
  }
}