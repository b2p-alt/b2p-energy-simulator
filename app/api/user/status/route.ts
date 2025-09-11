import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get("email") || "";
    if (!email) return NextResponse.json({ error: "email requerido" }, { status: 400 });

    const r = await sql`SELECT verified_at, terms_accepted, marketing_opt_in FROM users WHERE email = ${email}`;
    const row = r.rows[0];
    return NextResponse.json({
      verified: !!row?.verified_at,
      terms_accepted: !!row?.terms_accepted,
      marketing_opt_in: !!row?.marketing_opt_in,
    }, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}
