import { getAdminSupabase } from "@/lib/supabase.server"
import { sessionCode } from "@/lib/appConfig"

const PROVIDER = "spotify"

export async function saveRefreshTokenServer(rt: string) {
  const supa = getAdminSupabase()
  if (!supa) throw new Error("supabase not configured")
  const { error } = await supa
    .from("oauth_tokens")
    .upsert({
      provider: PROVIDER,
      session_code: sessionCode(),
      refresh_token: rt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,session_code" })
  if (error) throw new Error(error.message)
}

export async function getRefreshTokenServer(): Promise<string | null> {
  const supa = getAdminSupabase()
  if (!supa) throw new Error("supabase not configured")
  const { data, error } = await supa
    .from("oauth_tokens")
    .select("refresh_token")
    .eq("provider", PROVIDER)
    .eq("session_code", sessionCode())
    .single()
  if (error) return null
  return (data as any)?.refresh_token || null
}