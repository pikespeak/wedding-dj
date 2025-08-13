// app/api/spotify/playlists/route.ts
import { NextResponse } from "next/server"
import { getRefreshToken, refreshAccessToken, saveRefreshToken } from "@/lib/spotify"

type CacheEntry = {
  items: { id: string; name: string }[]
  expiresAt: number
}
type RLState = { until?: number }

const g = globalThis as any
g.__PL_CACHE ??= {} as Record<string, CacheEntry>
g.__PL_RL ??= {} as RLState

const CACHE_TTL_MS = 60_000 // 60s
const RL_MAX_SEC = 120       // nie länger als 2min sperren
const RL_MIN_SEC = 1

function clampRetryAfter(sec: number): number {
  if (!Number.isFinite(sec)) return 30
  const s = Math.floor(sec)
  return Math.min(RL_MAX_SEC, Math.max(RL_MIN_SEC, s))
}

export async function GET() {
  try {
    const rt = await getRefreshToken()
    if (!rt) return NextResponse.json({ items: [], error: "not_connected" }, { status: 200 })

    const now = Date.now()

    // Wenn Rate-Limit aktiv: Cache liefern oder kurze Wartezeit melden
    if (g.__PL_RL.until && g.__PL_RL.until > now) {
      const retryAfter = Math.ceil((g.__PL_RL.until - now) / 1000)
      // irgendeinen gültigen Cache versuchen (Token-agnostisch)
      const cachedAny = Object.values<CacheEntry>(g.__PL_CACHE).find(c => c.expiresAt > now)
      if (cachedAny) return NextResponse.json({ items: cachedAny.items, error: "rate_limited", retryAfter }, { status: 200 })
      return NextResponse.json({ items: [], error: "rate_limited", retryAfter }, { status: 200 })
    }

    // Token holen
    const t = await refreshAccessToken(rt)
    if ((t as any)?.refresh_token) await saveRefreshToken((t as any).refresh_token)
    const access = (t as any).access_token as string

    // Cache-Key auf Access Token basieren (oder „anon“)
    const key = access || "anon"
    const cached = g.__PL_CACHE[key] as CacheEntry | undefined
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ items: cached.items })
    }

    const url = new URL("https://api.spotify.com/v1/me/playlists")
    url.searchParams.set("limit", "50")

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${access}` },
      cache: "no-store",
    })

    if (res.status === 429) {
      // Header ist in Sekunden; clamp auf 1..120
      const header = res.headers.get("retry-after")
      const clamped = clampRetryAfter(Number(header || 30))
      g.__PL_RL.until = Date.now() + clamped * 1000

      // Falls Cache existiert -> Cache ausliefern
      if (cached && cached.expiresAt > now) {
        return NextResponse.json({ items: cached.items, error: "rate_limited", retryAfter: clamped }, { status: 200 })
      }
      return NextResponse.json({ items: [], error: "rate_limited", retryAfter: clamped }, { status: 200 })
    }

    if (!res.ok) {
      return NextResponse.json({ items: [], error: `spotify_${res.status}` }, { status: 200 })
    }

    const json = await res.json().catch(() => ({}))
    const items = (json?.items || []).map((p: any) => ({ id: String(p.id), name: String(p.name) }))

    // Cachen
    g.__PL_CACHE[key] = { items, expiresAt: Date.now() + CACHE_TTL_MS }

    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || "failed" }, { status: 200 })
  }
}