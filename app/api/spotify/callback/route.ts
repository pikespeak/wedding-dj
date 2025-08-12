import { NextResponse } from "next/server"
import { exchangeCodeForTokens, saveRefreshToken } from "@/lib/spotify"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  if (error) {
    // absolute URL aus req.url bauen
    return NextResponse.redirect(new URL(`/?spotify_error=${encodeURIComponent(error)}`, url.origin))
  }
  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 })
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    if (tokens.refresh_token) await saveRefreshToken(tokens.refresh_token)
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/?spotify_error=${encodeURIComponent(e?.message || "auth_failed")}`, url.origin)
    )
  }

  return NextResponse.redirect(new URL("/?spotify=connected", url.origin))
}