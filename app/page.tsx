"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { subscribeTable } from "@/lib/realtime"
import { sessionCode } from "@/lib/appConfig"
import { getSupabase } from "@/lib/supabase"

// Types for UI data
type QueueItem = {
  spotifyId: string
  title?: string
  artist?: string
  score?: number
  reason?: string
}

type NowPlaying = {
  track_spotify_id: string
  title: string
  artist: string
  started_at: string
  ends_at: string
  remaining_ms: number
}

// kleines Debounce, um Realtime-Bursts zu glätten
function debounce<T extends (...args: any[]) => any>(fn: T, delay = 250) {
  let t: any
  return (...args: Parameters<T>) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), delay)
  }
}

export default function Page() {
  const clientIdRef = useRef<string>(Math.random().toString(36).slice(2))
  const [now, setNow] = useState<NowPlaying | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [queueUpdatedAt, setQueueUpdatedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const [wish, setWish] = useState("")
  const [likeBusy, setLikeBusy] = useState<null | "up" | "down">(null)
  const [likes, setLikes] = useState(0)
  const [dislikes, setDislikes] = useState(0)
  // Remember last Track-ID to detect real track changes
  const lastTrackIdRef = useRef<string | null>(null)
  // Throttle fürs Laden der Playlist-Tracks über /api/queue
  const selectedPlaylistRef = useRef<string>("")
  const lastPlaylistFetchRef = useRef<number>(0)
  // Rollback-Ref für optimistisches Voting
  const voteRollbackRef = useRef<null | (() => void)>(null)

  // Admin state
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminPin, setAdminPin] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [deviceId, setDeviceId] = useState("device-demo-1")

  // Admin UI types and state
  type UiPlaylist = { id: string; name: string }
  type WishItem = { id: string; text: string; guest_name?: string | null; created_at: string; title?: string | null; artist?: string | null; ai_confidence?: number | null }

  const [playlists, setPlaylists] = useState<UiPlaylist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("")
  useEffect(() => {
    selectedPlaylistRef.current = selectedPlaylist
  }, [selectedPlaylist])
  const [plLoading, setPlLoading] = useState(false)
  const [playlistsError, setPlaylistsError] = useState<string | null>(null)
  const [plCooldown, setPlCooldown] = useState(0)
  
  const [pending, setPending] = useState<WishItem[]>([])
  const [pendingBusy, setPendingBusy] = useState<string | null>(null)
  const fetchPlaylists = useCallback(async () => {
    try {
      setPlLoading(true)
      setPlaylistsError(null)
      const res = await fetch("/api/spotify/playlists", { cache: "no-store" })
      const j = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(j.items)) {
        const items = j.items as UiPlaylist[]
        setPlaylists(items)
        if (j.error) setPlaylistsError(String(j.error))
        if (j.error === "rate_limited") {
          const ra = Number(j.retryAfter || 15)
          const sec = Math.min(30, Math.max(10, Math.floor(ra)))
          setPlCooldown(sec)
        }
        // Falls die bisher ausgewählte Playlist nicht mehr existiert, sauber leeren
        setSelectedPlaylist((prev) => (prev && !items.some((p) => p.id === prev) ? "" : prev))
      } else {
        setPlaylists([])
        setPlaylistsError(j?.error ? String(j.error) : "failed")
        if (j?.error === "rate_limited") {
          const ra = Number(j.retryAfter || 15)
          const sec = Math.min(30, Math.max(10, Math.floor(ra)))
          setPlCooldown(sec)
        }
      }
    } catch (e: any) {
      console.warn("[spotify] playlists", e)
      setPlaylists([])
      setPlaylistsError(e?.message || "failed")
    } finally {
      setPlLoading(false)
    }
  }, [])
  useEffect(() => {
    if (plCooldown <= 0) return
    const t = setInterval(() => {
      setPlCooldown((s) => (s > 1 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(t)
  }, [plCooldown])

  useEffect(() => {
  if (!queueUpdatedAt) return
  const t = setInterval(() => {
    // re-render nur fürs Label – keine API-Calls
    setQueueUpdatedAt((v) => v)
  }, 1000)
  return () => clearInterval(t)
  }, [queueUpdatedAt])

  const fetchPendingRequests = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/requests/pending", { cache: "no-store" })
      if (r.ok) {
        const j = await r.json()
        setPending(Array.isArray(j.items) ? (j.items as WishItem[]) : [])
      }
    } catch (e) {
      console.warn("[requests] pending", e)
    }
  }, [])

  // Persistenz-Helfer (Admin Playlist Auswahl)
  const loadPersistedPlaylist = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/playlist", { cache: "no-store" })
      const j = await r.json().catch(() => ({}))
      if (r.ok && typeof j.id === "string") {
        setSelectedPlaylist(j.id || "")
      }
    } catch {
      // silent
    }
  }, [])

  const savePersistedPlaylist = useCallback(async (id: string) => {
    try {
      await fetch("/api/admin/playlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      })
    } catch {
      // silent
    }
  }, [])

  const remaining = useMemo(() => {
    if (!now) return ""
    const sec = Math.max(0, Math.floor(now.remaining_ms / 1000))
    const m = Math.floor(sec / 60)
    const s = String(sec % 60).padStart(2, "0")
    return `${m}:${s}`
  }, [now])

    const queueUpdatedAgo = useMemo(() => {
    if (!queueUpdatedAt) return ""
    const diff = Math.max(0, Math.floor((Date.now() - queueUpdatedAt) / 1000))
    if (diff < 60) return `${diff}s`
    const m = Math.floor(diff / 60)
    const s = String(diff % 60).padStart(2, "0")
    return `${m}:${s}min`
  }, [queueUpdatedAt])

  const throttleRemaining = useMemo(() => {
    if (!selectedPlaylist) return 0
    const diffMs = Date.now() - lastPlaylistFetchRef.current
    const rem = 30_000 - diffMs
    return rem > 0 ? Math.ceil(rem / 1000) : 0
  }, [selectedPlaylist, queueUpdatedAt])

  const fetchNow = useCallback(async () => {
    try {
      const res = await fetch("/api/now-playing", { cache: "no-store" })
      if (res.ok) setNow(await res.json())
    } catch {}
  }, [])

  const fetchQueue = useCallback(async () => {
    // Wenn eine Ziel-Playlist gesetzt ist, nicht öfter als alle 30s laden
    const sel = selectedPlaylistRef.current
    if (sel) {
      const now = Date.now()
      if (now - lastPlaylistFetchRef.current < 30_000) {
        return // zu früh – überspringen
      }
      lastPlaylistFetchRef.current = now
    }
    try {
      const res = await fetch("/api/queue", { cache: "no-store" })
      const j = await res.json().catch(() => ({}))
      // /api/queue liefert { items: [...] }
      const raw = Array.isArray(j.items) ? j.items : []

      // UI erwartet spotifyId/title/artist/score/reason
      const mapped = raw.map((it: any) => ({
        spotifyId: it.uri || it.id || it.spotifyId,            // robust mappen
        title: it.title || it.name || "",
        artist: it.artist || it.artists || "",
        duration_ms: typeof it.duration_ms === "number" ? it.duration_ms : undefined,
        score: typeof it.score === "number" ? it.score : undefined,
        reason: it.reason || undefined,
        source: it.source || undefined,
      }))

      setQueue(mapped)  // <-- immer ein Array speichern
      setQueueUpdatedAt(Date.now())
    } catch (e) {
      console.warn("[queue] fetch failed", e)
      setQueue([])      // auf Array zurücksetzen, damit .map nicht crasht
      setQueueUpdatedAt(Date.now())
    }
  }, [])
  // Debounced Varianten für Realtime-Events
  const fetchNowDebounced = useMemo(() => debounce(fetchNow, 250), [fetchNow])
  const fetchQueueDebounced = useMemo(() => debounce(fetchQueue, 250), [fetchQueue])
  // Alle 30s neu laden, wenn eine Ziel-Playlist gewählt ist
  useEffect(() => {
    if (!selectedPlaylist) return
    // sofortiger Load, unabhängig vom Throttle-Zeitpunkt
    fetchQueue()
    const t = setInterval(() => {
      fetchQueue()
    }, 30_000)
    return () => clearInterval(t)
  }, [selectedPlaylist, fetchQueue])

  const fetchVotesSummary = useCallback(async () => {
    try {
      const supa = getSupabase()
      if (!supa) return

      const trackId = now?.track_spotify_id
      if (!trackId) {
        // Keine ID – wir ändern die aktuellen Zähler NICHT, um Flackern zu vermeiden
        return
      }

      const base = supa
        .from("votes")
        .select("id", { count: "exact", head: true })
        .eq("session_code", sessionCode())
        .eq("track_spotify_id", trackId)

      const [likeRes, dislikeRes] = await Promise.all([
        base.eq("value", 1),
        base.eq("value", -1),
      ])

      setLikes(likeRes.count ?? 0)
      setDislikes(dislikeRes.count ?? 0)
    } catch (e) {
      console.warn("[votes] summary failed", e)
    }
  }, [now])
  // Wenn der Track wechselt, Zähler sanft zurücksetzen und neu laden
  useEffect(() => {
    const id = now?.track_spotify_id || null
    if (id && id !== lastTrackIdRef.current) {
      lastTrackIdRef.current = id
      // Optional: kurz auf 0 setzen? Wir lassen die alten Werte stehen bis Fetch fertig ist, um Flackern zu vermeiden.
      // setLikes(0); setDislikes(0)
      fetchVotesSummary()
    }
  }, [now?.track_spotify_id, fetchVotesSummary])

  useEffect(() => {
    // Initial load
    fetchNow()
    fetchQueue()
    fetchVotesSummary()
    fetchPendingRequests()

    // Realtime subscriptions
    let unsubQueue = () => {}
    let unsubNow = () => {}
    let unsubVotes = () => {}
    let unsubRequests = () => {}

    try {
      unsubQueue = subscribeTable({
        table: "queue",
        event: "*",
        filter: `session_code=eq.${sessionCode()}`,
        onEvent: () => { fetchQueueDebounced() },
      })

      unsubNow = subscribeTable({
        table: "now_playing",
        event: "*",
        filter: `session_code=eq.${sessionCode()}`,
        onEvent: () => { fetchNowDebounced(); fetchVotesSummary() },
      })

      unsubVotes = subscribeTable({
        table: "votes",
        event: "*",
        filter: `session_code=eq.${sessionCode()}`,
        onEvent: () => {
          fetchVotesSummary()
        },
      })

      unsubRequests = subscribeTable({
        table: "requests",
        event: "*",
        filter: `session_code=eq.${sessionCode()}`,
        onEvent: () => {
          fetchPendingRequests()
        },
      })
    } catch (e) {
      console.warn("[realtime] subscribe failed — fallback to polling", e)
      const t = setInterval(() => {
        fetchNow()
        fetchQueue()
        fetchVotesSummary()
      }, 4000)
      return () => clearInterval(t)
    }

    return () => {
      unsubQueue()
      unsubNow()
      unsubVotes()
      unsubRequests()
    }
  }, [fetchNow, fetchQueue, fetchVotesSummary, fetchPendingRequests, fetchNowDebounced, fetchQueueDebounced])
  useEffect(() => {
    if (isAdmin && adminOpen) {
      loadPersistedPlaylist()
      fetchPlaylists()
    }
    // intentionally omit fetchPlaylists from deps to avoid loops when selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, adminOpen, loadPersistedPlaylist])
  async function adminResolveWish(w: WishItem) {
    try {
      setPendingBusy(w.id)
      await fetch("/api/admin/requests/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: w.id, query: w.text, playlistId: selectedPlaylist || undefined }),
      })
      await fetchPendingRequests()
      await fetchQueue()
    } finally {
      setPendingBusy(null)
    }
  }

  async function adminRejectWish(w: WishItem) {
    try {
      setPendingBusy(w.id)
      await fetch("/api/admin/requests/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: w.id }),
      })
      await fetchPendingRequests()
    } finally {
      setPendingBusy(null)
    }
  }

  // Leader-Polling: genau ein Client sync't Spotify→DB alle 4s
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const claim = await fetch("/api/sync/leader", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner: clientIdRef.current }),
        })
        const j = await claim.json().catch(() => ({}))
        if (j?.leader) {
          await fetch("/api/spotify/sync-now-playing", { method: "POST" })
          // Realtime-Event aktualisiert alle Clients; kein direktes fetchNow() nötig
        }
      } catch {
        // still silent
      }
    }, 4000)
    return () => clearInterval(t)
  }, [fetchNow])

  async function submitWish() {
    if (!wish.trim()) return
    setLoading(true)
    try {
      const payload = { spotifyId: wish.trim(), note: "guest wish" }
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setWish("")
        fetchQueue()
      } else {
        console.error(await res.text())
      }
    } finally {
      setLoading(false)
    }
  }

  async function vote(value: 1 | -1) {
    if (!now?.track_spotify_id) {
      // Ohne Track-ID kein Vote – Anzeige unverändert lassen
      return
    }
    const trackId = now.track_spotify_id

    setLikeBusy(value === 1 ? "up" : "down")

    // Ref vor jedem Vote zurücksetzen
    voteRollbackRef.current = null

    try {
      // Optimistic UI + Rollback in Ref speichern
      if (value === 1) {
        setLikes((n) => {
          const prev = n
          voteRollbackRef.current = () => setLikes(prev)
          return n + 1
        })
      } else {
        setDislikes((n) => {
          const prev = n
          voteRollbackRef.current = () => setDislikes(prev)
          return n + 1
        })
      }

      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value, trackId }),
      })

      if (!res.ok) {
        // Rollback ausführen, wenn Server ablehnt
        const rb = voteRollbackRef.current
        if (typeof rb === "function") rb()
        console.error("Vote fehlgeschlagen", await res.text().catch(() => ""))
      }
      // Erfolgsfall: Realtime-Sub triggert fetchVotesSummary automatisch.
    } finally {
      setLikeBusy(null)
      // Rollback-Ref aufräumen
      voteRollbackRef.current = null
    }
  }

    async function adminPlay() {
    try {
      const r = await fetch("/api/spotify/play", { method: "POST" })
      const j = await r.json().catch(() => ({}))
      if (!j?.ok) {
        alert("Play fehlgeschlagen. Öffne Spotify auf dem Zielgerät und versuche es erneut.")
      }
    } catch {
      alert("Play fehlgeschlagen (Netzwerk)")
    }
  }

  async function adminPause() {
    try {
      const r = await fetch("/api/spotify/pause", { method: "POST" })
      const j = await r.json().catch(() => ({}))
      if (!j?.ok) {
        alert("Pause fehlgeschlagen. Ist ein aktives Spotify-Gerät vorhanden?")
      }
    } catch {
      alert("Pause fehlgeschlagen (Netzwerk)")
    }
  }

  async function adminSkip() {
    try {
      const r = await fetch("/api/spotify/skip", { method: "POST" })
      const j = await r.json().catch(() => ({}))
      if (!j?.ok) {
        alert("Skip fehlgeschlagen. Öffne Spotify auf dem Zielgerät.")
      }
    } catch {
      alert("Skip fehlgeschlagen (Netzwerk)")
    }
  }

  async function adminTransfer() {
    await fetch("/api/spotify/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId }),
    })
  }

  async function adminResetVotes() {
    await fetch("/api/admin/votes/reset", { method: "POST" })
    await fetchVotesSummary()
  }

  async function adminResetAllVotes() {
  const confirmed = window.confirm(
    "Wirklich ALLE Votes dieser Session löschen? Das kann nicht rückgängig gemacht werden."
  )
  if (!confirmed) return
  await fetch("/api/admin/votes/reset-all", { method: "POST" })
  // UI sofort „auf Null“ bringen
  setLikes(0)
  setDislikes(0)
  }
 
