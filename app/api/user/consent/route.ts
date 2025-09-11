import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, termsAccepted, marketingOptIn } = await req.json() as {
      email: string; termsAccepted?: boolean; marketingOptIn?: boolean;
    };
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email inválido" }, { status: 400 });
    }

    // Garante user
    await sql`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;

    if (termsAccepted === true) {
      await sql`UPDATE users SET terms_accepted = true, terms_accepted_at = now() WHERE email = ${email}`;
    }
    if (marketingOptIn === true) {
      await sql`UPDATE users SET marketing_opt_in = true, marketing_opt_in_at = now() WHERE email = ${email}`;
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}
