import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get("email") || "";
    if (!email) return NextResponse.json({ error: "email requerido" }, { status: 400 });

    const rows = await sql`
      SELECT id, created_at, nif, supplier
      FROM simulations
      WHERE email = ${email}
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return NextResponse.json(rows.rows, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}
