import { NextResponse } from "next/server"
// TODO: später echte Spotify-Steuerung (next)
export async function POST() {
  return NextResponse.json({ action: "skip", ok: true })
}
