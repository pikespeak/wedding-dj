import { NextResponse } from "next/server"
import { getRefreshToken } from "@/lib/spotify"

export async function GET() {
  try {
    const rt = await getRefreshToken()
    return NextResponse.json({ connected: !!rt })
  } catch {
    return NextResponse.json({ connected: false })
  }
}