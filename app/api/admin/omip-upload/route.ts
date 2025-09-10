import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

function parseMonthToISO(m: string): string | null {
  const s = m.trim();
  // YYYY-MM or YYYY/MM
  let m1 = s.match(/^(\d{4})[-\/](\d{1,2})$/);
  if (m1) {
    const y = Number(m1[1]); const mm = Number(m1[2]) - 1;
    const d = new Date(Date.UTC(y, mm, 1));
    return d.toISOString().slice(0,10);
  }
  // YYYY-MM-DD
  m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m1) {
    const y = Number(m1[1]); const mm = Number(m1[2]) - 1;
    const d = new Date(Date.UTC(y, mm, 1));
    return d.toISOString().slice(0,10);
  }
  // MM/YYYY or DD/MM/YYYY
  m1 = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const mm = Number(m1[1]) - 1; const y = Number(m1[2]);
    const d = new Date(Date.UTC(y, mm, 1));
    return d.toISOString().slice(0,10);
  }
  m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const mm = Number(m1[2]) - 1; const y = Number(m1[3]);
    const d = new Date(Date.UTC(y, mm, 1));
    return d.toISOString().slice(0,10);
  }
  return null;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || "";
  if (firstLine.includes(";")) return ";";
  if (firstLine.includes("\t")) return "\t";
  return ",";
}

export async function GET(req: NextRequest) {
  // pequeno resumo para o admin (contagem e últimos meses)
  const key = req.nextUrl.searchParams.get("key") || "";
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { rows } = await sql`
    SELECT month, price_eur_mwh, source
      FROM omip_monthly
     ORDER BY month DESC
     LIMIT 12
  `;
  const { rows: count } = await sql`SELECT COUNT(*)::int AS total FROM omip_monthly`;
  return NextResponse.json({ total: count[0].total, latest: rows });
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

    const text = await file.text();
    const delim = detectDelimiter(text);
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (lines.length < 2) return NextResponse.json({ error: "empty file" }, { status: 400 });

    // header
    const header = lines[0].split(delim).map(h => h.trim().toLowerCase());
    const idxMonth = header.findIndex(h => ["month","mes","mês"].includes(h));
    const idxPrice = header.findIndex(h => h.includes("price"));
    const idxSource = header.findIndex(h => h === "source");

    if (idxMonth < 0 || idxPrice < 0) {
      return NextResponse.json({ error: "missing columns: month, price_eur_mwh" }, { status: 400 });
    }

    const rows: { month: string; price: number; source: string }[] = [];
    for (let i=1; i<lines.length; i++) {
      const parts = lines[i].split(delim);
      if (parts.length < 2) continue;
      const monthISO = parseMonthToISO(parts[idxMonth]);
      if (!monthISO) continue;
      const raw = String(parts[idxPrice]).replace(",", ".");
      const price = Number(raw);
      if (!Number.isFinite(price)) continue;
      const source = idxSource >= 0 ? String(parts[idxSource]).trim() : "upload";
      rows.push({ month: monthISO, price, source });
    }

    if (!rows.length) return NextResponse.json({ error: "no valid rows" }, { status: 400 });

    // monta VALUES (...) , (...) , (...)
    const values = rows.map(r => sql`(${r.month}, ${r.price}, ${r.source})`);
    await sql`
      INSERT INTO omip_monthly (month, price_eur_mwh, source)
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (month) DO UPDATE
        SET price_eur_mwh = EXCLUDED.price_eur_mwh,
            source = EXCLUDED.source,
            updated_at = now()
    `;

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "upload error" }, { status: 500 });
  }
}
