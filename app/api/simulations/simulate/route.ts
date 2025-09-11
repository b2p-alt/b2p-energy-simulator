// app/api/simulations/simulate/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Cria o esquema canónico se não existir.
// Tabelas utilizadas:
// - omip_monthly_prices(month_ym TEXT PK 'YYYY-MM', price_eur_mwh DOUBLE PRECISION, source TEXT)
// - network_params(install_type TEXT PK, eric_eur_mwh DOUBLE PRECISION, ren_eur_mwh DOUBLE PRECISION,
//                  losses_percent DOUBLE PRECISION, network_eur_mwh DOUBLE PRECISION)
async function ensureSchema() {
  const sql = `
  create table if not exists omip_monthly_prices (
    month_ym text primary key,
    price_eur_mwh double precision not null,
    source text
  );
  create table if not exists network_params (
    install_type text primary key,
    eric_eur_mwh double precision not null default 0,
    ren_eur_mwh double precision not null default 0,
    losses_percent double precision not null default 0,
    network_eur_mwh double precision not null default 0
  );
  insert into network_params (install_type, eric_eur_mwh, ren_eur_mwh, losses_percent, network_eur_mwh)
  values ('MT',0,0,0,0),('BTE',0,0,0,0),('BTN',0,0,0,0)
  on conflict (install_type) do nothing;
  `;
  const c = await pool.connect();
  try { await c.query(sql); } finally { c.release(); }
}

function ymList(startISO: string, months: number): string[] {
  const d0 = new Date(startISO);
  const start = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1));
  const out: string[] = [];
  for (let i = 0; i < (months || 0); i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function parsePtNumber(s: string): number {
  const n = Number(String(s ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
const toMWh = (v: number, unit: "/MWh" | "/kWh") => (unit === "/kWh" ? v * 1000 : v);

type Body = {
  install_type: "MT" | "BTE" | "BTN";
  cycle: string; // mantido para futura extensão
  unit: "/MWh" | "/kWh";
  start_date: string;   // YYYY-MM-DD
  term_months: number;  // ex.: 12
  include_networks?: boolean;
  prices: Record<string, string>; // apenas os campos visíveis no formulário
};

export async function POST(req: Request) {
  await ensureSchema();

  const body = (await req.json()) as Body;

  // 1) Média do cliente (€/MWh)
  const inputVals = Object.values(body.prices ?? {})
    .map(parsePtNumber)
    .filter((n) => Number.isFinite(n)) as number[];
  const clientAvgMWh =
    inputVals.length ? toMWh(inputVals.reduce((a, b) => a + b, 0) / inputVals.length, body.unit) : NaN;

  // 2) Meses alvo
  const monthsYM = ymList(body.start_date, body.term_months);

  const c = await pool.connect();
  try {
    // 3) OMIP médio do período
    const { rows: omipRows } = await c.query(
      `select month_ym, price_eur_mwh::float as price
         from omip_monthly_prices
        where month_ym = any($1::text[])
        order by month_ym asc`,
      [monthsYM]
    );
    const map = new Map<string, number>();
    omipRows.forEach((r) => map.set(r.month_ym, Number(r.price)));

    const found = monthsYM.filter((m) => map.has(m));
    const missing = monthsYM.filter((m) => !map.has(m));
    const omipVals = found.map((m) => map.get(m)!) as number[];
    const omipAvgMWh =
      omipVals.length ? omipVals.reduce((a, b) => a + b, 0) / omipVals.length : NaN;

    // 4) Parâmetros de rede
    const { rows: netRows } = await c.query(
      `select
         eric_eur_mwh::float   as eric,
         ren_eur_mwh::float    as ren,
         losses_percent::float as losses_pct,
         network_eur_mwh::float as rede
       from network_params
      where install_type = $1
      limit 1`,
      [body.install_type]
    );
    const net = netRows[0] || { eric: 0, ren: 0, losses_pct: 0, rede: 0 };

    // 5) Referência de mercado (€/MWh)
    const referenceMWh = Number.isFinite(omipAvgMWh)
      ? (omipAvgMWh + net.eric + net.ren) * (1 + (net.losses_pct || 0) / 100)
      : NaN;

    // 6) Preço do cliente "energia" (se inclui redes, subtrai o preço de rede)
    const clientEnergyAvgMWh =
      Number.isFinite(clientAvgMWh)
        ? clientAvgMWh - (body.include_networks ? (net.rede || 0) : 0)
        : NaN;

    // 7) Desvios
    const deviationAbs =
      Number.isFinite(clientEnergyAvgMWh) && Number.isFinite(referenceMWh)
        ? clientEnergyAvgMWh - referenceMWh
        : NaN;
    const deviationPct =
      Number.isFinite(deviationAbs) && Number.isFinite(referenceMWh) && referenceMWh !== 0
        ? (deviationAbs / referenceMWh) * 100
        : NaN;

    return NextResponse.json({
      ok: true,
      months_used: found,
      months_missing: missing,
      omip_avg_mwh: omipAvgMWh,
      eric_eur_mwh: net.eric ?? 0,
      ren_eur_mwh: net.ren ?? 0,
      losses_percent: net.losses_pct ?? 0,
      network_eur_mwh: net.rede ?? 0,
      reference_mwh: referenceMWh,
      client_avg_mwh: clientAvgMWh,
      client_energy_avg_mwh: clientEnergyAvgMWh,
      deviation_abs_mwh: deviationAbs,
      deviation_pct: deviationPct,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro na simulação" }, { status: 500 });
  } finally {
    c.release();
  }
}
