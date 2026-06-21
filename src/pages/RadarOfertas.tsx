// src/pages/RadarOfertas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Loader2,
  Search,
  Send,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { brMoney, brPct } from "@/lib/radar/common";
import { findBestOffers, offerToSimulatorQuery } from "@/lib/radar/radarEngine";
import type { AdminFilter, AdminRow, AnyRow, RadarInput, RadarOffer, RadarSegment, RadarSourceData } from "@/lib/radar/types";

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  lightGold: "#E0CE8C",
  off: "#F5F5F5",
};

const RADAR_SEGMENTS: RadarSegment[] = ["Automóvel", "Imóvel", "Serviços"];
const PROBABILITY_OPTIONS = ["40", "50", "60", "70", "80", "90", "95"];
const ADMIN_OPTIONS: Array<{ value: AdminFilter; label: string }> = [
  { value: "todas", label: "Todas disponíveis" },
  { value: "bb", label: "BB Consórcios" },
  { value: "embracon", label: "Embracon" },
  { value: "maggi", label: "Maggi" },
];
const SELECTED_OFFER_STORAGE = "@consulmax:radar-ofertas:selected-offer-v1";

const DEFAULT_INPUT: RadarInput = {
  modo: "credito",
  administradora: "todas",
  segmento: "Automóvel",
  creditoLiquido: "150000",
  parcelaDesejada: "1500",
  lanceProprio: "30000",
  prazoContemplacao: "6",
  usarEmbutido: "ia",
  probabilidadeMinima: "80",
};

function onlyNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white/75 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-black" style={{ color: C.navy }}>{value}</div>
    </div>
  );
}

function CardLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 font-black" style={{ color: C.navy }}>{value}</div>
    </div>
  );
}

