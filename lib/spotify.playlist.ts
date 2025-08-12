// lib/spotify.playlist.ts
import { getAccessToken } from "@/lib/spotify"

export async function addTracksToPlaylist(playlistId: string, uris: string[]) {
  const token = await getAccessToken()
  if (!token) throw new Error("Kein Spotify Access Token verfügbar")

  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Spotify Playlist-Update fehlgeschlagen: ${res.status} ${text}`)
  }

  return res.json()
}

// app/api/admin/requests/resolve/route.ts
// (only snippet shown with added code after queue insert)

  // Optional: direkt in ausgewählte Playlist hinzufügen (wenn im Admin übermittelt)
  const playlistId = body?.playlistId as string | undefined
  if (playlistId && spotifyId) {
    try {
      const { addTracksToPlaylist } = await import("@/lib/spotify.playlist")
      const uri = spotifyId.startsWith("spotify:track:") ? spotifyId : `spotify:track:${spotifyId}`
      await addTracksToPlaylist(playlistId, [uri])
    } catch (e) {
      console.warn("[playlist] add on resolve failed", (e as any)?.message)
    }
  }

// app/page.tsx
import { useState, useEffect, useCallback } from "react"

type UiPlaylist = { id: string; name: string }
const [playlists, setPlaylists] = useState<UiPlaylist[]>([])
const [selectedPlaylist, setSelectedPlaylist] = useState<string>("")
const [plLoading, setPlLoading] = useState(false)

const fetchPlaylists = useCallback(async () => {
  try {
    setPlLoading(true)
    const res = await fetch("/api/spotify/playlists", { cache: "no-store" })
    const j = await res.json().catch(() => ({}))
    if (res.ok && Array.isArray(j.items)) {
      setPlaylists(j.items as UiPlaylist[])
    }
  } catch (e) {
    console.warn("[spotify] playlists", e)
  } finally {
    setPlLoading(false)
  }
}, [])

useEffect(() => {
  if (isAdmin && adminOpen) {
    fetchPlaylists()
  }
}, [isAdmin, adminOpen, fetchPlaylists])

// ... inside Admin drawer UI, just above the pending requests list:

<div className="mt-5">
  <div className="mb-1 text-sm text-zinc-300">Ziel‑Playlist</div>
  <div className="flex items-center gap-2">
    <select
      value={selectedPlaylist}
      onChange={(e) => setSelectedPlaylist(e.target.value)}
      className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
    >
      <option value="">— Keine —</option>
      {playlists.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
    <button
      onClick={fetchPlaylists}
      disabled={plLoading}
      className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
    >
      {plLoading ? "Lädt…" : "Aktualisieren"}
    </button>
  </div>
  <p className="mt-1 text-xs text-zinc-500">Wenn gesetzt, werden genehmigte Wünsche beim Übernehmen in diese Playlist hinzugefügt.</p>
</div>

// ... inside the handler for "Übernehmen" button in the pending requests list, replace fetch call with:

fetch("/api/admin/requests/resolve", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: w.id, query: w.text, playlistId: selectedPlaylist || undefined }),
})

// app/api/spotify/playlists/route.ts
import { NextResponse } from "next/server"
import { getRefreshToken, refreshAccessToken, saveRefreshToken } from "@/lib/spotify"

export async function GET() {
  try {
    const rt = await getRefreshToken()
    if (!rt) return NextResponse.json({ items: [], error: "not_connected" }, { status: 200 })
    const t = await refreshAccessToken(rt)
    if ((t as any)?.refresh_token) await saveRefreshToken((t as any).refresh_token)

    const url = new URL("https://api.spotify.com/v1/me/playlists")
    url.searchParams.set("limit", "50")

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${(t as any).access_token}` },
      cache: "no-store",
    })
    if (!res.ok) return NextResponse.json({ items: [], error: `spotify_${res.status}` }, { status: 200 })
    const json = await res.json()

    const items = (json?.items || []).map((p: any) => ({ id: p.id, name: p.name }))
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || "failed" }, { status: 200 })
  }
}