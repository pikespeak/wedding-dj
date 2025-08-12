import { NextResponse } from "next/server"
import { pause } from "@/lib/spotify"

export async function POST() {
  const res = await pause()
  return NextResponse.json(res)
}
