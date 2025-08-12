import { NextResponse } from "next/server"
import { play } from "@/lib/spotify"

export async function POST() {
  try {
    const res = await play()
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "play_failed" }, { status: 500 })
  }
}
