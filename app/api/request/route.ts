import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body?.spotifyId) {
    return NextResponse.json({ error: "spotifyId required" }, { status: 400 })
  }
  // TODO: In DB als Queue-Item speichern
  return NextResponse.json({ status: "queued", request: body }, { status: 201 })
}
