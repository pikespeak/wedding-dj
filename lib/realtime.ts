// lib/realtime.ts
import { getSupabase } from "@/lib/supabase"

export type Unsubscribe = () => void

type PgEvent = "INSERT" | "UPDATE" | "DELETE" | "*"

export function subscribeTable<T = unknown>({
  table,
  onEvent,
  event = "*",
  filter, // z.B. `session_code=eq.GOCH-2026`
}: {
  table: "queue" | "now_playing" | "votes"
  onEvent: (payload: { eventType: PgEvent; new?: any; old?: any }) => void
  event?: PgEvent
  filter?: string
}): Unsubscribe {
  const supa = getSupabase()
  if (!supa) {
    console.warn("[realtime] supabase client missing")
    return () => {}
  }

  const channel = supa
    .channel(`realtime:${table}:${event}:${filter ?? "all"}`)
    .on(
      "postgres_changes",
      { event, schema: "public", table, filter },
      (payload) => {
        onEvent({
          eventType: (payload.eventType as PgEvent) ?? "*",
          new: payload.new,
          old: payload.old,
        })
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[realtime] subscribed -> ${table} (${event}) ${filter ?? ""}`)
      }
    })

  return () => {
    supa.removeChannel(channel)
    console.log(`[realtime] unsubscribed -> ${table}`)
  }
}