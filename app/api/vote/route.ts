import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const value = Number(body?.value)
  if (![1, -1].includes(value)) {
    return NextResponse.json({ error: "value must be +1 or -1" }, { status: 400 })
  }
  // TODO: Vote speichern, prospektiv werten
  return NextResponse.json({ status: "ok", value })
}
