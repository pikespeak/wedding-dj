import { NextResponse } from "next/server"
import { exchangeCodeForTokens, saveRefreshToken } from "@/lib/spotify"
import { absoluteUrl } from "@/lib/runtimeUrl"   // <— wichtig
import { cookies } from "next/headers"

export async function GET(req: Request) {
  const backOk  = absoluteUrl(req, "/?spotify=connected")
  const backErr = (m: string) => absoluteUrl(req, "/?spotify_error=" + encodeURIComponent(m))
  const redirectUri = absoluteUrl(req, "/api/spotify/callback")
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get("code")
  const error = searchParams.get("error")

  // Debug: Route erreicht?
  console.log("[spotify/callback] hit", { url: req.url, code_present: !!code, error })

  if (error) return NextResponse.redirect(backErr(error || "auth_error"))
  if (!code)  return NextResponse.redirect(backErr("missing_code"))

  try {
    const redirectUri = absoluteUrl(req, "/api/spotify/callback")
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    // Debug: was kam zurück?
    console.log("[spotify/callback] token response keys", Object.keys(tokens || {}))

    // Test: Cookie-Set allgemein möglich?
    const jar = await cookies()
    jar.set("rt_probe", Date.now().toString(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 300, // 5 min
    })

    if ((tokens as any)?.refresh_token) {
      await saveRefreshToken((tokens as any).refresh_token)
      console.log("[spotify/callback] refresh_token saved")
      return NextResponse.redirect(backOk)
    } else {
      console.warn("[spotify/callback] NO refresh_token received — user must force consent")
      return NextResponse.redirect(
        backErr("no_refresh_token—try /api/spotify/login?force=1")
      )
    }
  } catch (e: any) {
    console.error("[spotify/callback] error", e?.message)
    return NextResponse.redirect(backErr(e?.message || "token_exchange_failed"))
  }
}