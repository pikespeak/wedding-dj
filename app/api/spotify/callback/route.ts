import { NextResponse } from "next/server"
import { exchangeCodeForToken, saveRefreshToken } from "@/lib/spotify"

function appOriginFromRedirect(): string {
  const ru = process.env.SPOTIFY_REDIRECT_URI || "http://localhost:3000/api/spotify/callback"
  try {
    const u = new URL(ru)
    return `${u.protocol}//${u.host}`
  } catch {
    return "http://localhost:3000"
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const err = url.searchParams.get("error")
  const base = appOriginFromRedirect()

  if (err) return NextResponse.redirect(`${base}/?spotify_error=${encodeURIComponent(err)}`, { status: 302 })
  if (!code) return NextResponse.redirect(`${base}/?spotify_error=missing_code`, { status: 302 })

  try {
    const tokenData = await exchangeCodeForToken(code)
    if (tokenData?.refresh_token) {
      // speichert jetzt Cookie + DB
      await saveRefreshToken(tokenData.refresh_token)
    }
    return NextResponse.redirect(`${base}/?spotify=connected`, { status: 302 })
  } catch (e: any) {
    return NextResponse.redirect(
      `${base}/?spotify_error=${encodeURIComponent(e?.message || "token_exchange_failed")}`,
      { status: 302 }
    )
  }
}