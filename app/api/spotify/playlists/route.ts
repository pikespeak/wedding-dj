// app/api/spotify/playlists/route.ts
import { NextResponse } from "next/server"
import { getRefreshToken, refreshAccessToken, saveRefreshToken } from "@/lib/spotify"

export async function GET() {
  try {
    // Refresh Token aus deiner DB/Speicher holen
    const rt = await getRefreshToken()
    if (!rt) {
      return NextResponse.json({ items: [], error: "not_connected" }, { status: 200 })
    }

    // Access Token erneuern
    const tokenData = await refreshAccessToken(rt)
    const accessToken = tokenData.access_token as string
    if (tokenData.refresh_token) {
      await saveRefreshToken(tokenData.refresh_token)
    }

    // Playlists abrufen
    const url = new URL("https://api.spotify.com/v1/me/playlists")
    url.searchParams.set("limit", "50")

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json({ items: [], error: `spotify_${res.status}` }, { status: 200 })
    }

    const data = await res.json()
    const items = (data.items || []).map((p: any) => ({
      id: p.id,
      name: p.name,
    }))

    return NextResponse.json({ items })
  } catch (err: any) {
    return NextResponse.json({ items: [], error: err?.message || "unknown_error" }, { status: 200 })
  }
}