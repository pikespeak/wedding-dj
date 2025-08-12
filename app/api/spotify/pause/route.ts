import { NextResponse } from "next/server"
import { pause } from "@/lib/spotify"

export async function POST() {
  try {
    const res = await pause()
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "pause_failed" }, { status: 500 })
  }
}
