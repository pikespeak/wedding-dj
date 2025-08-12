import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"
import crypto from "crypto"

const SALT = process.env.ADMIN_PIN || "salt"
function ipHash(ip: string){ return crypto.createHash("sha256").update(`${ip}:${SALT}`).digest("hex").slice(0,32) }

export async function POST(req: Request) {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const body = await req.json().catch(() => ({} as any))
  const text = (body?.text || body?.spotifyId || "").toString().trim()
  const guest = (body?.guest || "").toString().trim() || null

  if (!text) return NextResponse.json({ error: "missing text" }, { status: 400 })

  // simples Rate-Limit: max 3 Wünsche in 5 Minuten pro IP/Session
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0"
  const hash = ipHash(ip)
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const recent = await supa
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("session_code", sessionCode())
    .eq("ip_hash", hash)
    .gte("created_at", since)
  if ((recent.count ?? 0) >= 3) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  // Wunsch speichern (zunächst pending)
  const ins = await supa
    .from("requests")
    .insert({
      session_code: sessionCode(),
      guest_name: guest,
      text,
      ip_hash: hash,
      status: "pending",
    })
    .select()
    .single()
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })

  // Fire-and-forget: AI-Resolver im Hintergrund
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  fetch(`${baseUrl}/api/dj/resolve-task`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: ins.data.id }),
    // keepalive hilft im Edge/FaaS-Umfeld, ist aber optional
    keepalive: true,
  }).catch(() => {})

  // Sofort antworten – UI bleibt schnell
  return NextResponse.json({ ok: true, request: ins.data })
}