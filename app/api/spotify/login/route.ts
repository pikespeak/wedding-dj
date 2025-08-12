// app/api/spotify/login/route.ts
import { NextResponse } from "next/server"
import { getSpotifyAuthUrl } from "@/lib/spotify"

export async function GET() {
  // Schlicht: leite den Browser zur Spotify-Consent-Seite
  const url = getSpotifyAuthUrl()
  return NextResponse.redirect(url, { status: 302 })
}