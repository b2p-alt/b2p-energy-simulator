
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const emailParam = req.nextUrl.searchParams.get("email") || "";
  const cookie = req.cookies.get("b2p_ev")?.value || "";
  const verified = !!emailParam && !!cookie && cookie.toLowerCase() === emailParam.toLowerCase();
  return NextResponse.json({ verified }, { status: 200 });
}
