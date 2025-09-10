// app/api/omip/ref/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // não cachear

export async function GET(req: NextRequest) {
  try {
    // 1) autenticação simples por querystring (mesmo esquema das outras rotas admin)
    const key = req.nextUrl.searchParams.get("key") || "";
    if (!key || key !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 2) parâmetros: start=YYYY-MM e months=N
    const startStr = req.nextUrl.searchParams.get("start"); // ex.: 2025-11
    const monthsStr = req.nextUrl.searchParams.get("months"); // ex.: 24

    if (!startStr || !/^\d{4}-\d{2}$/.test(startStr)) {
      return NextResponse.json({ error: "invalid start (use YYYY-MM)" }, { status: 400 });
    }
    const months = Math.max(1, Math.min(120, Number(monthsStr ?? 1)));

    const [yy, mm] = startStr.split("-").map(Number);
    // primeiro dia do mês em UTC
    const start = new Date(Date.UTC(yy, mm - 1, 1, 0, 0, 0));
    // end = start + months meses
    const end = new Date(Date.UTC(yy, mm - 1 + months, 1, 0, 0, 0));

    // 3) lê preços OMIP no intervalo
    const pricesRes = await sql/*sql*/`
      SELECT month, price_eur_mwh::numeric
      FROM omip_monthly
      WHERE month >= ${start.toISOString()}::timestamptz
        AND month <  ${end.toISOString()}::timestamptz
      ORDER BY month
    `;

    const rows: Array<{ month: string; price_eur_mwh: string }> = pricesRes.rows as any;
    const months_found = rows.length;

    const avg_omip =
      months_found > 0
        ? rows.reduce((s, r) => s + Number(r.price_eur_mwh), 0) / months_found
        : null;

    // 4) lê parâmetros em admin_settings (seu esquema atual)
    const settingsRes = await sql/*sql*/`
      SELECT losses_pct, eric_eur_mwh, ren_eur_mwh
      FROM admin_settings
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const s = settingsRes.rows[0] || {};
    const perdas_percent = Number(s.losses_pct ?? 0);
    const eric = Number(s.eric_eur_mwh ?? 0);
    const ren  = Number(s.ren_eur_mwh  ?? 0);

    // 5) cálculo da referência:
    // (MÉDIA OMIP + ERIC + REN) * (1 + perdas%/100)
    const ref_price_mwh =
      avg_omip == null
        ? null
        : (avg_omip + eric + ren) * (1 + perdas_percent / 100);

    return NextResponse.json({
      start: start.toISOString().slice(0, 10),
      end:   end.toISOString().slice(0, 10),
      months,
      months_found,
      avg_omip,
      eric,
      ren,
      perdas_percent,
      ref_price_mwh,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
