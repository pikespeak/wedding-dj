// app/api/spotify/skip/route.ts
import { NextResponse } from "next/server"
import { nextTrack } from "@/lib/spotify"

export async function POST() {
  try {
    const res = await nextTrack()
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "skip_failed" }, { status: 200 })
  }
}