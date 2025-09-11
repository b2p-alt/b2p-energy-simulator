"use client";
import React, { useEffect, useMemo, useState } from "react";

// Página principal — Simulador/Comparador
// Versão com: consentimentos (legal + marketing), toggle "inclui redes?",
// consumo anual opcional, botão "Gravar simulação" e lista de simulações do utilizador.
// Requer as rotas:
//  - POST /api/validate-email, POST /api/send-confirmation, GET /api/confirm-status
//  - POST /api/user/consent, GET /api/simulations/list, GET /api/simulations/[id], POST /api/simulations/save

export default function B2PSimuladorOMIP() {
  // ===== Passo 1: Email + validação =====
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "invalid" | "checking" | "blocked" | "sent" | "verified"
  >("idle");
  const [msg, setMsg] = useState<string>("");

  // Consentimentos
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  // Helpers de validação local (formato)
  const isValidEmailFormat = (value: string) => {
    const re = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    return re.test(value.trim());
  };

  // --- API client (placeholders) ---
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
    };
  }

  async function apiSendConfirmation(email: string) {
    const res = await fetch("/api/send-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error("Não foi possível enviar o email de confirmação");
    return (await res.json()) as { ok: boolean };
  }

  async function apiConfirmStatus(email: string) {
    const url = new URL("/api/confirm-status", window.location.origin);
    url.searchParams.set("email", email);
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error("Erro ao verificar confirmação");
    return (await res.json()) as { verified: boolean };
  }

  async function persistConsentIfNeeded() {
    if (!email) return;
    try {
      await fetch("/api/user/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, termsAccepted, marketingOptIn }),
      });
    } catch {}
  }

  // Fluxo: validar -> enviar confirmação -> aguardar clique do utilizador no link
  const handleSendConfirmation = async () => {
    setMsg("");
    if (!isValidEmailFormat(email)) {
      setEmailStatus("invalid");
      setMsg("Por favor, introduza um email válido.");
      return;
    }
    try {
      // (opcional) exigir termos marcados para enviar confirmação
      if (!termsAccepted) {
        setMsg("É necessário concordar com os Termos e a Política para continuar.");
        return;
      }

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
      // deliverable/risky → envia confirmação
      await apiSendConfirmation(email);
      await persistConsentIfNeeded();
      setEmailStatus("sent");
      setMsg("Enviámos um email de confirmação. Clique no link e depois selecione \"Já confirmei\".");
    } catch (e: any) {
      setEmailStatus("invalid");
      setMsg(e?.message || "Ocorreu um erro ao validar o email.");
    }
  };

  // Botão "Já confirmei": verifica no backend o estado (token clicado no email)
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

  // Opcional: ao trocar email válido, atualizar lista de simulações do utilizador
  useEffect(() => {
    if (isValidEmailFormat(email)) refreshMySims();
    else setMySims([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const emailVerified = emailStatus === "verified"; // manter comportamento atual

  // ===== Passo 2: Dados da instalação / contrato =====
  const [empresa, setEmpresa] = useState({
    nif: "",
    nome: "",
    responsavel: "",
  });

  const [instalacao, setInstalacao] = useState("MT"); // MT | BTE | BTN
  const [ciclo, setCiclo] = useState("Semanal");
  const [inicio, setInicio] = useState(""); // YYYY-MM-DD
  const [prazoMeses, setPrazoMeses] = useState(12);
  const [unidade, setUnidade] = useState("/MWh"); // "/MWh" | "/kWh"
  const [comercializadora, setComercializadora] = useState("");

  // Novos campos do Passo 2
  const [includeNetworks, setIncludeNetworks] = useState(false);
  const [annualConsumption, setAnnualConsumption] = useState<string>("");

  // Principais comercializadoras (ajustável)
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

  // Inputs de preços por tarifa (valores do cliente)
  const [precos, setPrecos] = useState({
    // MT/BTE
    ponta: "",
    cheia: "",
    vazio: "",
    svazio: "",
    // BTN Simples/Bi/Tri
    simples: "",
    bi_cheia: "",
    bi_vazio: "",
    tri_ponta: "",
    tri_cheia: "",
    tri_vazio: "",
  });

  // "Backoffice" simplificado (valores de referência para comparação)
  const [admin, setAdmin] = useState({
    omipBase: "120", // €/MWh (exemplo)
    perdasPercent: "2.5", // % sobre OMIP
    eric: "3.0", // €/MWh
    ren: "1.5", // €/MWh (ou outros custos regulatórios)
  });

  // Opções de ciclo por tipo de instalação
  const ciclosPorInstalacao: Record<string, string[]> = {
    MT: ["Semanal", "Semanal opcional"],
    BTE: ["Diário", "Semanal"],
    BTN: ["Simples", "Bi-horário", "Tri-horário"],
  };

  // Campos de preço a mostrar consoante instalação/ciclo
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
    // BTN
    if (ciclo === "Simples") {
      return [{ key: "simples", label: "Simples" }];
    }
    if (ciclo === "Bi-horário") {
      return [
        { key: "bi_cheia", label: "Cheia" },
        { key: "bi_vazio", label: "Vazio" },
      ];
    }
    // Tri-horário
    return [
      { key: "tri_ponta", label: "Ponta" },
      { key: "tri_cheia", label: "Cheia" },
      { key: "tri_vazio", label: "Vazio" },
    ];
  }, [instalacao, ciclo]);

  // Utils
  const parse = (v: string) => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };
  const toMWh = (value: number) => (unidade === "/kWh" ? value * 1000 : value);

  // Cálculo do preço médio do cliente (média simples dos campos visíveis)
  const precoMedioClienteMWh = useMemo(() => {
    const vals: number[] = [];
    camposTarifas.forEach((c) => {
      const raw = parse((precos as any)[c.key]);
      if (!Number.isNaN(raw)) vals.push(toMWh(raw));
    });
    if (vals.length === 0) return NaN;
    const soma = vals.reduce((a, b) => a + b, 0);
    return soma / vals.length; // média simples
  }, [camposTarifas, precos, unidade]);

  // Referência de mercado ajustada: OMIP + perdas%*OMIP + ERIC + REN
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

  const status = Number.isNaN(desvioAbs)
    ? "neutro"
    : desvioAbs > 0
    ? "acima"
    : desvioAbs < 0
    ? "abaixo"
    : "alinhado";

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
    const ciclos = ciclosPorInstalacao[val];
    setCiclo(ciclos?.[0] ?? "");
    resetPrecos();
  };

  // UI helpers
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

  // ===== Lista de simulações do utilizador =====
  const [mySims, setMySims] = useState<Array<{ id: string; created_at: string; nif: string | null; supplier: string | null }>>([]);

  async function refreshMySims() {
    if (!email) return;
    try {
      const res = await fetch(`/api/simulations/list?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setMySims(data);
      }
    } catch {}
  }

  async function handleLoadSimulation(id: string) {
    try {
      const res = await fetch(`/api/simulations/${id}`);
      if (!res.ok) return;
      const s = await res.json();

      // repõe no formulário
      setEmpresa({ nif: s.nif || "", nome: s.company || "", responsavel: s.responsavel || "" });
      setComercializadora(s.supplier || "");
      setInstalacao(s.install_type);
      setCiclo(s.cycle);
      setUnidade(s.unit);
      setInicio(s.start_date?.slice(0, 10) || "");
      setPrazoMeses(s.term_months || 12);
      setIncludeNetworks(!!s.client_prices_include_networks);
      setAnnualConsumption(s.annual_consumption_mwh != null ? String(s.annual_consumption_mwh) : "");

      setPrecos({
        ponta: s.ponta?.toString() || "",
        cheia: s.cheia?.toString() || "",
        vazio: s.vazio?.toString() || "",
        svazio: s.svazio?.toString() || "",
        simples: s.simples?.toString() || "",
        bi_cheia: s.bi_cheia?.toString() || "",
        bi_vazio: s.bi_vazio?.toString() || "",
        tri_ponta: s.tri_ponta?.toString() || "",
        tri_cheia: s.tri_cheia?.toString() || "",
        tri_vazio: s.tri_vazio?.toString() || "",
      });

      window.scrollTo({ top: 0, behavior: "smooth" });
      setSaveMsg("Simulação carregada.");
    } catch {}
  }

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  async function handleSaveSimulation() {
    try {
      setSaving(true);
      setSaveMsg("");

      await persistConsentIfNeeded();

      const payload: any = {
        email,
        nif: empresa.nif || null,
        company: empresa.nome || null,
        responsavel: empresa.responsavel || null,
        supplier: comercializadora || null,
        install_type: instalacao,
        cycle: ciclo,
        unit: unidade,
        start_date: inicio,
        term_months: prazoMeses,
        client_prices_include_networks: includeNetworks,
        annual_consumption_mwh: annualConsumption ? Number(annualConsumption) : null,
        // preços
        ...precos,
      };

      const res = await fetch("/api/simulations/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao gravar simulação.");

      setSaveMsg("Simulação gravada com sucesso.");

      // Limpa formulário (mantém email)
      setEmpresa({ nif: "", nome: "", responsavel: "" });
      setComercializadora("");
      setInstalacao("MT");
      setCiclo("Semanal");
      setUnidade("/MWh");
      setInicio("");
      setPrazoMeses(12);
      setIncludeNetworks(false);
      setAnnualConsumption("");
      resetPrecos();

      await refreshMySims();
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } catch (e: any) {
      setSaveMsg(e?.message || "Erro ao gravar simulação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl p-6">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Comparador de Propostas · Plataforma gratuita (beta)</h1>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs">Protótipo</span>
        </header>

        {/* Grid principal */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Coluna esquerda: formulário */}
          <section className="md:col-span-2 space-y-6">
            {/* Passo 1 */}
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-medium">Passo 1 — Dados do cliente</h2>
              <p className="mb-4 text-sm text-slate-600">Introduza o seu email para validar o acesso ao simulador. Após confirmar o email, desbloqueia o passo 2.</p>

              <div className="grid gap-3 md:grid-cols-2">
                <TextField label="Email de contacto" type="email" value={email} onChange={(v)=>{ setEmail(v); setEmailStatus("idle"); setMsg(""); }} placeholder="email@empresa.pt"/>
              </div>

              {/* Consentimentos */}
              <div className="mt-3 space-y-2 text-sm">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={termsAccepted} onChange={(e)=>setTermsAccepted(e.target.checked)} />
                  <span>Li e concordo com os <a className="underline" href="#" onClick={(e)=>e.preventDefault()}>Termos</a> e a <a className="underline" href="#" onClick={(e)=>e.preventDefault()}>Política de Privacidade</a>.</span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={marketingOptIn} onChange={(e)=>setMarketingOptIn(e.target.checked)} />
                  <span>Concordo em receber comunicações comerciais por email.</span>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={handleSendConfirmation} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
                  {emailStatus === "checking" ? "A validar..." : "Enviar email de confirmação"}
                </button>
                <button onClick={handleManualConfirm} className="rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Já confirmei</button>
                {msg && <span className={`text-sm ${emailStatus === "invalid" || emailStatus === "blocked" ? "text-red-600" : "text-emerald-700"}`}>{msg}</span>}
                {emailStatus === "sent" && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">Aguardando confirmação</span>
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
              <p className="mb-4 text-sm text-slate-600">Preencha os dados para obter o resultado e/ou gravar a simulação. É rápido e direto.</p>

              {/* Identificação */}
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

                {/* Novos campos */}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={includeNetworks} onChange={(e)=>setIncludeNetworks(e.target.checked)} />
                  <span>Os preços informados incluem redes?</span>
                </label>
                <TextField label="Consumo anual estimado (MWh)" type="number" value={annualConsumption} onChange={setAnnualConsumption} placeholder="opcional" />
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
                    value={(precos as any)[c.key] as string}
                    onChange={(v) => setPrecos((p) => ({ ...p, [c.key]: v }))}
                    placeholder={`0,000 ${unidade}`}
                  />
                ))}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button onClick={resetPrecos} className="rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Limpar preços</button>
                <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Subir ao topo</button>
              </div>

              {!emailVerified && (
                <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-dashed border-slate-200"></div>
              )}
            </div>
          </section>

          {/* Coluna direita: resultado + gravação + lista */}
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
                  <p>
                    A proposta analisada está <strong>{formatPct(desvioPct)}</strong> acima da referência de mercado
                    ajustada. Podemos tentar negociar ou comparar alternativas.
                  </p>
                ) : desvioPct < 0 ? (
                  <p>
                    A proposta analisada está <strong>{formatPct(desvioPct)}</strong> abaixo da referência de mercado
                    ajustada. Ainda assim, valide condições contratuais e eventuais taxas ocultas.
                  </p>
                ) : (
                  <p>Preço alinhado com o mercado. Vale comparar cláusulas e serviços adicionais.</p>
                )}
              </div>

              {/* Botão Gravar simulação */}
              <button
                onClick={handleSaveSimulation}
                disabled={saving}
                className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "A gravar..." : "Gravar simulação"}
              </button>
              {saveMsg && <p className="mt-2 text-sm">{saveMsg}</p>}
            </div>

            {/* Lista de simulações do utilizador */}
            <div className="mt-6 rounded-2xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">Minhas simulações</h3>
                <button onClick={refreshMySims} className="text-xs underline hover:no-underline">Atualizar</button>
              </div>
              {(!mySims || mySims.length === 0) ? (
                <p className="text-xs text-slate-500">Sem simulações gravadas.</p>
              ) : (
                <ul className="space-y-2">
                  {mySims.map((item) => {
                    const when = new Date(item.created_at).toISOString().slice(0, 10);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => handleLoadSimulation(item.id)}
                          className="w-full text-left rounded-lg border border-slate-100 px-3 py-2 text-xs hover:bg-slate-50"
                          title="Carregar simulação"
                        >
                          <div className="font-medium">{item.nif || "—"} — {item.supplier || "—"}</div>
                          <div className="text-slate-500">{when}</div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>

        {/* Rodapé */}
        <footer className="mt-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Plataforma gratuita · Protótipo interno para validação de conceito
        </footer>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", placeholder = "", step }: {
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

function SelectField({ label, value, onChange, options }: {
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
