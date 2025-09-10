// app/api/omip/ref/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db"; // se alias der erro, troque para "../../../lib/db"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aceita "YYYY-MM" ou "YYYY-MM-DD" e normaliza para primeiro dia do mês (ISO)
function normalizeStartToISO(start: string): string | null {
  const s = (start || "").trim();
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
    const key = sp.get("key") || "";
    const startStr = sp.get("start") || "";
    const months = Number(sp.get("months") || "0");

    // 🔐 Autenticação simples por key
    if (key !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startISO = normalizeStartToISO(startStr);
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

    // 1) Média OMIP no período
    const res = await sql`
      SELECT month, price_eur_mwh
      FROM omip_monthly
      WHERE month >= ${startISO} AND month < ${endISO}
      ORDER BY month ASC
    `;
    const rows = res.rows as Array<{ month: string; price_eur_mwh: number }>;
    const months_found = rows.length;
    const avg_omip =
      months_found > 0
        ? rows.reduce((s, r) => s + Number(r.price_eur_mwh), 0) / months_found
        : 0;

    // 2) Lê ERIC, REN e perdas (%) do admin_settings
    const settingsRes = await sql`
      SELECT key, value FROM admin_settings
      WHERE key IN ('eric', 'ren', 'perdas_percent')
    `;
    const settings = new Map<string, number>(
      settingsRes.rows.map((r: any) => [r.key, Number(r.value)])
    );
    const eric = settings.get("eric") || 0;
    const ren = settings.get("ren") || 0;
    const perdas_percent = settings.get("perdas_percent") || 0;
    const perdas = perdas_percent / 100;

    // 3) Fórmula final
    const ref_price_mwh = (avg_omip + eric + ren) * (1 + perdas);

    return NextResponse.json({
      start: startISO,
      end: endISO,
      months,
      months_found,
      avg_omip,
      eric,
      ren,
      perdas_percent,
      ref_price_mwh,
      rows, // opcional: devolvemos os meses usados para transparência
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro" }, { status: 500 });
  }
}
