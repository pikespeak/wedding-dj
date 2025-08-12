// lib/appConfig.ts
export function sessionCode() {
  return process.env.NEXT_PUBLIC_APP_SESSION_CODE || process.env.APP_SESSION_CODE || "GOCH-2026"
}