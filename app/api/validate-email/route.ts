
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    const apiKey = process.env.EMAILABLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API key ausente" }, { status: 500 });

    const url = `https://api.emailable.com/v1/verify?email=${encodeURIComponent(email)}&api_key=${apiKey}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: "Falha Emailable" }, { status: 502 });
    const data = await r.json();
    const status = (data.state || data.result || data.status || "unknown").toLowerCase();

    if (["undeliverable", "disposable", "role"].includes(status)) {
      return NextResponse.json({ status, reason: "blocked" }, { status: 200 });
    }
    return NextResponse.json({ status, raw: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro" }, { status: 500 });
  }
}
