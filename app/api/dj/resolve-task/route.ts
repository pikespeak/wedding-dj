import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { resolveWishWithAI } from "@/lib/dj"

export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 })

  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  // Wunsch laden
  const wish = await supa.from("requests").select("id, text").eq("id", id).single()
  if (wish.error) return NextResponse.json({ error: wish.error.message }, { status: 500 })
  const text = (wish.data as any)?.text || ""

  // AI-Resolver
  const res = await resolveWishWithAI(text).catch((e) => {
    return { error: e?.message || "ai_failed" }
  })

  // Ergebnis wegspeichern (auch bei no_match nur Felder aktualisieren; status bleibt 'pending')
  if (res && !("error" in res) && res.spotify_id) {
    await supa
      .from("requests")
      .update({
        spotify_track_id: res.spotify_id,
        title: res.title,
        artist: res.artist,
        ai_confidence: typeof res.confidence === "number" ? res.confidence : null,
        ai_rationale: res.rationale || null,
      })
      .eq("id", id)
  } else {
    await supa
      .from("requests")
      .update({
        ai_confidence: null,
        ai_rationale: (res as any)?.error || "no_match",
      })
      .eq("id", id)
  }

  return NextResponse.json({ ok: true })
}