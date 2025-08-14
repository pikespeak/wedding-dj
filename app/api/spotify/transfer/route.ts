// app/api/spotify/transfer/route.ts
import { NextResponse } from "next/server"
import { transferPlayback } from "@/lib/spotify"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const deviceId = String(body?.deviceId || "")
    if (!deviceId) return NextResponse.json({ ok: false, error: "missing_deviceId" }, { status: 400 })
    const r = await transferPlayback(deviceId, true)
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 200 })
  }
}