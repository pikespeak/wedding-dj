import { NextResponse } from "next/server"
import { resolveWishWithAI } from "@/lib/dj"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any))
  const text = (body?.text || "").toString().trim()
  if (!text) return NextResponse.json({ error: "missing text" }, { status: 400 })

  try {
    const result = await resolveWishWithAI(text)
    // result = { spotify_id, title, artist, confidence, rationale? }
    if (!result?.spotify_id) {
      return NextResponse.json({ ok: false, reason: "no_match", result }, { status: 404 })
    }
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai_failed" }, { status: 500 })
  }
}