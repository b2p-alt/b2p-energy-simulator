"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function OmipUploadPage() {
  const searchParams = useSearchParams();
  const key = searchParams.get("key") || "";

  const [stats, setStats] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!key) return;
    fetch(`/api/admin/omip-upload?key=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, [key]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!key) {
      setMsg("Falta ?key=ADMIN_KEY na URL.");
      return;
    }
    setMsg("A enviar...");

    const form = new FormData(e.currentTarget);
    const r = await fetch(
      `/api/admin/omip-upload?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        body: form,
      }
    );

    const data = await r.json();
    if (!r.ok) {
      setMsg(`Erro: ${data?.error || "falha no upload"}`);
      return;
    }
    setMsg(`OK: ${data.inserted} registos atualizados.`);

    // refrescar resumo
    fetch(`/api/admin/omip-upload?key=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Upload de OMIP mensal</h1>

      {!key && (
        <div className="rounded-md border p-3 text-sm">
          Falta <code>?key=ADMIN_KEY</code> na URL.
        </div>
      )}

      <div className="rounded-xl border p-4 bg-white">
        <form onSubmit={onSubmit} className="space-y-3">
          <input type="file" name="file" accept=".csv,text/csv" required />
          <div className="text-xs text-slate-600">
            CSV com colunas <code>month</code>, <code>price_eur_mwh</code>{" "}
            (opcional <code>source</code>). Exemplos de{" "}
            <code>month</code>: <code>2025-11</code>, <code>2025-11-01</code>,{" "}
            <code>11/2025</code>.
          </div>
          <button className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm">
            Enviar ficheiro
          </button>
          {msg && <div className="text-sm mt-2">{msg}</div>}
        </form>
      </div>

      {stats && (
        <div className="rounded-xl border p-4 bg-white">
          <div className="text-sm text-slate-700">
            Total de meses na base: <strong>{stats.total}</strong>
          </div>
          <div className="mt-3 text-sm">
            <div className="font-medium">Últimos meses:</div>
            <ul className="list-disc ml-5">
              {stats.latest?.map((r: any) => (
                <li key={r.month}>
                  {new Date(r.month).toISOString().slice(0, 7)} →{" "}
                  {Number(r.price_eur_mwh).toFixed(2)} €/MWh
                  {r.source ? ` (${r.source})` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
