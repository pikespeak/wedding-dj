import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"

export async function GET() {
  const sessionCode = process.env.APP_SESSION_CODE || "GOCH-2026"
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "server supabase not configured" }, { status: 500 })

  const { data, error } = await supa
    .from("queue")
    .select("spotify_id, title, artist, score, reason, created_at")
    .eq("session_code", sessionCode)
    .order("created_at", { ascending: true })
    .limit(10)

  if (error) {
    console.error("[queue.select]", error)
    return NextResponse.json({ error: "select queue failed" }, { status: 500 })
  }

  return NextResponse.json(
    (data || []).map((r) => ({
      spotifyId: r.spotify_id,
      title: r.title,
      artist: r.artist,
      score: r.score ?? 0,
      reason: r.reason ?? undefined,
      created_at: r.created_at,
    }))
  )
}