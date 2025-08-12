# Ordner sicherstellen
mkdir -p app/api/now-playing app/api/queue

# /api/now-playing (GET)
cat > app/api/now-playing/route.ts <<'EOF'
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
EOF

# /api/queue (GET)
cat > app/api/queue/route.ts <<'EOF'
import { NextResponse } from "next/server"

export async function GET() {
  const items = [
    { spotifyId: "demo:1", title: "Uptown Groove", artist: "The City Lights", score: 3, reason: "warmup vibe" },
    { spotifyId: "demo:2", title: "Midnight Spark", artist: "Nova Pulse", score: 2, reason: "popular pick" },
  ]
  return NextResponse.json(items)
}
EOF