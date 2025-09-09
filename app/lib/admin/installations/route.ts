import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { rows } = await sql`
    SELECT i.id, i.created_at, l.email, i.nif, i.company, i.supplier,
           i.install_type, i.cycle, i.unit, i.start_date, i.term_months,
           i.avg_price_mwh, i.ref_price_mwh, i.deviation_abs, i.deviation_pct
    FROM installations i
    LEFT JOIN leads l ON l.id = i.lead_id
    ORDER BY i.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json(rows);
}
