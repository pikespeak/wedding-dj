import { NextResponse } from "next/server"
import { listDevices } from "@/lib/spotify"

export async function GET() {
  try {
    const devices = await listDevices()
    return NextResponse.json({ devices })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "devices_failed" }, { status: 500 })
  }
}
