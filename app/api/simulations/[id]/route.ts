import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  try {
    const id = params.id;
    const r = await sql`SELECT * FROM simulations WHERE id = ${id}`;
    if (!r.rows.length) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(r.rows[0], { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}
