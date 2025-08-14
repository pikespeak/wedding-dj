import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { refreshAccessToken } from "@/lib/spotify"
import { getOriginFromRequest, absoluteUrl } from "@/lib/runtimeUrl"

export async function GET(req: Request) {
  const origin = getOriginFromRequest(req)
  const redirectUri = absoluteUrl(req, "/api/spotify/callback")

  const env = {
    clientIdPresent:
      !!process.env.SPOTIFY_CLIENT_ID || !!process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID,
    clientSecretPresent: !!process.env.SPOTIFY_CLIENT_SECRET,
  }

  const jar = await cookies()
  const refreshCookie = !!jar.get("spotify_refresh_token")?.value

  const out: any = {
    origin,
    redirectUri,
    env,
    refreshCookie,
    tokenRefreshed: false,
    me: null,
    devices: null,
    errors: [] as string[],
  }

  try {
    if (!refreshCookie) {
      out.errors.push("no_refresh_cookie")
      return NextResponse.json(out, { status: 200 })
    }

    // 1) Access-Token via Refresh holen
    const tok = await refreshAccessToken()
    out.tokenRefreshed = true

    // 2) Wer bin ich?
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
      cache: "no-store",
    })
    const meJson = await meRes.json().catch(() => ({}))
    if (!meRes.ok) {
      out.errors.push(`me_${meRes.status}`)
    } else {
      out.me = {
        id: meJson.id,
        display_name: meJson.display_name,
        product: meJson.product,
        country: meJson.country,
        email: meJson.email ?? null,
      }
    }

    // 3) Geräte prüfen
    const devRes = await fetch("https://api.spotify.com/v1/me/player/devices", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
      cache: "no-store",
    })
    const devJson = await devRes.json().catch(() => ({}))
    if (!devRes.ok) {
      out.errors.push(`devices_${devRes.status}`)
    } else {
      out.devices = Array.isArray(devJson.devices) ? devJson.devices : []
    }

    return NextResponse.json(out, { status: 200 })
  } catch (e: any) {
    out.errors.push(e?.message || "unknown_error")
    return NextResponse.json(out, { status: 200 })
  }
}