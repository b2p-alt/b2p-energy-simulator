import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { sql } from "@/app/lib/db"; // <-- ADICIONE isto

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Token ausente" }, { status: 400 });

    const secretStr = process.env.EMAIL_CONFIRM_SECRET || "dev-secret";
    const secret = new TextEncoder().encode(secretStr);
    const { payload } = await jwtVerify(token, secret);
    const email = String(payload.email || "");

    // <-- UPSERT do utilizador verificado
    await sql`
      INSERT INTO users (email, verified_at)
      VALUES (${email}, now())
      ON CONFLICT (email) DO UPDATE SET verified_at = now()
    `;

    const res = NextResponse.redirect(new URL("/confirmed", req.url));
    res.cookies.set("b2p_ev", email, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Token inválido" }, { status: 400 });
  }
}
