import { NextResponse } from "next/server"

export async function GET() {
  // Dummy-Queue
  const items = [
    { spotifyId: "demo:1", title: "Uptown Groove", artist: "The City Lights", score: 3, reason: "warmup vibe" },
    { spotifyId: "demo:2", title: "Midnight Spark", artist: "Nova Pulse", score: 2, reason: "popular pick" },
  ]
  return NextResponse.json(items)
}
