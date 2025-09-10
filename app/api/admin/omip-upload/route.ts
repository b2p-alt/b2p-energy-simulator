export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

function parseMonthToISO(m: string): string | null {
  const s = m.trim();
  let m1 = s.match(/^(\d{4})[-\/](\d{1,2})$/);              // YYYY-MM / YYYY/MM
  if (m1) {
    const y = Number(m1[1]); const mm = Number(m1[2]) - 1;
    return new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 10);
  }
  m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);             // YYYY-MM-DD
  if (m1) {
    const y = Number(m1[1]); const mm = Number(m1[2]) - 1;
    return new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 10);
  }
  m1 = s.match(/^(\d{1,2})\/(\d{4})$/);                      // MM/YYYY
  if (m1) {
    const mm = Number(m1[1]) - 1; const y = Number(m1[2]);
    return new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 10);
  }
  m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);           // DD/MM/YYYY
  if (m1) {
    const mm = Number(m1[2]) - 1; const y = Number(m1[3]);
    return new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 10);
  }
  return null;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  if (firstLine.includes(";")) return ";";
  if (firstLine.includes("\t")) return "\t";
  return ",";
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "";
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const latest = await sql`
    SELECT month, price_eur_mwh, source
    FROM omip_monthly
    ORDER BY month DESC
    LIMIT 12
  `;
  const total = await sql`SELECT COUNT(*)::int AS total FROM omip_monthly`;
  return NextResponse.json({ total: total.rows[0].total, latest: latest.rows });
}

export async function POST(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file missing" }, { status: 400 });
    }

    const text = await (file as File).text();
    const delim = detectDelimiter(text);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return NextResponse.json({ error: "empty file" }, { status: 400 });
    }

    const header = lines[0].split(delim).map((h) => h.trim().toLowerCase());
    const idxMonth = header.findIndex((h) => ["month", "mes", "mês"].includes(h));
    const idxPrice = header.findIndex((h) => h.includes("price"));
    const idxSource = header.findIndex((h) => h === "source");
    if (idxMonth < 0 || idxPrice < 0) {
      return NextResponse.json({ error: "missing columns: month, price_eur_mwh" }, { status: 400 });
    }

    const parsed: { month: string; price: number; source: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delim);
      if (parts.length < 2) continue;
      const monthISO = parseMonthToISO(parts[idxMonth]);
      if (!monthISO) continue;
      const raw = String(parts[idxPrice]).replace(",", ".");
      const price = Number(raw);
      if (!Number.isFinite(price)) continue;
      const source = idxSource >= 0 ? String(parts[idxSource]).trim() : "upload";
      parsed.push({ month: monthISO, price, source });
    }

    if (!parsed.length) {
      return NextResponse.json({ error: "no valid rows" }, { status: 400 });
    }

let inserted = 0;
for (const r of parsed) {
  await sql`
    INSERT INTO omip_monthly (month, price_eur_mwh, source)
    VALUES (${r.month}, ${r.price}, ${r.source})
    ON CONFLICT (month) DO UPDATE
      SET price_eur_mwh = EXCLUDED.price_eur_mwh,
          source = EXCLUDED.source,
          updated_at = now()
  `;
  inserted++;
}

return NextResponse.json({ ok: true, inserted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "upload error" }, { status: 500 });
  }
}
