import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      email,
      nif,
      company,
      responsible,
      supplier,
      install_type,
      cycle,
      unit,
      start_date,
      term_months,
      avg_price_mwh,
      ref_price_mwh,
      deviation_abs,
      deviation_pct
    } = body;

    // 1. Garante lead (email)
    const { rows: leadRows } = await sql`
      INSERT INTO leads (email)
      VALUES (${email})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id
    `;
    const leadId = leadRows[0].id;

    // 2. Guarda instalação/simulação
    const { rows } = await sql`
      INSERT INTO installations (
        lead_id, nif, company, responsible,
        supplier, install_type, cycle, unit,
        start_date, term_months,
        avg_price_mwh, ref_price_mwh, deviation_abs, deviation_pct
      )
      VALUES (
        ${leadId}, ${nif}, ${company}, ${responsible},
        ${supplier}, ${install_type}, ${cycle}, ${unit},
        ${start_date}, ${term_months},
        ${avg_price_mwh}, ${ref_price_mwh}, ${deviation_abs}, ${deviation_pct}
      )
      RETURNING id, created_at
    `;

    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro" }, { status: 500 });
  }
}
