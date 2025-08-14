// app/api/spotify/pause/route.ts
import { NextResponse } from "next/server"
import { pause } from "@/lib/spotify"

export async function POST() {
  try {
    const r = await pause()
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "pause_failed" }, { status: 200 })
  }
}