// app/api/omip/ref/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  const start = searchParams.get("start");
  const months = parseInt(searchParams.get("months") || "0");

  // 🔑 valida admin key
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!start || !months) {
    return NextResponse.json(
      { error: "Missing start or months" },
      { status: 400 }
    );
  }

  try {
    const rows = await sql`
      SELECT month, price_eur_mwh
      FROM omip_monthly
      WHERE month >= ${start}
      ORDER BY month ASC
      LIMIT ${months};
    `;

    return NextResponse.json({
      start,
      months,
      avg: rows.length
        ? rows.reduce((s, r) => s + Number(r.price_eur_mwh), 0) / rows.length
        : null,
      rows,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
