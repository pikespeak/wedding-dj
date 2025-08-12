import { NextResponse } from "next/server"

export async function GET() {
  const now = Date.now()
  const durationMs = 200_000
  const startedAt = new Date(now - 45_000).toISOString()
  const endsAt = new Date(now - 45_000 + durationMs).toISOString()

  return NextResponse.json({
    track_spotify_id: "demo:now",
    title: "Sunset Drive",
    artist: "Neon Rivers",
    started_at: startedAt,
    ends_at: endsAt,
    remaining_ms: Math.max(0, new Date(endsAt).getTime() - now),
  })
}
