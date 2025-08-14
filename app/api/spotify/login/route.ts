import { NextResponse } from "next/server"
import { getSpotifyAuthUrl } from "@/lib/spotify"
import { getOriginFromRequest } from "@/lib/runtimeUrl"

export async function GET(req: Request) {
  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "playlist-read-private",
    "playlist-modify-public",
    "playlist-modify-private",
  ]
  const origin = getOriginFromRequest(req)
  const sp = new URL(req.url).searchParams
  const force = sp.get("force") === "1" || sp.get("force") === "true"
  const url = getSpotifyAuthUrl(scopes, origin, force)
  return NextResponse.redirect(url)
}