
# B2P Energy — Simulador OMIP (Next.js)

Simulador com validação de email via Emailable e confirmação por link (Resend).

## Variáveis de ambiente (Vercel → Project Settings → Environment Variables)
```
EMAILABLE_API_KEY=live_xxx
RESEND_API_KEY=re_xxx
EMAIL_FROM=B2P Energy <noreply@b2p.pt>
EMAIL_CONFIRM_SECRET=uma_string_longa_segura
APP_ORIGIN=https://simulador.b2p.pt
```

## Scripts
- `npm run dev` — desenvolvimento
- `npm run build` — build
- `npm start` — produção

## Notas
- O front chama os endpoints do backend. A API Key nunca é exposta ao cliente.
- Se `RESEND_API_KEY` não estiver definida, o endpoint de envio devolve `confirmUrl` no JSON para testes.
