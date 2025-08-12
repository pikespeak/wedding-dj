import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const phase = body?.phase
  const allowed = ["warmup", "dinner", "dance", "peak", "cooldown", "auto"]
  if (!allowed.includes(phase)) {
    return NextResponse.json({ error: `phase must be one of ${allowed.join(", ")}` }, { status: 400 })
  }
  // TODO: Phase in Session speichern
  return NextResponse.json({ ok: true, phase })
}