function tryAdminLogin() {
    if (adminPin === "2046") {
      setIsAdmin(true)
      setAdminPin("") // PIN-Feld nach erfolgreichem Login leeren
    }
  }

  return (
    <main className="min-h-screen bg-zinc-900 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold">🎶 Wedding DJ</span>
            <span className="rounded-full bg-pink-600/20 px-2 py-0.5 text-xs text-pink-300">
              Session: GOCH‑2026
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAdminOpen((v) => !v)}
              className={
                isAdmin
                  ? "rounded-lg border border-emerald-700 bg-emerald-900/30 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-900/40"
                  : "rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
              }
              aria-pressed={adminOpen}
              aria-label="Admin Menü öffnen"
            >
              {isAdmin ? "Admin aktiv" : "Admin"}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-2">
        {/* Now Playing */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow">
          <h2 className="mb-3 text-lg font-semibold">Now Playing</h2>
          {now ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-bold">{now.title}</div>
                <div className="text-zinc-400">{now.artist}</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Restzeit: <span className="font-mono">{remaining}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex gap-2">
                  <button
                    onClick={() => vote(1)}
                    disabled={likeBusy !== null}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    👍 Gefällt
                  </button>
                  <button
                    onClick={() => vote(-1)}
                    disabled={likeBusy !== null}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    👎 Gefällt nicht
                  </button>
                </div>
                <div className="mt-1 text-right text-xs text-zinc-400">
                  <span className="mr-2">👍 {likes}</span>
                  <span>👎 {dislikes}</span>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={adminPlay}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    ▶︎ Play
                  </button>
                  <button
                    onClick={adminPause}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
                  >
                    ❚❚ Pause
                  </button>
                  <button
                    onClick={adminSkip}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    » Skip
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-zinc-400">Keine Wiedergabe erkannt.</div>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            Dislikes unterbrechen den aktuellen Song nicht – sie beeinflussen nur zukünftige Auswahl.
          </p>
        </section>

        {/* Wunsch */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow">
          <h2 className="mb-3 text-lg font-semibold">Musikwunsch</h2>
          <div className="flex gap-2">
            <input
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              placeholder="Song, Künstler oder Genre…"
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
            />
            <button
              onClick={submitWish}
              disabled={loading || !wish.trim()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Senden
            </button>
          </div>
          <div className="mt-3 text-xs text-zinc-500">
            Hinweis: In dieser Demo wird der Text als <code>spotifyId</code> gesendet.
          </div>
        </section>

        {/* Queue */}
        <section className="md:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Als Nächstes</h2>
            <div className="flex items-center gap-3">
              {queueUpdatedAt && (
                <span className="text-xs text-zinc-500">Aktualisiert vor {queueUpdatedAgo}</span>
              )}
              <button
                onClick={fetchQueue}
                disabled={!!selectedPlaylist && throttleRemaining > 0}
                className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
              >
                {!!selectedPlaylist && throttleRemaining > 0 ? `In ${throttleRemaining}s` : "Jetzt aktualisieren"}
              </button>
            </div>
          </div>
          {queue.length === 0 ? (
            <div className="text-zinc-400">Noch keine Einträge.</div>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {queue.map((q) => (
                <li key={q.spotifyId} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{q.title || q.spotifyId}</div>
                    <div className="text-sm text-zinc-400">{q.artist || "Unbekannt"}</div>
                  </div>
                  <div className="text-right text-xs text-zinc-400">
                    {typeof q.score === "number" && <div>Score: {q.score}</div>}
                    {q.reason && <div className="rounded bg-zinc-800 px-2 py-0.5">{q.reason}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Admin Drawer and Overlay */}
      {adminOpen && (
        <div>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity duration-200"
            onClick={() => setAdminOpen(false)}
          />
        </div>
      )}
      <div
        className={`fixed right-0 top-0 h-full max-h-screen w-full max-w-sm overflow-y-auto overscroll-contain transform border-l border-zinc-800 bg-zinc-950 p-5 pb-6 shadow-2xl transition-transform duration-200 z-50 ${
        adminOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Admin</h3>
          <button
            onClick={() => setAdminOpen(false)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            Schließen
          </button>
        </div>

        {!isAdmin ? (
          <div className="space-y-3">
            <label className="block text-sm text-zinc-300">PIN</label>
            <input
              type="password"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="2046"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-500"
            />
            <button
              onClick={tryAdminLogin}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Anmelden
            </button>
            <p className="text-xs text-zinc-500">
              Hinweis: In der MVP‑Demo wird die PIN clientseitig geprüft. Später nur serverseitig!
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Admin: Abmelden */}
            <div className="pt-2">
              <button
                onClick={() => setIsAdmin(false)}
                className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
              >
                Abmelden
              </button>
            </div>

            {/* Votes */}
            <div>
              <div className="mb-2 text-sm text-zinc-300">Votes</div>
              <button
                onClick={adminResetVotes}
                className="w-full rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
              >
                Votes zurücksetzen (aktueller Track)
              </button>
              <button
                onClick={adminResetAllVotes}
                className="mt-2 w-full rounded-xl border border-rose-700 px-3 py-2 text-sm hover:bg-rose-900/20 text-rose-300"
              >
                Alle Votes der Session löschen
              </button>
              <p className="mt-1 text-xs text-zinc-500">Setzt alle 👍/👎 entweder für den aktuellen Track oder die gesamte Session zurück.</p>
            </div>

            {/* Ziel-Playlist */}
            <div>
              <div className="mb-1 text-sm text-zinc-300">Ziel‑Playlist</div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedPlaylist}
                  onChange={(e) => { const v = e.target.value; setSelectedPlaylist(v); savePersistedPlaylist(v); }}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                >
                  <option value="">— Keine —</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={fetchPlaylists}
                  disabled={plLoading || plCooldown > 0}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
                >
                  {plLoading ? "Lädt…" : plCooldown > 0 ? `Warten (${plCooldown}s)` : "Aktualisieren"}
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Wenn gesetzt, werden genehmigte Wünsche beim Übernehmen in diese Playlist hinzugefügt.</p>
            </div>
            {playlistsError === "not_connected" ? (
              <div className="mt-1 text-xs">
                <span className="text-amber-400">Nicht mit Spotify verbunden.</span>{" "}
                <a href="/api/spotify/login" className="underline">Jetzt verbinden</a>
              </div>
            ) : playlists.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-500">Keine Playlists gefunden.</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                Wenn gesetzt, werden genehmigte Wünsche beim Übernehmen in diese Playlist hinzugefügt.
              </p>
            )}
            {playlistsError === "rate_limited" && (
              <p className="mt-1 text-xs text-amber-400">
                Spotify‑Rate‑Limit. Bitte kurz warten{plCooldown > 0 ? ` (${plCooldown}s)` : ""} und dann erneut „Aktualisieren“ drücken.
              </p>
            )}
            {/* Wünsche (offen) */}
            <div>
              <div className="mb-2 text-sm font-semibold text-zinc-200">Wünsche (offen)</div>
              {pending.length === 0 ? (
                <div className="text-sm text-zinc-500">Keine offenen Wünsche.</div>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {pending.map((w) => (
                    <li key={w.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm">{w.text}</div>
                          <div className="text-xs text-zinc-500">{w.guest_name || "Anonym"} • {new Date(w.created_at).toLocaleTimeString()}</div>
                          {/* AI-Match Ergebnis anzeigen */}
                          {(w.title || w.artist) ? (
                            <div className="mt-1 text-xs">
                              <span className="text-zinc-500">AI‑Match: </span>
                              <span className="text-zinc-200">{w.title || "—"}</span>
                              <span className="text-zinc-400"> — {w.artist || "Unbekannt"}</span>
                              {typeof w.ai_confidence === "number" && (
                                <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                                  {(w.ai_confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-amber-400">AI‑Match noch nicht verfügbar…</div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => adminResolveWish(w)}
                            disabled={pendingBusy === w.id}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Übernehmen{selectedPlaylist ? " + Playlist" : ""}
                          </button>
                          <button
                            onClick={() => adminRejectWish(w)}
                            disabled={pendingBusy === w.id}
                            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
                          >
                            Ablehnen
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Spotify Geräte & Login */}
            <div>
              <div className="mb-2 text-sm text-zinc-300">Spotify‑Device (Demo)</div>
              <input
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-500"
              />
              <button
                onClick={async () => {
                  await fetch("/api/spotify/sync-now-playing", { method: "POST" })
                  await fetchNow()
                }}
                className="mt-2 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Von Spotify übernehmen
              </button>
              <button
                onClick={adminTransfer}
                className="mt-2 w-full rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
              >
                Auf dieses Gerät übertragen
              </button>
              <p className="mt-1 text-xs text-zinc-500">In echt würdest du hier verfügbare Geräte listen und auswählen.</p>
              <div className="mt-4 space-y-2">
                <div className="text-sm text-zinc-300">Spotify-Status</div>
                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={async () => {
                      const r = await fetch("/api/spotify/status", { cache: "no-store" })
                      const j = await r.json().catch(() => ({}))
                      alert(j.connected ? "Verbunden mit Spotify" : "Nicht verbunden – bitte einloggen")
                    }}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                  >
                    Status prüfen
                  </button>
                 <button
  onClick={() => { window.location.href = "/api/spotify/login?force=1" }}
  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white"
>
  Mit Spotify verbinden
</button>
                  <button
  onClick={() => { window.location.href = "/api/spotify/login?force=1" }}
  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500"
>
  Mit Spotify verbinden (erzwingen)
</button>
                  <button
                    onClick={async () => {
                      const ok = window.confirm("Spotify-Verbindung trennen? Du kannst dich später wieder verbinden.")
                      if (!ok) return
                      try {
                        const r = await fetch("/api/spotify/connect", { method: "DELETE" })
                        const j = await r.json().catch(() => ({} as any))
                        if (r.ok && j?.ok) {
                          // UI zurücksetzen
                          setSelectedPlaylist("")
                          setPlaylists([])
                          setPlaylistsError("not_connected")
                          alert("Spotify-Verbindung wurde getrennt.")
                        } else {
                          alert("Trennen fehlgeschlagen. Versuche es erneut.")
                        }
                      } catch {
                        alert("Trennen fehlgeschlagen (Netzwerk)")
                      }
                    }}
                    className="rounded-lg border border-rose-700 bg-rose-900/30 px-3 py-1.5 text-rose-200 hover:bg-rose-900/40"
                  >
                    Spotify trennen
                  </button>
                </div>

                <div className="text-sm text-zinc-300">Geräte laden</div>
                <button
                  onClick={async () => {
                    const r = await fetch("/api/spotify/devices", { cache: "no-store" })
                    const j = await r.json().catch(() => ({} as any))
                    if (j?.devices?.length) {
                      const names = j.devices.map((d: any) => `${d.name} (${d.id})${d.is_active ? " • aktiv" : ""}`).join("\n")
                      alert(`Gefundene Geräte:\n\n${names}\n\nTipp: Kopiere die gewünschte ID ins Feld oben.`)
                    } else {
                      alert("Keine Geräte gefunden. Öffne Spotify auf dem Zielgerät und probiere es erneut.")
                    }
                  }}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                >
                  Geräte abfragen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
