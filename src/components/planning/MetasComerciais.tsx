// Metas comerciais transferidas da Carteira para Planejamento & Playbook.
// Fonte única: public.metas_vendedores. Realizado: encarteiramentos líquidos por competência RO.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { portfolioDay, portfolioMonthlySeries } from "@/lib/portfolioMetrics";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

type Person = {
  id: string;
  auth_user_id: string;
  nome: string;
  email?: string | null;
  user_role?: string | null;
  is_active?: boolean | null;
};
type MetasComerciaisProps = { currentUser: Person | null; users: Person[] };
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const currency = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const formatNumberBR = (n: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const formatPctHuman = (n: number, digits = 1) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(n || 0)}%`;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

const monthAlreadyHappened = (year: number, monthIndex: number) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (year < currentYear) return true;
  if (year > currentYear) return false;
  return monthIndex <= currentMonth;
};

const annualExpectedPercent = (year: number) => {
  const now = new Date();
  const currentYear = now.getFullYear();

  if (year < currentYear) return 100;
  if (year > currentYear) return 0;

  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const totalMs = end.getTime() - start.getTime();

  const todayEnd = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const elapsedMs = todayEnd.getTime() - start.getTime();

  return clamp((elapsedMs / totalMs) * 100, 0, 100);
};

type PaceStatus = {
  label: "Vencendo" | "No jogo" | "Atenção" | "Risco" | "Virada necessária" | "Sem meta";
  description: string;
  pillClass: string;
  barClass: string;
  textClass: string;
};

const getPaceStatus = (diffPct: number | null, hasMeta: boolean): PaceStatus => {
  if (!hasMeta || diffPct == null || !Number.isFinite(diffPct)) {
    return {
      label: "Sem meta",
      description: "Cadastre uma meta anual para acompanhar o ritmo do jogo.",
      pillClass: "bg-gray-100 text-gray-700 border-gray-200",
      barClass: "bg-gray-300",
      textClass: "text-gray-700",
    };
  }

  if (diffPct >= 0) {
    return {
      label: "Vencendo",
      description: "Você está acima do ritmo esperado. Continue acelerando para abrir vantagem.",
      pillClass: "bg-[#1E293F]/10 text-[#1E293F] border-[#1E293F]/20",
      barClass: "bg-[#1E293F]",
      textClass: "text-[#1E293F]",
    };
  }

  if (diffPct >= -5) {
    return {
      label: "No jogo",
      description: "Você está muito próximo do ritmo. Pequenos avanços já colocam a meta em vantagem.",
      pillClass: "bg-blue-100 text-blue-800 border-blue-200",
      barClass: "bg-blue-600",
      textClass: "text-blue-800",
    };
  }

  if (diffPct >= -15) {
    return {
      label: "Atenção",
      description: "Você está abaixo do ritmo, mas ainda em zona recuperável. Priorize oportunidades quentes.",
      pillClass: "bg-amber-100 text-amber-800 border-amber-200",
      barClass: "bg-amber-500",
      textClass: "text-amber-800",
    };
  }

  if (diffPct >= -30) {
    return {
      label: "Risco",
      description: "O jogo está ficando perigoso. É hora de intensificar follow-ups e propostas.",
      pillClass: "bg-orange-100 text-orange-800 border-orange-200",
      barClass: "bg-orange-600",
      textClass: "text-orange-800",
    };
  }

  return {
    label: "Virada necessária",
    description: "Você está muito abaixo do ritmo esperado. Foque em ações de impacto imediato.",
    pillClass: "bg-red-100 text-red-800 border-red-200",
    barClass: "bg-red-700",
    textClass: "text-red-800",
  };
};


type MiniDonutProps = {
  label: string;
  year: number;
  meta: number;
  realizado: number;
};

const MiniDonut: React.FC<MiniDonutProps> = ({ label, year, meta, realizado }) => {
  const hasMeta = meta > 0;
  const pct = hasMeta ? (realizado / meta) * 100 : null;

  const data = useMemo(() => {
    if (!hasMeta) {
      if (realizado > 0) return [{ name: "Realizado", value: realizado }];
      return [{ name: "Sem meta", value: 1 }];
    }
    if (realizado <= meta) {
      return [
        { name: "Realizado", value: Math.max(0, realizado) },
        { name: "Restante", value: Math.max(0, meta - realizado) },
      ];
    }
    return [
      { name: "Meta", value: meta },
      { name: "Excedente", value: Math.max(0, realizado - meta) },
    ];
  }, [hasMeta, meta, realizado]);

  const centerText = useMemo(() => {
    if (!hasMeta) return "—";
    if (pct == null || !Number.isFinite(pct)) return "—";
    return formatPctHuman(pct, 0);
  }, [hasMeta, pct]);

  const diffLabel = hasMeta && realizado > meta ? "Excedente" : "Falta";
  const diffValue = hasMeta ? Math.abs(meta - realizado) : 0;

  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {label}/{year}
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-gray-600">
            <div>
              Meta: <strong className="text-gray-900">{currency(meta || 0)}</strong>
            </div>
            <div>
              Realizado: <strong className="text-gray-900">{currency(realizado || 0)}</strong>
            </div>
            <div>
              {diffLabel}: <strong className="text-gray-900">{hasMeta ? currency(diffValue) : "—"}</strong>
            </div>
          </div>
        </div>

        <div className="relative h-16 w-16 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} innerRadius={22} outerRadius={31} dataKey="value" stroke="none">
                {data.map((d, i) => {
                  if (!hasMeta) return <Cell key={`${label}-${i}`} fill={realizado > 0 ? "#1E293F" : "#E5E7EB"} />;
                  if (d.name === "Realizado" || d.name === "Meta") return <Cell key={`${label}-${i}`} fill="#1E293F" />;
                  if (d.name === "Restante") return <Cell key={`${label}-${i}`} fill="#A11C27" />;
                  return <Cell key={`${label}-${i}`} fill="#B5A573" />;
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-xs font-bold text-gray-900">{centerText}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

type AtingimentoMesesProps = {
  selectedYear: number;
  metas: number[];
  realizados: number[];
};

const AtingimentoMeses: React.FC<AtingimentoMesesProps> = ({ selectedYear, metas, realizados }) => {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">Atingimento</div>
          <div className="text-xs text-gray-500">Encarteiramento líquido por mês</div>
        </div>
        <div className="text-xs text-gray-500">{selectedYear}</div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2">
        {MONTHS.map((m, idx) => {
          const meta = metas[idx] || 0;
          const realizado = realizados[idx] || 0;
          const happened = monthAlreadyHappened(selectedYear, idx);

          let icon = "—";
          let cls = "text-gray-400";
          let title = "Mês ainda não ocorreu ou sem meta";

          if (meta > 0 && happened) {
            if (realizado >= meta) {
              icon = "✓";
              cls = "text-[#1E293F]";
              title = "Meta atingida";
            } else {
              icon = "×";
              cls = "text-red-600";
              title = "Meta não atingida";
            }
          }

          return (
            <div key={m} className="flex items-center justify-between rounded-xl bg-gray-50 px-2 py-1.5" title={title}>
              <span className="text-xs font-medium text-gray-700">{m}</span>
              <span className={`text-base font-black leading-none ${cls}`}>{icon}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};


export default function MetasComerciais({ currentUser, users }: MetasComerciaisProps) {
  const isAdmin = currentUser?.user_role === "admin";
  const nowInRo = portfolioDay(new Date().toISOString()) || "";
  const currentYear = Number(nowInRo.slice(0, 4)) || new Date().getFullYear();

  const [selectedSeller, setSelectedSeller] = useState("");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [metaMensal, setMetaMensal] = useState<number[]>(Array(12).fill(0));
  const [realizadoMensal, setRealizadoMensal] = useState<number[]>(Array(12).fill(0));
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [metaOverlay, setMetaOverlay] = useState({ open: false });
  const [metaForm, setMetaForm] = useState<{ vendedor_id: string; ano: number; m: number[] }>({
    vendedor_id: "", ano: currentYear, m: Array(12).fill(0)
  });
  const [savingMeta, setSavingMeta] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formLoadFailed, setFormLoadFailed] = useState(false);
  const [monthlyInputs, setMonthlyInputs] = useState<string[]>(Array(12).fill("0,00"));
  const [formError, setFormError] = useState("");
  const latestRequestId = useRef(0);
  const latestFormRequestId = useRef(0);

  useEffect(() => {
    if (!currentUser) return;
    // Vendedores acessam exclusivamente as próprias metas; o admin pode consultar toda a equipe.
    if (!isAdmin) setSelectedSeller(currentUser.id);
  }, [currentUser?.id, isAdmin]);

  const getAuthByUserId = useCallback((sellerId: string) => {
    if (!sellerId) return "";
    return users.find((u) => u.id === sellerId)?.auth_user_id ||
      (currentUser?.id === sellerId ? currentUser.auth_user_id : "");
  }, [users, currentUser]);

  const loadMetrics = useCallback(async () => {
    if (!currentUser) return;
    if (!isAdmin && selectedSeller !== currentUser.id) return;
    const requestId = ++latestRequestId.current;
    setLoadingMetrics(true);
    setMetricsError("");
    try {
      const yearStart = new Date(`${selectedYear}-01-01T00:00:00-04:00`).toISOString();
      const yearEnd = new Date(`${selectedYear + 1}-01-01T00:00:00-04:00`).toISOString();
      let goalsQuery = supabase.from("metas_vendedores")
        .select("vendedor_id,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("ano", selectedYear);
      if (selectedSeller) goalsQuery = goalsQuery.eq("vendedor_id", selectedSeller);
      let salesQuery = supabase.from("vendas")
        .select("valor_venda,encarteirada_em,cancelada_em,vendedor_id")
        .eq("status", "encarteirada")
        .or(`and(encarteirada_em.gte.${yearStart},encarteirada_em.lt.${yearEnd}),and(cancelada_em.gte.${yearStart},cancelada_em.lt.${yearEnd})`);
      if (selectedSeller) {
        const authId = getAuthByUserId(selectedSeller);
        if (!authId) throw new Error("Não foi encontrado o vínculo de autenticação do vendedor.");
        salesQuery = salesQuery.eq("vendedor_id", authId);
      }
      const [goalsResult, salesResult] = await Promise.all([goalsQuery, salesQuery]);
      if (goalsResult.error) throw goalsResult.error;
      if (salesResult.error) throw salesResult.error;
      const newGoals = Array(12).fill(0);
      (goalsResult.data || []).forEach((row: any) => {
        for (let i = 0; i < 12; i += 1) newGoals[i] += Number(row[`m${String(i + 1).padStart(2, "0")}`] || 0);
      });
      const months = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, "0")}`);
      const sales = portfolioMonthlySeries(salesResult.data || [], months);
      if (requestId !== latestRequestId.current) return;
      setMetaMensal(newGoals);
      setRealizadoMensal(sales.map((row) => Number(row.liquido || 0)));
    } catch (error: any) {
      if (requestId === latestRequestId.current) {
        setMetricsError(error?.message || "Não foi possível carregar as metas.");
      }
    } finally {
      if (requestId === latestRequestId.current) setLoadingMetrics(false);
    }
  }, [currentUser, isAdmin, selectedSeller, selectedYear, getAuthByUserId]);

  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  useEffect(() => {
    if (!metaOverlay.open || !metaForm.vendedor_id || !isAdmin) return;
    const requestId = ++latestFormRequestId.current;
    setFormLoading(true);
    setFormLoadFailed(false);
    const sellerId = metaForm.vendedor_id;
    const year = metaForm.ano;
    (async () => {
      const { data, error } = await supabase.from("metas_vendedores")
        .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("vendedor_id", sellerId).eq("ano", year).maybeSingle();
      if (requestId !== latestFormRequestId.current) return;
      if (error) {
        setFormError(error.message);
        setFormLoadFailed(true);
        setFormLoading(false);
        return;
      }
      const values = Array.from({ length: 12 }, (_, i) => Number((data as any)?.[`m${String(i + 1).padStart(2, "0")}`] || 0));
      setMetaForm((prev) => prev.vendedor_id === sellerId && prev.ano === year ? { ...prev, m: values } : prev);
      setMonthlyInputs(values.map(formatNumberBR));
      setFormLoading(false);
    })();
  }, [metaOverlay.open, metaForm.vendedor_id, metaForm.ano, isAdmin]);

  const metaAnual = useMemo(() => metaMensal.reduce((a, b) => a + b, 0), [metaMensal]);
  const realizadoAnual = useMemo(() => realizadoMensal.reduce((a, b) => a + b, 0), [realizadoMensal]);
  const pctAnual = metaAnual > 0 ? (realizadoAnual / metaAnual) * 100 : null;
  const expectedAnnualPct = annualExpectedPercent(selectedYear);
  const expectedAnnualValue = metaAnual * expectedAnnualPct / 100;
  const annualPaceGapValue = realizadoAnual - expectedAnnualValue;
  const annualPaceGapPct = pctAnual === null ? null : pctAnual - expectedAnnualPct;
  const paceStatus = getPaceStatus(annualPaceGapPct, metaAnual > 0);
  const annualFillPct = clamp(pctAnual ?? 0, 0, 100);
  const annualExpectedMarkerPct = clamp(expectedAnnualPct, 0, 100);
  const donutAnualData = useMemo(() => {
    if (metaAnual <= 0) return [{ name: realizadoAnual > 0 ? "Realizado" : "Sem meta", value: Math.max(1, realizadoAnual) }];
    if (realizadoAnual <= metaAnual) return [
      { name: "Realizado", value: Math.max(0, realizadoAnual) },
      { name: "Restante", value: Math.max(0, metaAnual - realizadoAnual) }
    ];
    return [
      { name: "Meta", value: metaAnual },
      { name: "Excedente", value: Math.max(0, realizadoAnual - metaAnual) }
    ];
  }, [metaAnual, realizadoAnual]);

  const handleOpenMeta = () => {
    if (!isAdmin) return;
    setFormError("");
    setFormLoadFailed(false);
    setSuccessMessage("");
    setMetaForm({ vendedor_id: selectedSeller || "", ano: selectedYear, m: Array(12).fill(0) });
    setMonthlyInputs(Array(12).fill("0,00"));
    setFormLoading(Boolean(selectedSeller));
    setMetaOverlay({ open: true });
  };

  const saveMeta = async () => {
    if (!isAdmin || savingMeta || formLoading || formLoadFailed) return;
    setFormError("");
    if (!metaForm.vendedor_id) { setFormError("Selecione um vendedor."); return; }
    const authId = getAuthByUserId(metaForm.vendedor_id);
    if (!authId) { setFormError("Usuário sem vínculo de autenticação."); return; }
    if (metaForm.m.some((value) => !Number.isFinite(value) || value < 0)) {
      setFormError("As metas devem ser valores válidos e não negativos.");
      return;
    }
    setSavingMeta(true);
    try {
      const payload: Record<string, any> = {
        vendedor_id: metaForm.vendedor_id, auth_user_id: authId, ano: metaForm.ano
      };
      metaForm.m.forEach((value, i) => { payload[`m${String(i + 1).padStart(2, "0")}`] = value; });
      const existing = await supabase.from("metas_vendedores").select("id")
        .eq("vendedor_id", metaForm.vendedor_id).eq("ano", metaForm.ano).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.id) {
        const { error } = await supabase.from("metas_vendedores").update(payload).eq("id", existing.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("metas_vendedores").insert(payload);
        if (error) throw error;
      }
      setMetaOverlay({ open: false });
      setSuccessMessage("Metas salvas com sucesso.");
      await loadMetrics();
    } catch (error: any) {
      setFormError(error?.message || "Não foi possível salvar as metas.");
    } finally {
      setSavingMeta(false);
    }
  };

  if (!currentUser) {
    return <div className="rounded-2xl border bg-white p-5 text-sm text-gray-500">Carregando dados do usuário...</div>;
  }

  return (
    <div className="space-y-4">
      {successMessage && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMessage}</div>}
      {metricsError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{metricsError}</div>}
      {loadingMetrics && <div role="status" className="text-xs text-slate-500">Atualizando indicadores...</div>}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#1E293F]">Metas Comerciais</h2>
            <p className="text-xs text-gray-500">Competência pela data do encarteiramento • Cancelamentos descontados no mês</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select className="w-full border rounded-xl px-3 py-2" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {Array.from({ length: 6 }).map((_, i) => {
                const y = new Date().getFullYear() - 1 + i;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>

            {isAdmin && (
              <select aria-label="Vendedor para análise de metas" className="w-full border rounded-xl px-3 py-2" value={selectedSeller} onChange={(e) => setSelectedSeller(e.target.value)}>
                <option value="">Todos</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome || u.email || u.id}
                  </option>
                ))}
              </select>
            )}
            {isAdmin && (
              <button type="button" onClick={handleOpenMeta} className="rounded-xl bg-[#A11C27] px-4 py-2 text-sm font-semibold text-white hover:bg-[#861924]">Cadastrar / editar meta</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.7fr_120px] gap-5 items-center">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Meta Anual • Encarteiramento líquido</div>

                <div className="mt-3 text-sm text-gray-700 space-y-1">
                  <div>
                    Meta: <strong>{currency(metaAnual)}</strong>
                  </div>
                  <div>
                    Realizado: <strong>{currency(realizadoAnual)}</strong>
                  </div>
                  <div>
                    {metaAnual > 0 && realizadoAnual > metaAnual ? "Excedente" : "Falta"}:{" "}
                    <strong>{metaAnual > 0 ? currency(Math.abs(metaAnual - realizadoAnual)) : "—"}</strong>
                  </div>
                </div>

                <div className="mt-3 inline-flex items-center rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  {pctAnual == null ? "Sem percentual" : `Atingiu ${formatPctHuman(pctAnual, 1)}`}
                </div>
              </div>

              <div className="min-w-0 flex flex-col justify-center">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-2 max-w-[420px] mx-auto w-full">
                  <span>
                    Atingido: <strong className="text-gray-900">{pctAnual == null ? "—" : formatPctHuman(pctAnual, 1)}</strong>
                  </span>
                  <span>
                    Esperado: <strong className="text-gray-900">{formatPctHuman(expectedAnnualPct, 1)}</strong>
                  </span>
                </div>

                <div className="relative h-5 rounded-full bg-gray-100 border overflow-hidden max-w-[420px] mx-auto w-full">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full ${paceStatus.barClass}`}
                    style={{ width: `${annualFillPct}%` }}
                    title={`Atingido: ${pctAnual == null ? "—" : formatPctHuman(pctAnual, 1)}`}
                  />

                  <div
                    className="absolute top-[-4px] h-7 w-[3px] rounded-full bg-[#1E293F]"
                    style={{ left: `calc(${annualExpectedMarkerPct}% - 1.5px)` }}
                    title={`Esperado: ${formatPctHuman(expectedAnnualPct, 1)}`}
                  />

                  <div
                    className="absolute top-[3px] h-3 w-3 rounded-full bg-white border-2 border-[#1E293F]"
                    style={{ left: `calc(${annualExpectedMarkerPct}% - 6px)` }}
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 max-w-[420px] mx-auto w-full">
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    Esperado até hoje
                    <div className="text-sm font-semibold text-gray-900">{currency(expectedAnnualValue)}</div>
                  </div>

                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    Ritmo do jogo
                    <div className={`text-sm font-semibold ${paceStatus.textClass}`}>
                      {annualPaceGapValue >= 0 ? "+" : "-"}
                      {currency(Math.abs(annualPaceGapValue))}
                    </div>
                  </div>
                </div>

                <div className={`mt-3 rounded-2xl border px-3 py-2 max-w-[420px] mx-auto w-full ${paceStatus.pillClass}`}>
                  <div className="text-sm font-bold">{paceStatus.label}</div>
                  <div className="text-xs mt-0.5">{paceStatus.description}</div>
                </div>
              </div>

              <div className="h-28 w-28 relative mx-auto shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutAnualData} innerRadius={40} outerRadius={54} dataKey="value" stroke="none">
                      {donutAnualData.map((d, i) => {
                        if (metaAnual <= 0) return <Cell key={`anual-${i}`} fill={realizadoAnual > 0 ? "#1E293F" : "#E5E7EB"} />;
                        if (d.name === "Realizado" || d.name === "Meta") return <Cell key={`anual-${i}`} fill="#1E293F" />;
                        if (d.name === "Restante") return <Cell key={`anual-${i}`} fill="#A11C27" />;
                        return <Cell key={`anual-${i}`} fill="#B5A573" />;
                      })}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-sm font-bold text-gray-900">{pctAnual == null ? "—" : formatPctHuman(pctAnual, 0)}</div>
                </div>
              </div>
            </div>

            {isAdmin && selectedSeller && (
              <div className="mt-3 text-[11px] text-gray-500">
                Vendedor: <strong className="text-gray-800">{users.find((u) => u.id === selectedSeller)?.nome ?? selectedSeller}</strong>
              </div>
            )}
          </div>

          <div className="xl:col-span-2">
            <AtingimentoMeses selectedYear={selectedYear} metas={metaMensal} realizados={realizadoMensal} />
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-900">Metas mensais</div>
            <div className="text-xs text-gray-500">Ano {selectedYear} • Resultado líquido</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {MONTHS.map((m, idx) => (
              <MiniDonut key={m} label={m} year={selectedYear} meta={metaMensal[idx] || 0} realizado={realizadoMensal[idx] || 0} />
            ))}
          </div>
        </div>

      </section>

      {metaOverlay.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Cadastrar Meta</h3>
              <button onClick={() => setMetaOverlay({ open: false })} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Vendedor</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={metaForm.vendedor_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    setFormError("");
                    setFormLoadFailed(false);
                    setFormLoading(Boolean(id));
                    setMetaForm((p) => ({ ...p, vendedor_id: id, m: Array(12).fill(0) }));
                    setMonthlyInputs(Array(12).fill("0,00"));
                  }}
                  disabled={!isAdmin}
                >
                  <option value="">Selecione</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome || u.email || u.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Ano</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={metaForm.ano}
                  onChange={(e) => {
                    const newYear = Number(e.target.value);
                    setFormError("");
                    setFormLoadFailed(false);
                    setFormLoading(Boolean(metaForm.vendedor_id));
                    setMetaForm((p) => ({ ...p, ano: newYear, m: Array(12).fill(0) }));
                    setMonthlyInputs(Array(12).fill("0,00"));
                  }}
                >
                  {Array.from({ length: 6 }).map((_, i) => {
                    const y = new Date().getFullYear() - 1 + i;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {MONTHS.map((m, i) => (
                <div key={i}>
                  <label className="text-sm text-gray-600">{m}</label>
                  <input
                    type="text"
                    className="w-full border rounded-xl px-3 py-2"
                    inputMode="decimal"
                    aria-label={`Meta de ${m} de ${metaForm.ano}`}
                    value={monthlyInputs[i] || ""}
                    disabled={formLoading || savingMeta}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setFormError("");
                      setMonthlyInputs((prev) => prev.map((v, j) => j === i ? raw : v));
                      const normalized = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
                      const parsed = normalized ? Number(normalized) : 0;
                      setMetaForm((prev) => {
                        const arr = [...prev.m];
                        arr[i] = Number.isFinite(parsed) ? parsed : NaN;
                        return { ...prev, m: arr };
                      });
                    }}
                    onBlur={() => {
                      if (Number.isFinite(metaForm.m[i]) && metaForm.m[i] >= 0) {
                        setMonthlyInputs((prev) => prev.map((v, j) => j === i ? formatNumberBR(metaForm.m[i]) : v));
                      }
                    }}
                  />
                </div>
              ))}
            </div>

            {formLoading && <div role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Carregando as metas existentes deste vendedor e ano...</div>}
            {formError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
            <div className="flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-xl border" onClick={() => setMetaOverlay({ open: false })}>
                Cancelar
              </button>
              <button className="px-4 py-2 rounded-xl bg-[#A11C27] text-white hover:opacity-90" onClick={saveMeta} disabled={savingMeta || formLoading || formLoadFailed}>
                {savingMeta ? "Salvando..." : formLoading ? "Carregando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
