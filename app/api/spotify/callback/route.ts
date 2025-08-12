import { NextResponse } from "next/server"
import { exchangeCodeForTokens, saveRefreshToken } from "@/lib/spotify"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  if (error) return NextResponse.redirect(`/?spotify_error=${encodeURIComponent(error)}`)
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 })

  try {
    const tokens = await exchangeCodeForTokens(code)
    if (tokens.refresh_token) await saveRefreshToken(tokens.refresh_token)
  } catch (e: any) {
    return NextResponse.redirect(`/?spotify_error=${encodeURIComponent(e.message || "auth_failed")}`)
  }

  return NextResponse.redirect(`/?spotify=connected`)
}