function OfferCard({ offer, rank, onOpen, onCopy }: { offer: RadarOffer; rank: number; onOpen: () => void; onCopy: () => void }) {
  const isFeatured = rank === 1;
  const probabilityLabel = offer.probabilidadeContemplacao >= 95 ? "Alta" : offer.probabilidadeContemplacao >= 90 ? "Boa" : "Média";

  return (
    <Card
      className="relative overflow-hidden rounded-[28px] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"
      style={{
        borderColor: isFeatured ? C.ruby : "rgba(15,23,42,.10)",
        borderWidth: isFeatured ? 2 : 1,
        boxShadow: isFeatured ? "0 18px 42px rgba(161,28,39,.18)" : undefined,
      }}
    >
      {isFeatured && (
        <div className="absolute left-0 right-0 top-0 flex items-center gap-2 px-4 py-2 text-xs font-black text-white" style={{ background: C.ruby }}>
          <Trophy className="h-3.5 w-3.5" /> Recomendado pela IA
        </div>
      )}

      <CardContent className={isFeatured ? "p-5 pt-12" : "p-5"}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.08em] text-slate-500">
              <Building2 className="h-3.5 w-3.5" /> {offer.admin.name}
            </div>
            <h3 className="mt-2 truncate text-base font-black" style={{ color: C.navy }}>
              {offer.nomeTabela}
            </h3>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-black" style={{ color: C.navy }}>{offer.grupoCodigo ? `Grupo ${offer.grupoCodigo}` : `#${rank}`}</div>
            <button type="button" onClick={onCopy} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
              <Send className="h-3.5 w-3.5" /> Enviar PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Valor contratado</div>
            <div className="mt-1 text-lg font-black" style={{ color: C.navy }}>{brMoney(offer.creditoContratado)}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Crédito líquido</div>
            <div className="mt-1 text-lg font-black" style={{ color: C.ruby }}>{brMoney(offer.creditoLiquido)}</div>
          </div>
        </div>

        <div className="my-5 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "rgba(161,28,39,.08)" }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-[5px] bg-white text-center"
              style={{ borderColor: C.ruby, color: C.ruby }}
            >
              <span className="text-base font-black leading-none">{Math.round(offer.probabilidadeContemplacao)}%</span>
              <span className="text-[9px] font-bold leading-none">{probabilityLabel}</span>
            </div>
            <div className="text-xs text-slate-600">
              <div className="font-black" style={{ color: C.navy }}>Assertividade</div>
              <div>{offer.scoreLabel}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-black" style={{ color: C.ruby }}>
              {Math.max(1, offer.prazoContemplacaoDesejado || 3)} meses
            </div>
            <div className="text-xs font-semibold text-slate-500">até a contemplação</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
          <CardLine label="Lance próprio" value={brMoney(offer.lanceProprio)} />
          <CardLine label="% lance próprio" value={brPct(offer.lanceProprioPct)} />
          <CardLine label="Parcela inicial" value={brMoney(offer.parcelaInicial)} />
          <CardLine label="Parcela pós" value={brMoney(offer.parcelaAposContemplacao)} />
          <CardLine label="Lance embutido" value={brMoney(offer.lanceEmbutido)} />
          <CardLine label="Prazo total" value={`${offer.prazoTotal} meses`} />
          <CardLine label="Taxa adm." value={brPct(offer.taxaAdmPct)} />
          <CardLine label="Fundo reserva" value={brPct(offer.fundoReservaPct)} />
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-3">
          <div className="text-xs font-bold" style={{ color: C.navy }}>Estratégia sugerida</div>
          <p className="mt-1 text-xs text-slate-600">{offer.estrategia}</p>
          {offer.motivos[0] && <p className="mt-2 text-xs text-slate-500">{offer.motivos[0]}</p>}
          {offer.alertas[0] && <p className="mt-2 text-xs text-amber-700">{offer.alertas[0]}</p>}
        </div>

        <div className="mt-5 space-y-2">
          <Button variant="ghost" className="w-full rounded-2xl font-black text-slate-700">
            Expandir detalhes <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
          <Button className="w-full rounded-2xl text-white" style={{ background: C.ruby }} onClick={onOpen}>
            Seguir contratação <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RadarOfertas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sourceData, setSourceData] = useState<RadarSourceData>({
    admins: [],
    bbGroups: [],
    embraconTables: [],
    maggiGroups: [],
  });
  const [input, setInput] = useState<RadarInput>(DEFAULT_INPUT);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const [adminsRes, tablesRes, bbGroupsRes, maggiGroupsRes] = await Promise.all([
        supabase.from("sim_admins").select("*").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*"),
        supabase.from("sim_bb_groups").select("*"),
        supabase.from("sim_maggi_groups").select("*"),
      ]);

      if (!alive) return;

      setSourceData({
        admins: (adminsRes.data || []) as AdminRow[],
        embraconTables: (tablesRes.data || []) as AnyRow[],
        bbGroups: (bbGroupsRes.data || []) as AnyRow[],
        maggiGroups: (maggiGroupsRes.data || []) as AnyRow[],
      });
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const offers = useMemo(() => findBestOffers(input, sourceData), [input, sourceData]);

  function update<K extends keyof RadarInput>(key: K, value: RadarInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
    setSearched(false);
  }

  function copyOffer(offer: RadarOffer) {
    const text = [
      "Radar de Ofertas Consulmax",
      `Administradora: ${offer.admin.name}`,
      `Tabela/Grupo: ${offer.nomeTabela}`,
      offer.grupoCodigo ? `Grupo: ${offer.grupoCodigo}` : null,
      `Crédito contratado: ${brMoney(offer.creditoContratado)}`,
      `Poder de compra estimado: ${brMoney(offer.creditoLiquido)}`,
      `Parcela inicial: ${brMoney(offer.parcelaInicial)}`,
      `Parcela pós-contemplação: ${brMoney(offer.parcelaAposContemplacao)}`,
      `Lance próprio: ${brMoney(offer.lanceProprio)} (${brPct(offer.lanceProprioPct)})`,
      `Lance embutido: ${brMoney(offer.lanceEmbutido)} (${brPct(offer.lanceEmbutidoPct)})`,
      `Probabilidade estimada: ${brPct(offer.probabilidadeContemplacao)}`,
      `Estratégia: ${offer.estrategia}`,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function openOfferInSimulator(offer: RadarOffer) {
    try {
      sessionStorage.setItem(
        SELECTED_OFFER_STORAGE,
        JSON.stringify({ source: "radar-ofertas", savedAt: new Date().toISOString(), offer })
      );
    } catch {}

    navigate(`${offer.simulatorPath}?${offerToSimulatorQuery(offer)}`);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando Radar de Ofertas...
      </div>
    );
  }

  if (searched) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <section
          className="relative overflow-hidden rounded-[30px] border p-6 md:p-8 shadow-sm"
          style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
        >
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.30)" }} />
          <div className="relative z-[1] flex flex-col gap-4 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> Resultado do Radar
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-4xl">Melhores ofertas calculadas pelos motores reais</h1>
              <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
                Critérios: {input.modo === "credito" ? `poder de compra de ${brMoney(onlyNumber(input.creditoLiquido))}` : `parcela de ${brMoney(onlyNumber(input.parcelaDesejada))}`}, segmento {input.segmento}, lance próprio de {brMoney(onlyNumber(input.lanceProprio))} e probabilidade mínima de {brPct(onlyNumber(input.probabilidadeMinima))}.
              </p>
            </div>
            <Button variant="outline" className="rounded-2xl border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => setSearched(false)}>
              Voltar e ajustar busca
            </Button>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Ofertas aprovadas" value={`${offers.length}`} />
          <Metric label="Fonte" value={ADMIN_OPTIONS.find((item) => item.value === input.administradora)?.label || "Todas"} />
          <Metric label="Embutido" value={input.usarEmbutido === "ia" ? "IA Decide" : input.usarEmbutido === "sim" ? "Sim" : "Não"} />
          <Metric label="Prazo desejado" value={`${onlyNumber(input.prazoContemplacao) || 0} meses`} />
        </div>

        {offers.length === 0 ? (
          <Card className="rounded-[28px] border bg-white/80 p-6 text-sm text-slate-600">
            Nenhuma combinação atingiu a probabilidade mínima solicitada. Ajuste crédito/parcela, lance próprio, administradora ou probabilidade mínima.
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {offers.map((offer, index) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                rank={index + 1}
                onOpen={() => openOfferInSimulator(offer)}
                onCopy={() => copyOffer(offer)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section
        className="relative overflow-hidden rounded-[30px] border p-6 md:p-8 shadow-sm"
        style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.30)" }} />
        <div className="absolute -bottom-24 left-12 h-60 w-60 rounded-full blur-3xl" style={{ background: "rgba(255,255,255,.12)" }} />
        <div className="relative z-[1] max-w-4xl text-white">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <Target className="h-3.5 w-3.5" /> Radar de Ofertas
          </div>
          <h1 className="text-2xl font-black tracking-tight md:text-4xl">Encontre a melhor oferta usando os motores dos simuladores.</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
            O Radar consulta BB, Embracon e Maggi, aplica as regras configuradas em cada simulador/tabela/grupo e retorna somente ofertas com probabilidade igual ou superior ao filtro.
          </p>
        </div>
      </section>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-black" style={{ color: C.navy }}>Buscar ofertas</h2>
            <p className="text-sm text-slate-600">Escolha o objetivo, o segmento e deixe o Radar testar as combinações permitidas.</p>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => update("modo", "credito")}
              className="rounded-2xl border p-4 text-left transition"
              style={{ borderColor: input.modo === "credito" ? C.ruby : "rgba(30,41,63,.14)", background: input.modo === "credito" ? "rgba(161,28,39,.07)" : "white" }}
            >
              <div className="font-black" style={{ color: C.navy }}>Buscar por crédito</div>
              <div className="text-sm text-slate-600">Informe o poder de compra desejado na contemplação.</div>
            </button>
            <button
              type="button"
              onClick={() => update("modo", "parcela")}
              className="rounded-2xl border p-4 text-left transition"
              style={{ borderColor: input.modo === "parcela" ? C.ruby : "rgba(30,41,63,.14)", background: input.modo === "parcela" ? "rgba(161,28,39,.07)" : "white" }}
            >
              <div className="font-black" style={{ color: C.navy }}>Buscar por parcela</div>
              <div className="text-sm text-slate-600">Informe a parcela e veja quanto crédito dá para contratar.</div>
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {input.modo === "credito" ? (
              <Field label="Crédito líquido desejado">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.creditoLiquido} onChange={(e) => update("creditoLiquido", e.target.value)} placeholder="150000" />
              </Field>
            ) : (
              <Field label="Parcela desejada">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.parcelaDesejada} onChange={(e) => update("parcelaDesejada", e.target.value)} placeholder="1500" />
              </Field>
            )}

            <Field label="Lance próprio disponível">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.lanceProprio} onChange={(e) => update("lanceProprio", e.target.value)} placeholder="30000" />
            </Field>
            <Field label="Prazo desejado para contemplação">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.prazoContemplacao} onChange={(e) => update("prazoContemplacao", e.target.value)} placeholder="6 meses" />
            </Field>
            <Field label="Segmento">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.segmento} onChange={(e) => update("segmento", e.target.value as RadarSegment)}>
                {RADAR_SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Administradora">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.administradora} onChange={(e) => update("administradora", e.target.value as AdminFilter)}>
                {ADMIN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Usar lance embutido?">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.usarEmbutido} onChange={(e) => update("usarEmbutido", e.target.value as RadarInput["usarEmbutido"])}>
                <option value="ia">IA Decide</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </Field>
            <Field label="Probabilidade mínima">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.probabilidadeMinima} onChange={(e) => update("probabilidadeMinima", e.target.value)}>
                {PROBABILITY_OPTIONS.map((value) => <option key={value} value={value}>{value}%</option>)}
              </select>
            </Field>
            {input.modo === "credito" && (
              <Field label="Parcela máxima opcional">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.parcelaDesejada} onChange={(e) => update("parcelaDesejada", e.target.value)} placeholder="1500" />
              </Field>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="rounded-2xl" onClick={() => setInput(DEFAULT_INPUT)}>Limpar filtros</Button>
            <Button className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={() => setSearched(true)}>
              <Search className="mr-2 h-4 w-4" /> Buscar melhores ofertas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <h2 className="text-lg font-black" style={{ color: C.navy }}>Motores conectados</h2>
          <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-3">
            <div className="rounded-2xl border bg-white/75 p-4">
              <b>BB Consórcios</b>
              <p className="mt-1">Usa `sim_bb_groups.config.creditRanges` e `assemblyResult`.</p>
            </div>
            <div className="rounded-2xl border bg-white/75 p-4">
              <b>Embracon</b>
              <p className="mt-1">Usa `sim_tables`, `sim_admins.rules`, antecipação, limitador e formas reduzidas.</p>
            </div>
            <div className="rounded-2xl border bg-white/75 p-4">
              <b>Maggi</b>
              <p className="mt-1">Usa `sim_maggi_groups.config`, prazo, lances, customRule e primeira parcela.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

