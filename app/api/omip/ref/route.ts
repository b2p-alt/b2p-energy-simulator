export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db"; // se der erro de alias, troque para "../../../lib/db"

function parseStart(start: string): string | null {
  const s = (start || "").trim();
  // aceita "YYYY-MM" ou "YYYY-MM-DD"
  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const y = +m[1], mm = +m[2] - 1;
    return new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 10);
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = +m[1], mm = +m[2] - 1;
    return new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 10);
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const startStr = sp.get("start") || "";
    const months = Number(sp.get("months") || "12");

    const startISO = parseStart(startStr);
    if (!startISO || !Number.isFinite(months) || months <= 0) {
      return NextResponse.json(
        { error: "Parâmetros inválidos. Use ?start=YYYY-MM e ?months=N" },
        { status: 400 }
      );
    }

    // end exclusive
    const end = new Date(startISO);
    end.setUTCMonth(end.getUTCMonth() + months);
    const endISO = end.toISOString().slice(0, 10);

    // média OMIP no período
    const avgRes = await sql`
      SELECT AVG(price_eur_mwh)::float AS avg_omip, COUNT(*)::int AS n
      FROM omip_monthly
      WHERE month >= ${startISO} AND month < ${endISO}
    `;
    const avg_omip = Number(avgRes.rows?.[0]?.avg_omip || 0);
    const months_found = Number(avgRes.rows?.[0]?.n || 0);

    // lê ERIC, REN e perdas (%) do admin_settings
    const sres = await sql`
      SELECT key, value FROM admin_settings
      WHERE key IN ('eric', 'ren', 'perdas_percent')
    `;
    const map = new Map<string, number>(
      sres.rows.map((r: any) => [r.key, Number(r.value)])
    );

    const eric = map.get("eric") || 0;
    const ren = map.get("ren") || 0;
    const perdasPct = map.get("perdas_percent") || 0;
    const perdas = perdasPct / 100;

    // Fórmula: (Média OMIP + ERIC + REN) * (1 + Perdas%)
    const ref_price_mwh = (avg_omip + eric + ren) * (1 + perdas);

    return NextResponse.json({
      start: startISO,
      end: endISO,
      months,
      months_found,
      avg_omip,
      eric,
      ren,
      perdas_percent: perdasPct,
      ref_price_mwh,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro" }, { status: 500 });
  }
}
