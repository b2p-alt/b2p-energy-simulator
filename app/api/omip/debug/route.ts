import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET() {
  const c = await pool.connect();
  try {
    await c.query(`create table if not exists omip_monthly_prices (
      month_ym text primary key,
      price_eur_mwh double precision not null,
      source text
    )`);
    await c.query(`create table if not exists network_params (
      install_type text primary key,
      eric_eur_mwh double precision not null default 0,
      ren_eur_mwh double precision not null default 0,
      losses_percent double precision not null default 0,
      network_eur_mwh double precision not null default 0
    )`);
    await c.query(`insert into network_params(install_type) values ('MT'),('BTE'),('BTN')
                   on conflict (install_type) do nothing`);

    const omipCount = await c.query(`select count(*)::int as n from omip_monthly_prices`);
    const omipRange = await c.query(`select min(month_ym) as min, max(month_ym) as max from omip_monthly_prices`);
    const omipSample = await c.query(`
      select month_ym, price_eur_mwh, coalesce(source,'') as source
      from omip_monthly_prices
      order by month_ym asc
      limit 5
    `);
    const nets = await c.query(`
      select install_type, eric_eur_mwh, ren_eur_mwh, losses_percent, network_eur_mwh
      from network_params order by install_type asc
    `);

    return NextResponse.json({
      ok: true,
      omip: {
        count: omipCount.rows[0]?.n ?? 0,
        min: omipRange.rows[0]?.min ?? null,
        max: omipRange.rows[0]?.max ?? null,
        sample: omipSample.rows,
      },
      network_params: nets.rows,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "erro" }, { status: 500 });
  } finally {
    c.release();
  }
}
