// app/api/admin/votes/reset-all/route.ts
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function POST() {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 500 })

  const { error, count } = await supa
    .from("votes")
    .delete({ count: "exact" })
    .eq("session_code", sessionCode())

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: count ?? 0 })
}