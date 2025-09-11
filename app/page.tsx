"use client";

import { useMemo, useRef, useState } from "react";

type PriceFields = {
  ponta: string;
  cheia: string;
  vazio: string;
  superVazio: string;
};

type FormState = {
  nif?: string;
  empresa?: string;
  responsavel?: string;

  comercializadora?: string;
  tipoInstalacao?: "AT" | "MT" | "BTE" | "BTN";
  ciclo?: "Semanal" | "Diário";

  unidadePreco?: "/MWh" | "/kWh";
  inicioContrato?: string; // yyyy-mm-dd
  prazoMeses?: number;

  // Preços (sempre string no input; converto no submit)
  precos: PriceFields;

  // NOVOS CAMPOS:
  incluiRedes?: boolean;
  consumoAnualEstimadoMWh?: number | undefined; // opcional
};

const DEFAULT_FORM: FormState = {
  comercializadora: "EDP Comercial",
  tipoInstalacao: "MT",
  ciclo: "Semanal",
  unidadePreco: "/MWh",
  prazoMeses: 12,
  precos: {
    ponta: "",
    cheia: "",
    vazio: "",
    superVazio: "",
  },
  incluiRedes: false,
  consumoAnualEstimadoMWh: undefined,
};

function parseNumberOrUndefined(v: string): number | undefined {
  if (v == null) return undefined;
  const trimmed = v.trim().replace(/\./g, "").replace(",", ".");
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export default function Page() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const topRef = useRef<HTMLDivElement>(null);

  const canSubmit = useMemo(() => {
    // critério mínimo: ter pelo menos um preço preenchido
    const { ponta, cheia, vazio, superVazio } = form.precos;
    return [ponta, cheia, vazio, superVazio].some((v) => v && v.trim() !== "");
  }, [form.precos]);

  function updatePrice(field: keyof PriceFields, value: string) {
    setForm((f) => ({ ...f, precos: { ...f.precos, [field]: value } }));
  }

  function resetPrices() {
    setForm((f) => ({
      ...f,
      precos: { ponta: "", cheia: "", vazio: "", superVazio: "" },
    }));
  }

  function scrollToTop() {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Monta payload: só envia o que fizer sentido
    const payload: any = {
      nif: form.nif?.trim() || undefined,
      empresa: form.empresa?.trim() || undefined,
      responsavel: form.responsavel?.trim() || undefined,

      comercializadora: form.comercializadora,
      tipoInstalacao: form.tipoInstalacao,
      ciclo: form.ciclo,

      unidadePreco: form.unidadePreco,
      inicioContrato: form.inicioContrato || undefined,
      prazoMeses: form.prazoMeses ?? undefined,

      // preços convertidos para número (se preenchidos)
      precos: {
        ponta: parseNumberOrUndefined(form.precos.ponta),
        cheia: parseNumberOrUndefined(form.precos.cheia),
        vazio: parseNumberOrUndefined(form.precos.vazio),
        superVazio: parseNumberOrUndefined(form.precos.superVazio),
      },
    };

    // Envia NOVOS CAMPOS somente quando aplicável
    if (form.incluiRedes) payload.incluiRedes = true;
    if (
      typeof form.consumoAnualEstimadoMWh === "number" &&
      Number.isFinite(form.consumoAnualEstimadoMWh)
    ) {
      payload.consumoAnualEstimadoMWh = form.consumoAnualEstimadoMWh;
    }

    // Chamada de API (ajusta a rota conforme o teu backend)
    await fetch("/api/simulations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // feedback simples (podes trocar por toast)
    alert("Simulação enviada com sucesso.");
  }

  return (
    <div ref={topRef} className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Nova simulação</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Cabeçalho de dados básicos */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <label htmlFor="nif" className="text-sm font-medium">
              NIF da empresa
            </label>
            <input
              id="nif"
              className="w-full rounded-lg border px-3 py-2"
              placeholder="XXXXXXXXX"
              value={form.nif ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))}
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="empresa" className="text-sm font-medium">
              Empresa
            </label>
            <input
              id="empresa"
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Nome legal"
              value={form.empresa ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, empresa: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="responsavel" className="text-sm font-medium">
              Responsável
            </label>
            <input
              id="responsavel"
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Nome e cargo"
              value={form.responsavel ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, responsavel: e.target.value }))
              }
            />
          </div>
        </section>

        {/* Parametrização */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Comercializadora</label>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={form.comercializadora}
              onChange={(e) =>
                setForm((f) => ({ ...f, comercializadora: e.target.value }))
              }
            >
              <option>EDP Comercial</option>
              <option>Galp</option>
              <option>Iberdrola</option>
              <option>Goldenergy</option>
              <option>Endesa</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Tipo de instalação</label>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={form.tipoInstalacao}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  tipoInstalacao: e.target.value as FormState["tipoInstalacao"],
                }))
              }
            >
              <option value="AT">AT</option>
              <option value="MT">MT</option>
              <option value="BTE">BTE</option>
              <option value="BTN">BTN</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Ciclo</label>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={form.ciclo}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ciclo: e.target.value as FormState["ciclo"],
                }))
              }
            >
              <option value="Semanal">Semanal</option>
              <option value="Diário">Diário</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Unidade de preço</label>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={form.unidadePreco}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  unidadePreco: e.target.value as FormState["unidadePreco"],
                }))
              }
            >
              <option value="/MWh">/MWh</option>
              <option value="/kWh">/kWh</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Início do novo contrato</label>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2"
              value={form.inicioContrato ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, inicioContrato: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Prazo (meses)</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border px-3 py-2"
              value={form.prazoMeses ?? 12}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  prazoMeses: Number(e.target.value || 0),
                }))
              }
            />
          </div>
        </section>

        {/* PREÇOS DA PROPOSTA */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Preços da proposta do cliente ({form.unidadePreco})
          </h2>

          {/* Linha de 4 preços */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Ponta</label>
              <div className="relative">
                <input
                  inputMode="decimal"
                  placeholder="0,000"
                  className="w-full rounded-lg border px-3 py-2 pr-16"
                  value={form.precos.ponta}
                  onChange={(e) => updatePrice("ponta", e.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-sm text-gray-500">
                  {form.unidadePreco}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Cheia</label>
              <div className="relative">
                <input
                  inputMode="decimal"
                  placeholder="0,000"
                  className="w-full rounded-lg border px-3 py-2 pr-16"
                  value={form.precos.cheia}
                  onChange={(e) => updatePrice("cheia", e.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-sm text-gray-500">
                  {form.unidadePreco}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Vazio</label>
              <div className="relative">
                <input
                  inputMode="decimal"
                  placeholder="0,000"
                  className="w-full rounded-lg border px-3 py-2 pr-16"
                  value={form.precos.vazio}
                  onChange={(e) => updatePrice("vazio", e.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-sm text-gray-500">
                  {form.unidadePreco}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Super Vazio</label>
              <div className="relative">
                <input
                  inputMode="decimal"
                  placeholder="0,000"
                  className="w-full rounded-lg border px-3 py-2 pr-16"
                  value={form.precos.superVazio}
                  onChange={(e) => updatePrice("superVazio", e.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-sm text-gray-500">
                  {form.unidadePreco}
                </span>
              </div>
            </div>
          </div>

          {/* NOVA LINHA: inclui redes + consumo anual estimado (logo abaixo dos preços) */}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="col-span-2 flex items-center gap-3 rounded-lg border px-3 py-2">
              <input
                id="incluiRedes"
                type="checkbox"
                className="h-4 w-4"
                checked={!!form.incluiRedes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, incluiRedes: e.target.checked }))
                }
              />
              <label htmlFor="incluiRedes" className="text-sm">
                Os preços informados incluem redes?
              </label>
            </div>

            <div className="col-span-2 grid gap-2">
              <label htmlFor="consumoAnualEstimadoMWh" className="text-sm font-medium">
                Consumo anual estimado (MWh) <span className="text-xs text-gray-500">(opcional)</span>
              </label>
              <input
                id="consumoAnualEstimadoMWh"
                type="number"
                min={0}
                step="0.001"
                placeholder="ex.: 12,5"
                inputMode="decimal"
                className="w-full rounded-lg border px-3 py-2"
                value={
                  form.consumoAnualEstimadoMWh ?? ""
                }
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    consumoAnualEstimadoMWh:
                      e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>

          {/* Ações da secção de preços */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={resetPrices}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Limpar preços
            </button>
            <button
              type="button"
              onClick={scrollToTop}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Subir ao topo
            </button>
          </div>
        </section>

        {/* Footer do formulário */}
        <section className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setForm(DEFAULT_FORM)}
            className="rounded-lg border px-4 py-2"
          >
            Limpar formulário
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40"
          >
            Guardar / Simular
          </button>
        </section>
      </form>
    </div>
  );
}
