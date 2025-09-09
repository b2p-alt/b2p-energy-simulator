import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export async function GET(req: NextRequest) {
  const startStr = req.nextUrl.searchParams.get("start");
  const monthsStr = req.nextUrl.searchParams.get("months") || "12";
  if (!startStr) return NextResponse.json({ error: "start ausente" }, { status: 400 });

  const start = new Date(startStr);
  const months = Math.max(1, Math.min(120, parseInt(monthsStr, 10) || 12));
  const startMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + months, 1));

  // Busca OMIP no intervalo
  const { rows: omip } = await sql`
    SELECT month, price_eur_mwh
      FROM omip_monthly
     WHERE month >= ${startMonth.toISOString().slice(0,10)}
       AND month <  ${endMonth.toISOString().slice(0,10)}
     ORDER BY month
  `;
  if (!omip.length) return NextResponse.json({ error: "Sem OMIP para o período" }, { status: 404 });

  // Lê os parâmetros globais
  const { rows: s } = await sql`SELECT losses_pct, eric_eur_mwh, ren_eur_mwh FROM admin_settings WHERE id = TRUE`;
  const { losses_pct, eric_eur_mwh, ren_eur_mwh } = s[0];

  // Média OMIP do período
  const omipAvg =
    omip.reduce((sum, r) => sum + Number(r.price_eur_mwh), 0) / omip.length;

  // Fórmula: (OMIP_média + ERIC + REN) * (1 + perdas/100)
  const marketRef =
    (omipAvg + Number(eric_eur_mwh) + Number(ren_eur_mwh)) * (1 + Number(losses_pct) / 100);

  return NextResponse.json({
    start: startMonth.toISOString().slice(0,10),
    months,
    omip_count: omip.length,
    omip_avg_eur_mwh: Number(omipAvg.toFixed(6)),
    params: {
      losses_pct: Number(losses_pct),
      eric_eur_mwh: Number(eric_eur_mwh),
      ren_eur_mwh: Number(ren_eur_mwh),
    },
    market_ref_eur_mwh: Number(marketRef.toFixed(6))
  });
}
