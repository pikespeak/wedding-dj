import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"

export async function POST(req: Request) {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const body = await req.json().catch(() => ({} as any))
  const id = body?.id as string | undefined
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 })

  const upd = await supa.from("requests").update({ status: "rejected" }).eq("id", id)
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
