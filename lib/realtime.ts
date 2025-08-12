// sehr einfacher No-Op-Realtime-Stub
export type Unsubscribe = () => void

export function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  console.log("[realtime] subscribed to", channel)
  // Hier später echte Supabase Realtime-Subscription anschließen
  void cb as unknown
  return () => console.log("[realtime] unsubscribed from", channel)
}
