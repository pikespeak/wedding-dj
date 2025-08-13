// app/api/admin/playlist/route.ts
import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

// GET -> gespeicherte Playlist-ID laden
export async function GET() {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const { data, error } = await supa
    .from("settings")
    .select("value")
    .eq("session_code", sessionCode())
    .eq("key", "selected_playlist")
    .single()

  // PGRST116 = Row not found
  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const playlistId = (data?.value as any)?.id || ""
  return NextResponse.json({ id: playlistId })
}

// POST -> Playlist-ID speichern { id: string } (oder leeren mit id:"")
export async function POST(req: Request) {
  const supa = getAdminSupabase()
  if (!supa) return NextResponse.json({ error: "supabase not configured" }, { status: 500 })

  const body = await req.json().catch(() => ({} as any))
  const id = typeof body?.id === "string" ? body.id : ""
  const payload = id ? { id } : null

  const { error } = await supa
    .from("settings")
    .upsert(
      {
        session_code: sessionCode(),
        key: "selected_playlist",
        value: payload as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_code,key" }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}