import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const u = new URL(req.url);
  const headers: Record<string, string> = {};
  for (const [k, v] of (req.headers as any).entries()) headers[k] = v;
  return NextResponse.json({ url: u.toString(), host: headers.host, xfh: headers["x-forwarded-host"], xfp: headers["x-forwarded-proto"] });
}