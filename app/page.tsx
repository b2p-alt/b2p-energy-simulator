"use client";

import React, { useMemo, useState } from "react";

/**
 * B2P Energy — Comparador de Propostas (beta)
 * Versão com cálculo no backend:
 * - Botão executa GET /api/quote/market-average?start=YYYY-MM&months=N
 * - Painel direito usa os dados retornados (avg_omip, ref_price_mwh, rows)
 */

/* =========================================================
   Tipos auxiliares
========================================================= */
type OmipRow = {
  month: string;           // ISO date no primeiro dia do mês (ex: 2025-11-01T00:00:00.000Z)
  price_eur_mwh: string;   // vem como string; convertendo para Number quando necessário
};

type ServerResult = {
  start: string;           // YYYY-MM-01T00:00:00.000Z
  end: string;             // idem
  months: number;
  months_found: number;
  avg_omip: number;        // média simples OMIP do período
  eric: number;
  ren: number;
  perdas_percent: number;  // 7 => 7%
  ref_price_mwh: number;   // (avg_omip + eric + ren) * (1 + perdas%)
  rows: OmipRow[];
};

/* =========================================================
   Componente principal
========================================================= */
export default function B2PSimuladorOMIP() {
  // ===== Passo 1: Email + validação (mock do fluxo anterior) =====
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "invalid" | "checking" | "blocked" | "sent" | "verified"
  >("verified"); // para facilitar seus testes agora, deixei como "verified"
  const [msg, setMsg] = useState<string>("");

  const emailVerified = emailStatus === "verified";

  // ===== Passo 2: Formulário =====
  const [empresa, setEmpresa] = useState({
    nif: "",
    nome: "",
    responsavel: "",
  });

  const [instalacao, setInstalacao] = useState("MT"); // MT | BTE | BTN
  const [ciclo, setCiclo] = useState("Semanal");
  const [inicio, setInicio] = useState("");             // YYYY-MM-DD
  const [prazoMeses, setPrazoMeses] = useState(24);
  const [unidade, setUnidade] = useState("/MWh");       // "/MWh" | "/kWh"
  const [comercializadora, setComercializadora] = useState("");

  const comercializadoras = [
    "EDP Comercial",
    "Endesa Energia",
    "Iberdrola Clientes Portugal",
    "Galp Power",
    "Repsol",
    "Goldenergy",
    "Axpo Iberia",
    "Audax",
    "TotalEnergies",
    "Naturgy",
    "Outra",
  ];

  // Preços da proposta do cliente
  const [precos, setPrecos] = useState({
    ponta: "",
    cheia: "",
    vazio: "",
    svazio: "",
    // BTN
    simples: "",
    bi_cheia: "",
    bi_vazio: "",
    tri_ponta: "",
    tri_cheia: "",
    tri_vazio: "",
  });

  // Campos a exibir de acordo com instalação/ciclo
  const ciclosPorInstalacao: Record<string, string[]> = {
    MT: ["Semanal", "Semanal opcional"],
    BTE: ["Diário", "Semanal"],
    BTN: ["Simples", "Bi-horário", "Tri-horário"],
  };

  const camposTarifas = useMemo(() => {
    if (instalacao === "MT" || instalacao === "BTE") {
      return [
        { key: "ponta", label: "Ponta" },
        { key: "cheia", label: "Cheia" },
        { key: "vazio", label: "Vazio" },
        { key: "svazio", label: "Super Vazio" },
      ];
    }
    // BTN
    if (ciclo === "Simples") return [{ key: "simples", label: "Simples" }];
    if (ciclo === "Bi-horário")
      return [
        { key: "bi_cheia", label: "Cheia" },
        { key: "bi_vazio", label: "Vazio" },
      ];
    // Tri-horário
    return [
      { key: "tri_ponta", label: "Ponta" },
      { key: "tri_cheia", label: "Cheia" },
      { key: "tri_vazio", label: "Vazio" },
    ];
  }, [instalacao, ciclo]);

  // Helpers
  const parse = (v: string) => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };
  const toMWh = (value: number) => (unidade === "/kWh" ? value * 1000 : value);

  // Preço médio do cliente a partir dos campos preenchidos
  const precoMedioClienteMWh = useMemo(() => {
    const vals: number[] = [];
    camposTarifas.forEach((c) => {
      const raw = parse(precos[c.key as keyof typeof precos]);
      if (!Number.isNaN(raw)) vals.push(toMWh(raw));
    });
    if (!vals.length) return NaN;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [camposTarifas, precos, unidade]);

  // ====== Estado do cálculo no backend ======
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [serverResult, setServerResult] = useState<ServerResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Botão principal: CALCULAR (antigo "Guardar contacto")
  async function handleCalculate() {
    setCalcError(null);
    setServerResult(null);

    // Validar início (YYYY-MM)
    if (!inicio) {
      setCalcError("Preencha a data de início do novo contrato.");
      return;
    }
    const startYYYYMM = (() => {
      try {
        const d = new Date(inicio);
        if (Number.isNaN(d.getTime())) return null;
        // YYYY-MM
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      } catch {
        return null;
      }
    })();

    if (!startYYYYMM) {
      setCalcError("Data de início inválida.");
      return;
    }
    if (!prazoMeses || prazoMeses <= 0) {
      setCalcError("Informe o prazo em meses (> 0).");
      return;
    }

    setLoadingCalc(true);
    try {
      const url = new URL("/api/quote/market-average", window.location.origin);
      url.searchParams.set("start", startYYYYMM);
      url.searchParams.set("months", String(prazoMeses));

      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Falha ao calcular preço de referência.");
      }
      const data = (await res.json()) as ServerResult;
      setServerResult(data);
    } catch (e: any) {
      setCalcError(e?.message || "Erro ao contactar o servidor.");
    } finally {
      setLoadingCalc(false);
      // rolar até o painel de resultado
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Métricas e comparação (usando o resultado do servidor quando disponível)
  const refMercadoMWh = serverResult?.ref_price_mwh ?? NaN;

  const desvioAbs = useMemo(() => {
    if (Number.isNaN(precoMedioClienteMWh) || Number.isNaN(refMercadoMWh)) return NaN;
    return precoMedioClienteMWh - refMercadoMWh;
  }, [precoMedioClienteMWh, refMercadoMWh]);

  const desvioPct = useMemo(() => {
    if (Number.isNaN(desvioAbs) || Number.isNaN(refMercadoMWh) || refMercadoMWh === 0) return NaN;
    return (desvioAbs / refMercadoMWh) * 100;
  }, [desvioAbs, refMercadoMWh]);

  const status =
    Number.isNaN(desvioAbs) ? "neutro" : desvioAbs > 0 ? "acima" : desvioAbs < 0 ? "abaixo" : "alinhado";

  const badgeClass =
    status === "acima"
      ? "bg-red-100 text-red-700"
      : status === "abaixo"
      ? "bg-green-100 text-green-700"
      : status === "alinhado"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-gray-100 text-gray-700";

  const formatMWh = (n: number) => (Number.isNaN(n) ? "—" : `${n.toFixed(2)} €/MWh`);
  const formatPct = (n: number) => (Number.isNaN(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

  const disabledClass = emailVerified ? "" : "pointer-events-none opacity-50";

  // UI
  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl p-6">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">B2P Energy · Comparador de Propostas (beta)</h1>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs">Protótipo</span>
        </header>

        {/* Grid principal */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Coluna esquerda: formulário */}
          <section className="md:col-span-2 space-y-6">
            {/* Passo 1 */}
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-medium">Passo 1 — Dados do cliente</h2>
              <p className="mb-4 text-sm text-slate-600">
                Introduza o seu email para validar o acesso ao simulador. Após confirmar o email, desbloqueia o passo 2.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <TextField
                  label="Email de contacto"
                  type="email"
                  value={email}
                  onChange={(v) => {
                    setEmail(v);
                    setEmailStatus("verified"); // simplificado para seus testes
                    setMsg("");
                  }}
                  placeholder="email@empresa.pt"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {msg && (
                  <span
                    className={`text-sm ${
                      emailStatus === "invalid" || emailStatus === "blocked" ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {msg}
                  </span>
                )}
                {emailVerified && (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Email validado</span>
                )}
              </div>
            </div>

            {/* Passo 2 */}
            <div className={`relative rounded-2xl bg-white p-5 shadow-sm ${disabledClass}`}>
              <div className="flex items-center justify-between">
                <h2 className="mb-2 text-lg font-medium">Passo 2 — Dados da instalação</h2>
                {!emailVerified && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Bloqueado até validar email</span>
                )}
              </div>
              <p className="mb-4 text-sm text-slate-600">Preencha os dados para depois calcular o resultado.</p>

              {/* Identificação */}
              <div className="grid gap-3 md:grid-cols-3">
                <TextField
                  label="NIF da empresa"
                  value={empresa.nif}
                  onChange={(v) => setEmpresa({ ...empresa, nif: v })}
                  placeholder="XXXXXXXXX"
                />
                <TextField
                  label="Empresa"
                  value={empresa.nome}
                  onChange={(v) => setEmpresa({ ...empresa, nome: v })}
                  placeholder="Nome legal"
                />
                <TextField
                  label="Responsável"
                  value={empresa.responsavel}
                  onChange={(v) => setEmpresa({ ...empresa, responsavel: v })}
                  placeholder="Nome e cargo"
                />
              </div>

              <div className="my-4 h-px w-full bg-slate-100" />

              <div className="grid gap-3 md:grid-cols-3">
                <SelectField
                  label="Comercializadora"
                  value={comercializadora}
                  onChange={setComercializadora}
                  options={comercializadoras}
                />
                <SelectField
                  label="Tipo de instalação"
                  value={instalacao}
                  onChange={(v) => {
                    setInstalacao(v);
                    setCiclo(ciclosPorInstalacao[v]?.[0] ?? "");
                    resetPrecos();
                  }}
                  options={["MT", "BTE", "BTN"]}
                />
                <SelectField
                  label="Ciclo"
                  value={ciclo}
                  onChange={(v) => {
                    setCiclo(v);
                    resetPrecos();
                  }}
                  options={ciclosPorInstalacao[instalacao]}
                />
                <SelectField label="Unidade de preço" value={unidade} onChange={setUnidade} options={["/MWh", "/kWh"]} />
                <TextField label="Início do novo contrato" type="date" value={inicio} onChange={setInicio} />
                <TextField
                  label="Prazo (meses)"
                  type="number"
                  value={String(prazoMeses)}
                  onChange={(v) => setPrazoMeses(Math.max(1, Number(v) || 0))}
                />
              </div>

              <div className="my-4" />

              <h3 className="mb-2 text-base font-medium">Preços da proposta do cliente ({unidade})</h3>
              <div className="grid gap-3 md:grid-cols-4">
                {camposTarifas.map((c) => (
                  <TextField
                    key={c.key}
                    label={c.label}
                    type="number"
                    step="any"
                    value={precos[c.key as keyof typeof precos] as string}
                    onChange={(v) => setPrecos((p) => ({ ...p, [c.key]: v }))}
                    placeholder={`0,000 ${unidade}`}
                  />
                ))}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={resetPrecos}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  Limpar preços
                </button>

                {/* === Botão atualizado: chama a API e calcula === */}
                <button
                  onClick={handleCalculate}
                  disabled={loadingCalc}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {loadingCalc ? "A calcular..." : "Calcular comparação"}
                </button>

                {calcError && <span className="text-sm text-red-600">{calcError}</span>}
              </div>

              {!emailVerified && (
                <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-dashed border-slate-200"></div>
              )}
            </div>
          </section>

          {/* Coluna direita: resultado */}
          <aside className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-medium">Resultado</h2>

            {!serverResult ? (
              <p className="text-sm text-slate-600">
                Preencha os dados e clique em <strong>Calcular comparação</strong> para ver os resultados com base no
                mercado OMIP + ajustes (ERIC, REN, perdas).
              </p>
            ) : (
              <>
                <div className="mb-3 rounded-xl border border-slate-100 p-3">
                  <div className="text-xs text-slate-500 mb-1">Período</div>
                  <div className="text-sm">
                    {new Date(serverResult.start).toISOString().slice(0, 7)} →{" "}
                    {new Date(serverResult.end).toISOString().slice(0, 7)} ({serverResult.months} meses)
                  </div>
                </div>

                <div className="grid gap-3">
                  <InfoRow label="Preço médio do cliente" value={formatMWh(precoMedioClienteMWh)} />
                  <InfoRow label="Média OMIP do período" value={formatMWh(serverResult.avg_omip)} />
                  <InfoRow label="Referência de mercado (ajustada)" value={formatMWh(refMercadoMWh)} />
                  <InfoRow label="Desvio absoluto" value={formatMWh(desvioAbs)} />

                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="text-sm text-slate-600">Desvio percentual</div>
                    <div className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}>
                      {formatPct(desvioPct)}{" "}
                      {status === "acima" ? "acima" : status === "abaixo" ? "abaixo" : status === "alinhado" ? "(alinhado)" : ""}
                    </div>
                  </div>

                  <div className="mt-2 rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="mb-2 font-medium">Interpretação</p>
                    {Number.isNaN(desvioPct) ? (
                      <p>Informe os preços da proposta do cliente e calcule para ver a comparação.</p>
                    ) : desvioPct > 0 ? (
                      <p>
                        A proposta analisada está <strong>{formatPct(desvioPct)}</strong> acima da referência de mercado ajustada.
                        Podemos tentar negociar ou apresentar alternativas B2P.
                      </p>
                    ) : desvioPct < 0 ? (
                      <p>
                        A proposta analisada está <strong>{formatPct(desvioPct)}</strong> abaixo da referência ajustada.
                        Ainda assim, convém validar condições contratuais e eventuais taxas ocultas.
                      </p>
                    ) : (
                      <p>Preço alinhado com o mercado. Vale comparar cláusulas e serviços adicionais.</p>
                    )}
                    <p className="mt-2 text-xs text-slate-500">
                      * Cálculo no servidor: (<em>OMIP médio</em> + ERIC + REN) × (1 + perdas%).
                    </p>
                  </div>

                  {/* Lista (compacta) dos meses retornados */}
                  <details className="mt-3 rounded-2xl border border-slate-200 p-3">
                    <summary className="cursor-pointer select-none text-sm font-medium">
                      Ver meses do período (OMIP bruto)
                    </summary>
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {serverResult.rows.slice(0, 24).map((r) => (
                        <li key={r.month}>
                          {new Date(r.month).toISOString().slice(0, 7)} — {Number(r.price_eur_mwh).toFixed(2)} €/MWh
                        </li>
                      ))}
                    </ul>
                  </details>

                  <button className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                    Receber propostas B2P
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} B2P Energy · Protótipo interno para validação de conceito
        </footer>
      </div>
    </div>
  );

  // Helpers locais
  function resetPrecos() {
    setPrecos({
      ponta: "",
      cheia: "",
      vazio: "",
      svazio: "",
      simples: "",
      bi_cheia: "",
      bi_vazio: "",
      tri_ponta: "",
      tri_cheia: "",
      tri_vazio: "",
    });
  }
}

/* =========================================================
   Componentes pequenos de UI
========================================================= */
function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        className="rounded-xl border border-slate-200 px-3 py-2 outline-none ring-0 focus:border-slate-300"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        step={step}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        className="rounded-xl border border-slate-200 bg-white px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
