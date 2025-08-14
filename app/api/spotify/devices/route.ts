// app/api/spotify/devices/route.ts
import { NextResponse } from "next/server"
import { listDevices } from "@/lib/spotify"

export async function GET() {
  try {
    const j = await listDevices()
    return NextResponse.json({ devices: j?.devices ?? [] })
  } catch (e: any) {
    return NextResponse.json({ devices: [], error: e?.message || "failed" }, { status: 200 })
  }
}