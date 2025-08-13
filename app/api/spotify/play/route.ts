// app/api/spotify/play/route.ts
import { NextResponse } from "next/server"
import { play } from "@/lib/spotify"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    // Optional: uris/context_uri/position_ms erlauben
    const opts = {
      uris: Array.isArray(body?.uris) ? body.uris : undefined,
      context_uri: typeof body?.context_uri === "string" ? body.context_uri : undefined,
      position_ms: typeof body?.position_ms === "number" ? body.position_ms : undefined,
    }
    const res = await play(opts)
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "play_failed" }, { status: 200 })
  }
}