import { NextResponse } from "next/server"
import { transferPlayback } from "@/lib/spotify"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body?.deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 })
  try {
    const res = await transferPlayback(body.deviceId)
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "transfer_failed" }, { status: 500 })
  }
}
