import { NextResponse } from "next/server"
import { getRefreshToken, refreshAccessToken, saveRefreshToken } from "@/lib/spotify"

export async function GET() {
  try {
    const rt = await getRefreshToken()
    if (!rt) {
      // Nicht verbunden, aber 200 liefern, damit die UI nicht crasht
      return NextResponse.json({ items: [], error: "not_connected" }, { status: 200 })
    }
    const t = await refreshAccessToken(rt)
    if ((t as any)?.refresh_token) await saveRefreshToken((t as any).refresh_token)

    const url = new URL("https://api.spotify.com/v1/me/playlists")
    url.searchParams.set("limit", "50")

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${(t as any).access_token}` },
      cache: "no-store",
    })
    if (!res.ok) {
      return NextResponse.json({ items: [], error: `spotify_${res.status}` }, { status: 200 })
    }
    const json = await res.json()
    const items = (json?.items || []).map((p: any) => ({ id: p.id, name: p.name }))
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || "failed" }, { status: 200 })
  }
}