import { refreshAccessToken, getRefreshToken, saveRefreshToken } from "@/lib/spotify"

export async function searchTrack(query: string): Promise<{ id: string; title: string; artist: string } | null> {
  const rt = await getRefreshToken()
  if (!rt) throw new Error("no refresh token saved")
  const t = await refreshAccessToken(rt)
  if (t.refresh_token) await saveRefreshToken(t.refresh_token)

  const url = new URL("https://api.spotify.com/v1/search")
  url.searchParams.set("q", query)
  url.searchParams.set("type", "track")
  url.searchParams.set("limit", "5")
  url.searchParams.set("market", "DE")

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${t.access_token}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`spotify search ${res.status}`)
  const json = await res.json()
  const item = json?.tracks?.items?.[0]
  if (!item) return null
  return { id: item.uri || item.id, title: item.name, artist: (item.artists || []).map((a: any) => a.name).join(", ") }
}
