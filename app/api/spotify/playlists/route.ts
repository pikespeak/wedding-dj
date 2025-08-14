// app/api/spotify/playlists/route.ts
import { NextResponse } from "next/server"
import { getUserPlaylists } from "@/lib/spotify"

export async function GET() {
  try {
    const j = await getUserPlaylists()
    const items = Array.isArray(j?.items)
      ? j.items.map((p: any) => ({ id: String(p.id), name: String(p.name) }))
      : []
    return NextResponse.json({ items })
  } catch (e: any) {
    const msg = String(e?.message || "")
    if (msg.includes("spotify_429")) {
      return NextResponse.json({ items: [], error: "rate_limited", retryAfter: 15 }, { status: 200 })
    }
    if (msg.includes("not_connected")) {
      return NextResponse.json({ items: [], error: "not_connected" }, { status: 200 })
    }
    return NextResponse.json({ items: [], error: msg || "failed" }, { status: 200 })
  }
}