"use client";
import { useEffect, useState } from "react";

function fmt(n:any){ return n==null? "—" : `${Number(n).toFixed(2)} €/MWh`; }
function fmtPct(n:any){ return n==null? "—" : `${Number(n).toFixed(1)}%`; }

export default function AdminPage({ searchParams }: any) {
  const key = searchParams?.key || "";
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!key) return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/installations?key=${encodeURIComponent(key)}`, { cache: "no-store" });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "erro");
        setRows(data);
      } catch (e:any) { setErr(e?.message || "erro"); }
    })();
  }, [key]);

  if (!key) return <div className="p-6">Falta <code>?key=ADMIN_KEY</code></div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Simulações</h1>
      <div className="overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left">Data</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Empresa</th>
              <th className="p-2 text-left">NIF</th>
              <th className="p-2 text-left">Comercializadora</th>
              <th className="p-2 text-left">Tipo/Ciclo</th>
              <th className="p-2 text-right">Preço Médio</th>
              <th className="p-2 text-right">Ref. Mercado</th>
              <th className="p-2 text-right">Desvio (%)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r:any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2">{r.email}</td>
                <td className="p-2">{r.company || "-"}</td>
                <td className="p-2">{r.nif || "-"}</td>
                <td className="p-2">{r.supplier || "-"}</td>
                <td className="p-2">{r.install_type}/{r.cycle}</td>
                <td className="p-2 text-right">{fmt(r.avg_price_mwh)}</td>
                <td className="p-2 text-right">{fmt(r.ref_price_mwh)}</td>
                <td className="p-2 text-right">{fmtPct(r.deviation_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">Aceda como <code>/admin?key=TEU_ADMIN_KEY</code></p>
    </div>
  );
}
