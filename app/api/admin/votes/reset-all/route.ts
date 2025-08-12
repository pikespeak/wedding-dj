import { useCallback, useRef } from "react"
import { getSupabase } from "@/lib/supabase.client"
import { sessionCode } from "@/lib/appConfig"

export default function Page() {
  // other refs like lastTrackIdRef
  const suppressUntilRef = useRef<number>(0)

  const fetchVotesSummary = useCallback(async () => {
    try {
      // Unterdrücke kurz nach lokalen Votes, um "0"-Flackern zu vermeiden
      if (Date.now() < suppressUntilRef.current) return

      const supa = getSupabase()
      if (!supa) return

      const trackId = now?.track_spotify_id
      if (!trackId) return

      const base = supa
        .from("votes")
        .select("id", { count: "exact", head: true })
        .eq("session_code", sessionCode())
        .eq("track_spotify_id", trackId)

      const [likeRes, dislikeRes] = await Promise.all([
        base.eq("value", 1),
        base.eq("value", -1),
      ])

      const likeCount = likeRes.count ?? 0
      const dislikeCount = dislikeRes.count ?? 0

      // Niemals niedriger als der aktuell sichtbare (optimistische) Wert setzen
      setLikes((prev) => (likeCount < prev ? prev : likeCount))
      setDislikes((prev) => (dislikeCount < prev ? prev : dislikeCount))
    } catch (e) {
      console.warn("[votes] summary failed", e)
    }
  }, [now])

  async function vote(value: 1 | -1) {
    if (!now?.track_spotify_id) return
    const trackId = now.track_spotify_id

    setLikeBusy(value === 1 ? "up" : "down")
    let rollback: (() => void) | null = null
    try {
      // Optimistisches Update
      if (value === 1) {
        setLikes((n) => { rollback = () => setLikes(n); return n + 1 })
      } else {
        setDislikes((n) => { rollback = () => setDislikes(n); return n + 1 })
      }

      // Für 1 Sekunde keine externen Refreshes übernehmen
      suppressUntilRef.current = Date.now() + 1000

      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value, trackId }),
      })

      if (!res.ok) {
        if (rollback) rollback()
        console.error("Vote fehlgeschlagen", await res.text().catch(() => ""))
      } else {
        // Nach kurzer Zeit die echten Werte holen
        setTimeout(() => {
          // Nachlaufende Suppression – falls mehrere Klicks kurz hintereinander
          if (Date.now() < suppressUntilRef.current) return
          fetchVotesSummary()
        }, 250)
      }
    } finally {
      setLikeBusy(null)
    }
  }

  // rest of the component
}