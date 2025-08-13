// lib/spotify.playlist.ts
// Nur TypeScript, KEIN JSX! Hilfsfunktionen für Spotify-Playlists.

import { getRefreshToken, refreshAccessToken, saveRefreshToken } from "@/lib/spotify"

/** interner Helper: Access Token holen (mit Refresh + optionalem Speichern eines neuen RT) */
async function getAccessTokenOrThrow(): Promise<string> {
  const rt = await getRefreshToken()
  if (!rt) throw new Error("not_connected")
  const t = await refreshAccessToken(rt)
  if ((t as any)?.refresh_token) {
    // falls Spotify einen neuen Refresh-Token liefert
    await saveRefreshToken((t as any).refresh_token)
  }
  const access = (t as any)?.access_token as string | undefined
  if (!access) throw new Error("no_access_token")
  return access
}

/**
 * Tracks zur Playlist hinzufügen.
 * Erwartet Spotify Track-URIs wie `spotify:track:...` (IDs werden automatisch zu URIs konvertiert).
 */
export async function addTracksToPlaylist(playlistId: string, uris: string[]) {
  if (!playlistId) throw new Error("missing_playlistId")
  const list = (uris || []).map((u) =>
    u?.startsWith("spotify:track:") ? u : `spotify:track:${u}`
  )
  if (list.length === 0) throw new Error("missing_track_uris")

  const access = await getAccessTokenOrThrow()

  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ uris: list }),
    }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`spotify_add_failed_${res.status}: ${text}`)
  }

  const json = await res.json().catch(() => ({} as any))
  return { ok: true, snapshot_id: json?.snapshot_id as string | undefined }
}

/**
 * (Optional) Tracks aus Playlist entfernen.
 */
export async function removeTracksFromPlaylist(playlistId: string, uris: string[]) {
  if (!playlistId) throw new Error("missing_playlistId")
  const list = (uris || []).map((u) =>
    u?.startsWith("spotify:track:") ? u : `spotify:track:${u}`
  )
  if (list.length === 0) throw new Error("missing_track_uris")

  const access = await getAccessTokenOrThrow()

  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${access}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tracks: list.map((uri) => ({ uri })),
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`spotify_remove_failed_${res.status}: ${text}`)
  }

  const json = await res.json().catch(() => ({} as any))
  return { ok: true, snapshot_id: json?.snapshot_id as string | undefined }
}