import { createClient, SupabaseClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

let _client: SupabaseClient | null = null

export function getSupabase() {
  if (_client) return _client
  if (!url || !anonKey) return null
  _client = createClient(url, anonKey)
  return _client
}
