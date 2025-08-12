import { NextResponse } from "next/server"
import { play } from "@/lib/spotify"

export async function POST() {
  const res = await play()
  return NextResponse.json(res)
}
