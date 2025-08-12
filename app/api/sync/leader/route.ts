import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"

const KEY = "spotify_sync"
const LEASE_SECONDS = 12

export async function POST(req: Request) {
  const { owner } = (await req.json().catch(() => ({}))) as { owner?: string }
  if (!owner) return NextResponse.json({ error: "owner required" }, { status: 400 })

  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const now = new Date()
  const expires = new Date(now.getTime() + LEASE_SECONDS * 1000)

  // Claim expired
  const claim = await supa
    .from("locks")
    .update({ owner, expires_at: expires.toISOString() })
    .eq("key", KEY)
    .lt("expires_at", now.toISOString())
    .select()

  if (claim.error) return NextResponse.json({ error: claim.error.message }, { status: 500 })
  if ((claim.data?.length ?? 0) > 0) return NextResponse.json({ leader: true, owner })

  // Insert if not exists (first time)
  const insert = await supa
    .from("locks")
    .insert({ key: KEY, owner, expires_at: expires.toISOString() })
    .select()
    .single()

  if (!insert.error) return NextResponse.json({ leader: true, owner })
  if (insert.error.code !== "23505") {
    return NextResponse.json({ error: insert.error.message }, { status: 500 })
  }

  // Renew if we are the current owner
  const get = await supa.from("locks").select("owner, expires_at").eq("key", KEY).single()
  if (get.error) return NextResponse.json({ error: get.error.message }, { status: 500 })

  if (get.data.owner === owner) {
    const renew = await supa
      .from("locks")
      .update({ expires_at: expires.toISOString() })
      .eq("key", KEY)
    if (renew.error) return NextResponse.json({ error: renew.error.message }, { status: 500 })
    return NextResponse.json({ leader: true, owner })
  }

  return NextResponse.json({ leader: false, owner })
}