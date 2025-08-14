// app/api/spotify/play/route.ts
import { NextResponse } from "next/server"
import { play } from "@/lib/spotify"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const opts =
      typeof body?.uri === "string"
        ? body.uri
        : {
            uris: Array.isArray(body?.uris) ? body.uris : undefined,
            context_uri: typeof body?.context_uri === "string" ? body.context_uri : undefined,
            position_ms: typeof body?.position_ms === "number" ? body.position_ms : undefined,
          }
    const r = await play(opts as any)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "play_failed" }, { status: 200 })
  }
}