// app/api/quote/market-average/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

// Mes "YYYY-MM" -> Date ISO (primeiro dia mês)
function parseYYYYMM(yyyyMM: string): string | null {
  const m = yyyyMM.trim();
  const parts = m.split("-");
  if (parts.length !== 2) return null;
  const [y, mon] = parts;
  const year = Number(y), month = Number(mon);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1)).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const startParam = req.nextUrl.searchParams.get("start") || ""; // ex. "2025-11"
    const monthsParam = req.nextUrl.searchParams.get("months") || "0";
    const startIso = parseYYYYMM(startParam);
    const months = Number(monthsParam);

    if (!startIso || !Number.isFinite(months) || months <= 0) {
      return NextResponse.json({ error: "invalid params" }, { status: 400 });
    }

    // Buscar OMIP do período
    const rowsRes = await sql`
      SELECT month, price_eur_mwh
      FROM omip_monthly
      WHERE month >= ${startIso}
      ORDER BY month ASC
      LIMIT ${months}
    `;

    const rows = rowsRes.rows as { month: string; price_eur_mwh: any }[];
    const months_found = rows.length;

    // Carregar settings admin (perdas, eric, ren)
    const settingsRes = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'admin_settings'
    `;

    // Se a tua tabela admin_settings já está nas colunas (losses_pct, eric_eur_mwh, ren_eur_mwh)
    const adminRes = await sql`SELECT losses_pct, eric_eur_mwh, ren_eur_mwh FROM admin_settings LIMIT 1`;
    const admin = adminRes.rows[0] || { losses_pct: 7, eric_eur_mwh: 3, ren_eur_mwh: 1.5 };
    const perdas_percent = Number(admin.losses_pct) || 7;
    const eric = Number(admin.eric_eur_mwh) || 3;
    const ren  = Number(admin.ren_eur_mwh)  || 1.5;

    // Média OMIP do período
    const avg_omip = months_found
      ? rows.reduce((s, r) => s + Number(r.price_eur_mwh), 0) / months_found
      : null;

    // Referência = (OMIP + ERIC + REN) * (1 + perdas%)
    const ref_price_mwh =
      avg_omip == null ? null : (avg_omip + eric + ren) * (1 + perdas_percent / 100);

    return NextResponse.json({
      start: `${startParam}-01`,
      end: rows[rows.length - 1]?.month || null,
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
    return NextResponse.json({ error: e?.message || "server error" }, { status: 500 });
  }
}
