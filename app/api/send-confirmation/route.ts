
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    const origin = process.env.APP_ORIGIN || req.nextUrl.origin;
    const secretStr = process.env.EMAIL_CONFIRM_SECRET || "dev-secret";
    const secret = new TextEncoder().encode(secretStr);

    const token = await new SignJWT({ email })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("60m")
      .sign(secret);

    const confirmUrl = `${origin}/api/confirm?token=${encodeURIComponent(token)}`;

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const EMAIL_FROM = process.env.EMAIL_FROM || "B2P Energy <noreply@b2p.pt>";

    if (!RESEND_API_KEY) {
      return NextResponse.json({ ok: true, confirmUrl }, { status: 200 });
    }

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: email,
        subject: "Confirme o seu email — B2P Energy",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5">
            <h2>Confirmar email</h2>
            <p>Para continuar com o simulador B2P Energy, confirme o seu email:</p>
            <p><a href="${confirmUrl}" style="display:inline-block;padding:10px 16px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:8px">Confirmar email</a></p>
            <p>Se não foi você que solicitou, ignore esta mensagem.</p>
          </div>`,
      }),
    });

    if (!r.ok) return NextResponse.json({ error: "Falha ao enviar email" }, { status: 502 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro" }, { status: 500 });
  }
}
