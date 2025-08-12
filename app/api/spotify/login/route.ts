import { NextResponse } from "next/server"
import { authorizeUrl } from "@/lib/spotify"

export async function GET() {
  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
  ]
  const url = authorizeUrl(scopes)
  return NextResponse.redirect(url)
}
