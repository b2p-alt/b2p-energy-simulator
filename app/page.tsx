
"use client";
import React, { useMemo, useState } from "react";

export default function Page() {
  return <B2PSimuladorOMIP />;
}

// ============== Componente do simulador ==============

function B2PSimuladorOMIP() {
  // Passo 1 — Email + validação (via backend Emailable)
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "invalid" | "checking" | "blocked" | "sent" | "verified"
  >("idle");
  const [msg, setMsg] = useState<string>("");

  const isValidEmailFormat = (value: string) => {
    const re = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    return re.test(value.trim());
  };

  async function apiValidateEmail(email: string) {
    const res = await fetch("/api/validate-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error("Falha na validação do email");
    return (await res.json()) as {
      status: "deliverable" | "risky" | "undeliverable" | "disposable" | "role";
      reason?: string;
      raw?: any;
    };
  }

  async function apiSendConfirmation(email: string) {
    const res = await fetch("/api/send-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error("Não foi possível enviar o email de confirmação");
    return (await res.json()) as { ok: boolean; confirmUrl?: string };
  }

  async function apiConfirmStatus(email: string) {
    const url = new URL("/api/confirm-status", window.location.origin);
    url.searchParams.set("email", email);
    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error("Erro ao verificar confirmação");
    return (await res.json()) as { verified: boolean };
  }

  const handleSendConfirmation = async () => {
    setMsg("");
    if (!isValidEmailFormat(email)) {
      setEmailStatus("invalid");
      setMsg("Por favor, introduza um email válido.");
      return;
    }
    try {
      setEmailStatus("checking");
      const result = await apiValidateEmail(email);
      if (result.status === "undeliverable" || result.status === "disposable" || result.status === "role") {
        setEmailStatus("blocked");
        setMsg(
          result.status === "undeliverable"
            ? "Este email não é entregável. Tente outro endereço."
            : result.status === "disposable"
            ? "Emails descartáveis não são permitidos. Use um email corporativo."
            : "Emails genéricos (ex.: info@, sales@) não são permitidos. Use um email de um responsável."
        );
        return;
      }
      await apiSendConfirmation(email);
      setEmailStatus("sent");
      setMsg("Enviámos um email de confirmação. Clique no link e depois selecione \"Já confirmei\".");
    } catch (e: any) {
      setEmailStatus("invalid");
      setMsg(e?.message || "Ocorreu um erro ao validar o email.");
    }
  };

  const handleManualConfirm = async () => {
    setMsg("");
    try {
      const { verified } = await apiConfirmStatus(email);
      if (verified) {
        setEmailStatus("verified");
        setMsg("Email validado com sucesso.");
      } else {
        setMsg("Ainda não recebemos a confirmação. Verifique a sua caixa de entrada (e spam).");
      }
    } catch (e: any) {
      setMsg(e?.message || "Erro ao verificar o estado de confirmação.");
    }
  };

  const emailVerified = emailStatus === "verified";

  // Passo 2 — Dados de instalação
  const [empresa, setEmpresa] = useState({ nif: "", nome: "", responsavel: "" });
  const [instalacao, setInstalacao] = useState("MT"); // MT | BTE | BTN
  const [ciclo, setCiclo] = useState("Semanal");
  const [inicio, setInicio] = useState("");
  const [prazoMeses, setPrazoMeses] = useState(12);
  const [unidade, setUnidade] = useState("/MWh");
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

  const [precos, setPrecos] = useState({
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

  const [admin, setAdmin] = useState({
    omipBase: "120",
    perdasPercent: "2.5",
    eric: "3.0",
    ren: "1.5",
  });

  const ciclosPorInstalacao: Record<string, string[]> = {
    MT: ["Semanal", "Semanal opcional"],
    BTE: ["Diário", "Semanal"],
    BTN: ["Simples", "Bi-horário", "Tri-horário"],
  };

  const camposTarifas = useMemo(() => {
    if (instalacao === "MT") {
      return [
        { key: "ponta", label: "Ponta" },
        { key: "cheia", label: "Cheia" },
        { key: "vazio", label: "Vazio" },
        { key: "svazio", label: "Super Vazio" },
      ];
    }
    if (instalacao === "BTE") {
      return [
        { key: "ponta", label: "Ponta" },
        { key: "cheia", label: "Cheia" },
        { key: "vazio", label: "Vazio" },
        { key: "svazio", label: "Super Vazio" },
      ];
    }
    if (ciclo === "Simples") return [{ key: "simples", label: "Simples" }];
    if (ciclo === "Bi-horário") return [{ key: "bi_cheia", label: "Cheia" }, { key: "bi_vazio", label: "Vazio" }];
    return [{ key: "tri_ponta", label: "Ponta" }, { key: "tri_cheia", label: "Cheia" }, { key: "tri_vazio", label: "Vazio" }];
  }, [instalacao, ciclo]);

  const parse = (v: string) => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };
  const toMWh = (value: number) => (unidade === "/kWh" ? value * 1000 : value);

  const precoMedioClienteMWh = useMemo(() => {
    const vals: number[] = [];
    camposTarifas.forEach((c) => {
      const raw = parse((precos as any)[c.key]);
      if (!Number.isNaN(raw)) vals.push(toMWh(raw));
    });
    if (vals.length === 0) return NaN;
    const soma = vals.reduce((a, b) => a + b, 0);
    return soma / vals.length;
  }, [camposTarifas, precos, unidade]);

  const referenciaMercadoMWh = useMemo(() => {
    const omip = parse(admin.omipBase);
    const perdasPct = parse(admin.perdasPercent) / 100;
    const eric = parse(admin.eric);
    const ren = parse(admin.ren);
    if ([omip, perdasPct, eric, ren].some((x) => Number.isNaN(x))) return NaN;
    return omip * (1 + perdasPct) + eric + ren;
  }, [admin]);

  const desvioAbs = useMemo(() => {
    if (Number.isNaN(precoMedioClienteMWh) || Number.isNaN(referenciaMercadoMWh)) return NaN;
    return precoMedioClienteMWh - referenciaMercadoMWh;
  }, [precoMedioClienteMWh, referenciaMercadoMWh]);

  const desvioPct = useMemo(() => {
    if (Number.isNaN(desvioAbs) || Number.isNaN(referenciaMercadoMWh) || referenciaMercadoMWh === 0) return NaN;
    return (desvioAbs / referenciaMercadoMWh) * 100;
  }, [desvioAbs, referenciaMercadoMWh]);

  const status =
    Number.isNaN(desvioAbs) ? "neutro" : desvioAbs > 0 ? "acima" : desvioAbs < 0 ? "abaixo" : "alinhado";

  const resetPrecos = () => {
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
  };

  const onChangeInstalacao = (val: string) => {
    setInstalacao(val);
    const ciclos = (ciclosPorInstalacao as any)[val];
    setCiclo(ciclos?.[0] ?? "");
    resetPrecos();
  };

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

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">B2P Energy · Comparador de Propostas (beta)</h1>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs">Protótipo</span>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          <section className="md:col-span-2 space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-medium">Passo 1 — Dados do cliente</h2>
              <p className="mb-4 text-sm text-slate-600">Introduza o seu email para validar o acesso ao simulador. Após confirmar o email, desbloqueia o passo 2.</p>

              <div className="grid gap-3 md:grid-cols-2">
                <TextField label="Email de contacto" type="email" value={email} onChange={(v)=>{ setEmail(v); setEmailStatus("idle"); setMsg(""); }} placeholder="email@empresa.pt"/>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={handleSendConfirmation} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
                  {emailStatus === "checking" ? "A validar..." : "Enviar email de confirmação"}
                </button>
                <button onClick={handleManualConfirm} className="rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Já confirmei</button>
                {msg && <span className={`text-sm ${emailStatus === "invalid" || emailStatus === "blocked" ? "text-red-600" : "text-emerald-700"}`}>{msg}</span>}
                {emailStatus === "sent" && (<span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">Aguardando confirmação</span>)}
                {emailVerified && (<span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Email validado</span>)}
              </div>
            </div>

            <div className={`relative rounded-2xl bg-white p-5 shadow-sm ${disabledClass}`}>
              <div className="flex items-center justify-between">
                <h2 className="mb-2 text-lg font-medium">Passo 2 — Dados da instalação</h2>
                {!emailVerified && (<span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Bloqueado até validar email</span>)}
              </div>
              <p className="mb-4 text-sm text-slate-600">Preencha os dados para obter o resultado automático. É rápido e direto.</p>

              <div className="grid gap-3 md:grid-cols-3">
                <TextField label="NIF da empresa" value={empresa.nif} onChange={(v)=>setEmpresa({...empresa,nif:v})} placeholder="XXXXXXXXX"/>
                <TextField label="Empresa" value={empresa.nome} onChange={(v)=>setEmpresa({...empresa,nome:v})} placeholder="Nome legal"/>
                <TextField label="Responsável" value={empresa.responsavel} onChange={(v)=>setEmpresa({...empresa,responsavel:v})} placeholder="Nome e cargo"/>
              </div>

              <div className="my-4 h-px w-full bg-slate-100" />

              <div className="grid gap-3 md:grid-cols-3">
                <SelectField label="Comercializadora" value={comercializadora} onChange={setComercializadora} options={comercializadoras} />
                <SelectField label="Tipo de instalação" value={instalacao} onChange={(v) => onChangeInstalacao(v)} options={["MT", "BTE", "BTN"]} />
                <SelectField label="Ciclo" value={ciclo} onChange={(v) => { setCiclo(v); resetPrecos(); }} options={ciclosPorInstalacao[instalacao]} />
                <SelectField label="Unidade de preço" value={unidade} onChange={setUnidade} options={["/MWh", "/kWh"]} />
                <TextField label="Início do novo contrato" type="date" value={inicio} onChange={setInicio} />
                <TextField label="Prazo (meses)" type="number" value={String(prazoMeses)} onChange={(v)=>setPrazoMeses(Number(v)||0)} />
              </div>

              <div className="my-4" />

              <h3 className="mb-2 text-base font-medium">Preços da proposta do cliente ({unidade})</h3>
              <div className="grid gap-3 md:grid-cols-4">
                {camposTarifas.map((c) => (
                  <TextField key={c.key} label={c.label} type="number" step="any"
                    value={(precos as any)[c.key] as string}
                    onChange={(v) => setPrecos((p) => ({ ...p, [c.key]: v }))}
                    placeholder={`0,000 ${unidade}`}
                  />
                ))}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button onClick={resetPrecos} className="rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Limpar preços</button>
                <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Guardar contacto</button>
              </div>

              {!emailVerified && (<div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-dashed border-slate-200"></div>)}
            </div>
          </section>

          <aside className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-medium">Resultado automático</h2>

            <div className="grid gap-3">
              <InfoRow label="Preço médio do cliente" value={formatMWh(precoMedioClienteMWh)} />
              <InfoRow label="Referência de mercado (ajustada)" value={formatMWh(referenciaMercadoMWh)} />
              <InfoRow label="Desvio absoluto" value={formatMWh(desvioAbs)} />
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-sm text-slate-600">Desvio percentual</div>
                <div className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}>
                  {formatPct(desvioPct)} {status === "acima" ? "acima" : status === "abaixo" ? "abaixo" : status === "alinhado" ? "(alinhado)" : ""}
                </div>
              </div>

              <div className="mt-2 rounded-xl border border-slate-200 p-3 text-sm">
                <p className="mb-2 font-medium">Interpretação</p>
                {Number.isNaN(desvioPct) ? (
                  <p>Introduza os preços da proposta e os parâmetros de referência para ver o resultado.</p>
                ) : desvioPct > 0 ? (
                  <p>A proposta analisada está <strong>{formatPct(desvioPct)}</strong> acima da referência de mercado ajustada. Podemos tentar negociar ou apresentar alternativas B2P.</p>
                ) : desvioPct < 0 ? (
                  <p>A proposta analisada está <strong>{formatPct(desvioPct)}</strong> abaixo da referência de mercado ajustada. Ainda assim, podemos validar condições contratuais e eventuais taxas ocultas.</p>
                ) : (
                  <p>Preço alinhado com o mercado. Vale comparar cláusulas e serviços adicionais.</p>
                )}
              </div>

              <button className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Receber propostas B2P
              </button>
            </div>

            <details className="mt-6 rounded-2xl border border-slate-200 p-4">
              <summary className="cursor-pointer select-none text-sm font-medium">Parâmetros de referência (admin)</summary>
              <div className="mt-3 grid gap-3">
                <TextField label="OMIP base (€/MWh)" value={admin.omipBase} onChange={(v)=>setAdmin({...admin, omipBase:v})} />
                <TextField label="Perdas (%)" value={admin.perdasPercent} onChange={(v)=>setAdmin({...admin, perdasPercent:v})} />
                <TextField label="ERIC (€/MWh)" value={admin.eric} onChange={(v)=>setAdmin({...admin, eric:v})} />
                <TextField label="REN / outros (€/MWh)" value={admin.ren} onChange={(v)=>setAdmin({...admin, ren:v})} />
                <p className="text-xs text-slate-500">No produto final, estes valores serão calculados automaticamente a partir das curvas OMIP do período correspondente ({inicio || "data"}) e dos custos regulatórios agregados.</p>
              </div>
            </details>
          </aside>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} B2P Energy · Protótipo interno para validação de conceito
        </footer>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", placeholder = "", step } : any) {
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

function SelectField({ label, value, onChange, options } : any) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        className="rounded-xl border border-slate-200 bg-white px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt: string) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  );
}

function InfoRow({ label, value } : any) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
