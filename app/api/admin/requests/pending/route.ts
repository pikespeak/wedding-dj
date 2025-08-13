// app/api/admin/requests/pending/route.ts
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function GET() {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ items: [], error: "supabase not configured" }, { status: 500 })

  const { data, error } = await supa
    .from("requests")
    .select("id, text, guest_name, created_at, title, artist, ai_confidence, ai_rationale, spotify_track_id")
    .eq("session_code", sessionCode())
    .eq("status", "pending") // ggf. an dein Schema anpassen
    .order("created_at", { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ items: [], error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}