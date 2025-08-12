import { createClient, SupabaseClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE

if (!url || !serviceKey) {
  console.warn("[supabase:server] Missing URL or SERVICE ROLE key")
}

let _admin: SupabaseClient | null = null

export function getAdminSupabase() {
  if (_admin) return _admin
  if (!url || !serviceKey) return null
  _admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  return _admin
}