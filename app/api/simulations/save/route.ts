import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export const runtime = "nodejs";

type Prices = {
  ponta?: number|null; cheia?: number|null; vazio?: number|null; svazio?: number|null;
  simples?: number|null; bi_cheia?: number|null; bi_vazio?: number|null;
  tri_ponta?: number|null; tri_cheia?: number|null; tri_vazio?: number|null;
};

function toNumber(x:any){ const n = Number(x); return Number.isFinite(n) ? n : null; }

function avgClientMWh(unit: "/MWh"|"/kWh", install_type: string, cycle: string, p: Prices) {
  let vals:number[] = [];
  const push = (v:any)=>{ const n=toNumber(v); if(n!=null) vals.push(unit==="/kWh"? n*1000 : n); };
  if (install_type === "MT" || install_type === "BTE") {
    push(p.ponta); push(p.cheia); push(p.vazio); push(p.svazio);
  } else {
    if (cycle === "Simples") push(p.simples);
    else if (cycle === "Bi-horário") { push(p.bi_cheia); push(p.bi_vazio); }
    else { push(p.tri_ponta); push(p.tri_cheia); push(p.tri_vazio); }
  }
  if (!vals.length) return null;
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const email = String(body.email||"");
    if (!email) return NextResponse.json({ error:"email requerido" }, { status:400 });

    // garante que o user existe
    await sql`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;

    const install_type = String(body.install_type||"");
    const cycle = String(body.cycle||"");
    const unit = body.unit === "/kWh" ? "/kWh" : "/MWh";
    const start_date = String(body.start_date||"");
    const term_months = Number(body.term_months||0);

    if (!install_type || !cycle || !start_date || !term_months) {
      return NextResponse.json({ error:"parâmetros obrigatórios ausentes" }, { status:400 });
    }

    const prices: Prices = {
      ponta: toNumber(body.ponta), cheia: toNumber(body.cheia), vazio: toNumber(body.vazio), svazio: toNumber(body.svazio),
      simples: toNumber(body.simples), bi_cheia: toNumber(body.bi_cheia), bi_vazio: toNumber(body.bi_vazio),
      tri_ponta: toNumber(body.tri_ponta), tri_cheia: toNumber(body.tri_cheia), tri_vazio: toNumber(body.tri_vazio),
    };

    const client_prices_include_networks = !!body.client_prices_include_networks;
    const annual_consumption_mwh = toNumber(body.annual_consumption_mwh);

    // 1) média do cliente
    const avg_client_mwh = avgClientMWh(unit, install_type, cycle, prices);

    // 2) redes médias do período (TODO: quando alimentarmos network_tariffs)
    // por enquanto 0 para não travar
    const networks_avg_mwh = 0;

    // Se cliente informou com redes, removemos redes p/ comparar a um ref "sem redes"
    const avg_client_wo_networks = avg_client_mwh==null ? null : Math.max(0, avg_client_mwh - (client_prices_include_networks ? networks_avg_mwh : 0));

    // 3) referência de mercado (reuso do endpoint interno)
    const origin = process.env.APP_ORIGIN || req.nextUrl.origin;
    const yyyyMM = new Date(start_date); const m = `${yyyyMM.getUTCFullYear()}-${String(yyyyMM.getUTCMonth()+1).padStart(2,"0")}`;
    const url = new URL(`${origin}/api/quote/market-average`);
    url.searchParams.set("start", m);
    url.searchParams.set("months", String(term_months));

    const refRes = await fetch(url.toString(), { cache:"no-store" });
    if (!refRes.ok) return NextResponse.json({ error:"falha ref mercado" }, { status:502 });
    const ref = await refRes.json();

    const avg_omip_mwh = ref?.avg_omip ?? null;
    const ref_price_mwh = ref?.ref_price_mwh ?? null;

    let deviation_abs: number|null = null;
    let deviation_pct: number|null = null;
    if (avg_client_wo_networks!=null && ref_price_mwh!=null) {
      deviation_abs = avg_client_wo_networks - ref_price_mwh;
      deviation_pct = ref_price_mwh !== 0 ? (deviation_abs / ref_price_mwh) * 100 : null;
    }

    // 4) grava simulação
    const ins = await sql<{id:string}>`
      INSERT INTO simulations (
        email, nif, company, responsavel, supplier,
        install_type, cycle, unit, start_date, term_months,
        annual_consumption_mwh,
        ponta, cheia, vazio, svazio,
        simples, bi_cheia, bi_vazio, tri_ponta, tri_cheia, tri_vazio,
        client_prices_include_networks,
        avg_price_mwh_client, avg_omip_mwh, ref_price_mwh, deviation_abs, deviation_pct
      ) VALUES (
        ${email}, ${body.nif||null}, ${body.company||null}, ${body.responsavel||null}, ${body.supplier||null},
        ${install_type}, ${cycle}, ${unit}, ${start_date}, ${term_months},
        ${annual_consumption_mwh},
        ${prices.ponta}, ${prices.cheia}, ${prices.vazio}, ${prices.svazio},
        ${prices.simples}, ${prices.bi_cheia}, ${prices.bi_vazio}, ${prices.tri_ponta}, ${prices.tri_cheia}, ${prices.tri_vazio},
        ${client_prices_include_networks},
        ${avg_client_wo_networks}, ${avg_omip_mwh}, ${ref_price_mwh}, ${deviation_abs}, ${deviation_pct}
      )
      RETURNING id
    `;

    return NextResponse.json({ ok:true, simulation_id: ins.rows[0].id }, { status:200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "erro" }, { status:500 });
  }
}
