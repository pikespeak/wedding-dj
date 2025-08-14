// app/api/spotify/disconnect/route.ts
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

export async function DELETE() {
  const notes: string[] = []

  // 1) Cookies löschen (Next 15: async cookies())
  try {
    const jar = await cookies()
    jar.delete("spotify_refresh_token")
    jar.delete("spotify_access_token")
  } catch (e: any) {
    notes.push(`cookie delete error: ${e?.message || e}`)
  }

  // 2) DB bereinigen – tolerant bei unterschiedlichen Schemas
  const supa = getAdminSupabase()
  const sc = sessionCode()
  const supaConfigured = !!supa

  let settingsKVDeleted = 0
  let settingsColsUpdated: number | null = null
  let settingsSelectedPlaylistDeleted = 0
  let oauthDeleted = 0
  let secretsDeleted = 0

  if (supa) {
    // a) settings: Key/Value-Variante (key ILIKE 'spotify_%')
    try {
      const del = await supa
        .from("settings")
        .delete({ count: "exact" })
        .ilike("key", "spotify_%")
      if (!del.error) settingsKVDeleted += del.count ?? 0
      else notes.push(`settings kv delete error: ${del.error.message}`)
    } catch (e: any) {
      notes.push(`settings kv delete warn: ${e?.message || e}`)
    }

    // a.1) ausgewählte Playlist (falls als KV gespeichert)
    try {
      const delSel = await supa
        .from("settings")
        .delete({ count: "exact" })
        .eq("key", "selected_playlist")
      if (!delSel.error) settingsSelectedPlaylistDeleted += delSel.count ?? 0
      else notes.push(`settings selected_playlist delete error: ${delSel.error.message}`)
    } catch {}

    // b) settings: Spalten-Variante (falls vorhanden)
    try {
      const upd = await supa
        .from("settings")
        .update(
          {
            spotify_access_token: null,
            spotify_refresh_token: null,
            spotify_expires_at: null,
          },
          { count: "exact" }
        )
        .eq("session_code", sc)
      if (!upd.error) settingsColsUpdated = upd.count ?? 0
      else notes.push(`settings cols update error: ${upd.error.message}`)
    } catch (e: any) {
      // Spalten existieren ggf. nicht – okay
      notes.push(`settings cols update warn: ${e?.message || e}`)
    }

    // c) oauth_tokens: per provider='spotify'
    try {
      const delOauth = await supa
        .from("oauth_tokens")
        .delete({ count: "exact" })
        .eq("provider", "spotify")
      if (!delOauth.error) oauthDeleted += delOauth.count ?? 0
      else notes.push(`oauth_tokens delete error: ${delOauth.error.message}`)
    } catch (e: any) {
      notes.push(`oauth_tokens delete warn: ${e?.message || e}`)
    }

    // d) secrets: Keys 'spotify_%'
    try {
      const delSec = await supa
        .from("secrets")
        .delete({ count: "exact" })
        .ilike("key", "spotify_%")
      if (!delSec.error) secretsDeleted += delSec.count ?? 0
      else notes.push(`secrets delete error: ${delSec.error.message}`)
    } catch (e: any) {
      notes.push(`secrets delete warn: ${e?.message || e}`)
    }
  } else {
    notes.push("no supabase admin client (check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE)")
  }

  return NextResponse.json({
    ok: true,
    disconnected: true,
    supaConfigured,
    settingsKVDeleted,
    settingsColsUpdated,
    settingsSelectedPlaylistDeleted,
    oauthDeleted,
    secretsDeleted,
    notes,
  })
}

// Optional: Diagnose
export async function GET() {
  const jar = await cookies()
  const hasRefresh = !!jar.get("spotify_refresh_token")
  const hasAccess = !!jar.get("spotify_access_token")

  const supa = getAdminSupabase()
  const sc = sessionCode()
  const notes: string[] = []

  let settingsRow: null | { spotify_access_token: any; spotify_refresh_token: any; spotify_expires_at: any } = null
  let settingsKVCount: number | null = null
  let oauthCount: number | null = null
  let secretsCount: number | null = null

  if (supa) {
    // settings: column-style probe
    try {
      const { data } = await supa
        .from("settings")
        .select("spotify_access_token, spotify_refresh_token, spotify_expires_at")
        .eq("session_code", sc)
        .maybeSingle()
      if (data) settingsRow = data as any
    } catch (e: any) {
      notes.push(`settings cols probe: ${e?.message || e}`)
    }

    // settings: kv-style count
    try {
      const { count } = await supa
        .from("settings")
        .select("key", { head: true, count: "exact" })
        .ilike("key", "spotify_%")
      settingsKVCount = count ?? 0
    } catch (e: any) {
      notes.push(`settings kv probe: ${e?.message || e}`)
    }

    // oauth_tokens: count by provider
    try {
      const { count } = await supa
        .from("oauth_tokens")
        .select("id", { head: true, count: "exact" })
        .eq("provider", "spotify")
      oauthCount = count ?? 0
    } catch (e: any) {
      notes.push(`oauth_tokens count probe: ${e?.message || e}`)
    }

    // secrets: count with key ilike
    try {
      const { count } = await supa
        .from("secrets")
        .select("id", { head: true, count: "exact" })
        .ilike("key", "spotify_%")
      secretsCount = count ?? 0
    } catch (e: any) {
      notes.push(`secrets count probe: ${e?.message || e}`)
    }
  } else {
    notes.push("no supabase admin client")
  }

  return NextResponse.json({
    cookies: { refresh: hasRefresh, access: hasAccess },
    settings_cols: settingsRow
      ? {
          has_access: settingsRow.spotify_access_token != null,
          has_refresh: settingsRow.spotify_refresh_token != null,
          expires_at: settingsRow.spotify_expires_at ?? null,
        }
      : null,
    settings_kv_count: settingsKVCount,
    oauth_tokens_count: oauthCount,
    secrets_count: secretsCount,
    session_code: sc,
    notes,
  })
}