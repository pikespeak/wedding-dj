// lib/realtime.ts
import { getSupabase } from "@/lib/supabase"

type PgEvent = "INSERT" | "UPDATE" | "DELETE" | "*"
type Args = {
  table: "queue" | "now_playing" | "votes" | "requests" | string
  event?: PgEvent
  filter?: string
  onEvent: (payload: { eventType: PgEvent; new?: any; old?: any }) => void
}

/** Realtime subscribe helper (client) */
export function subscribeTable({ table, event = "*", filter, onEvent }: Args) {
  const supa = getSupabase()
  if (!supa) {
    // Kein Client verfügbar (sollte im Browser nicht passieren)
    return () => {}
  }

  const channel = supa
    .channel(`realtime:${table}`)
    // Types des Pakets variieren je nach Version – daher TS‑Ignore:
    // @ts-expect-error Supabase typings mismatch in this version
    .on("postgres_changes", { event, schema: "public", table, filter }, (payload: any) => {
      onEvent({
        eventType: (payload?.eventType || "*") as PgEvent,
        new: payload?.new,
        old: payload?.old,
      })
    })
    .subscribe()

  return () => {
    supa.removeChannel(channel)
  }
}