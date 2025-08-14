// lib/runtimeUrl.ts
export function getOriginFromRequest(req?: Request): string {
  // Client
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin
  }
  // Server: Forwarded-Header respektieren (Vercel/Proxy), sonst URL
  if (req) {
    const u = new URL(req.url)
    const h = req.headers
    const proto = (h.get("x-forwarded-proto") || u.protocol.replace(":", "")).trim()
    const host  = (h.get("x-forwarded-host") || h.get("host") || u.host).trim()
    return `${proto}://${host}`
  }
  // Dev-Fallback
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
}

export function absoluteUrl(req: Request | undefined, path: string): string {
  return new URL(path, getOriginFromRequest(req)).toString()
}