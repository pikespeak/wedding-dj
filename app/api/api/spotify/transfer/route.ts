import { NextResponse } from "next/server"
import { transferPlayback } from "@/lib/spotify"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body?.deviceId) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400 })
  }
  const res = await transferPlayback(body.deviceId)
  return NextResponse.json(res)
}
