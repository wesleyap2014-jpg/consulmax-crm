// Painel temporario da campanha Acelera Consulmax (26/10 a 31/12/2026).
// Nenhum bonus exibido representa promessa de pagamento: depende da apuracao final.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CheckCircle2, Flag, Gauge, RefreshCcw, Trophy, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

type CRMUser = { id: string; auth_user_id: string; nome: string; is_active?: boolean | null };
type Sale = {
  id: string; vendedor_id: string; data_venda: string; valor_venda: number | null;
  administradora: string | null; tipo_venda: string | null; contemplada: boolean | null;
  status: string | null; codigo: string | null; cancelada_em: string | null; reativada_em: string | null;
  encarteirada_em: string | null; grupo: string | null; cota: string | null; inad: boolean | null;
};
type Validation = { venda_id: string; primeira_parcela_paga: boolean; data_confirmacao: string | null };
type Computed = ReturnType<typeof calculate>;
const CAMPAIGN_START = "2026-10-26";
const CAMPAIGN_END = "2026-12-31";
const HIDE_AFTER = "2027-02-20";
const NOV_END = "2026-11-30";
const fmt = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const cents = (n: number | null | undefined) => Math.max(0, Math.round(Number(n || 0) * 100));
const normalize = (v: unknown) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const localTime = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Porto_Velho", hour12: false }).replace(" ", "T");
function eligible(v: Sale) {
  const adm = normalize(v.administradora);
  if (!(adm.includes("embracon") || adm.includes("maggi") || adm.includes("bb consorcios") || adm === "bb")) return false;
  const kind = normalize(v.tipo_venda);
  // 'contemplada' pode se tornar true depois de uma venda normal, por isso a modalidade de origem prevalece.
  if (kind.includes("contemplad")) return false;
  if (!kind && v.contemplada) return false;
  return v.data_venda >= CAMPAIGN_START && v.data_venda <= CAMPAIGN_END && cents(v.valor_venda) > 0;
}
function cancelled(v: Sale) {
  if (v.codigo && v.codigo !== "00") return true;
  if (["cancelado", "cancelada"].includes(normalize(v.status))) return true;
  if (v.cancelada_em && (!v.reativada_em || v.reativada_em <= v.cancelada_em)) return true;
  return false;
}
function allocated(v: Sale) {
  return normalize(v.status) === "encarteirada" && Boolean(v.encarteirada_em && v.grupo?.trim() && v.cota?.trim());
}
function rateBps(net: number) {
  if (net > 100000000) return 30;  // > R$ 1 milhao
  if (net > 50000000) return 20;
  if (net > 20000000) return 15;
  if (net >= 10000000) return 10;
  return 0;
}
function nextTarget(net: number) {
  if (net < 10000000) return 10000000;
  if (net <= 20000000) return 20000001;
  if (net <= 50000000) return 50000001;
  if (net <= 100000000) return 100000001;
  return null;
}
function calculate(rows: Sale[], valid: Map<string, boolean>, date: string) {
  const selected = rows.filter(eligible);
  let gross = 0, cancels = 0, net = 0, november = 0, december = 0, awaiting = 0, atRisk = 0, confirmed = 0;
  for (const v of selected) {
    const value = cents(v.valor_venda);
    gross += value;
    const isCancel = cancelled(v);
    const isAllocated = allocated(v);
    const isPaid = valid.get(v.id) === true;
    if (isCancel) { cancels += value; continue; }
    if (v.inad) { atRisk += value; continue; }
    if (!isAllocated || !isPaid) { awaiting += value; continue; }
    confirmed += 1;
    net += value;
    if (v.data_venda <= NOV_END) november += value;
    else december += value;
  }
  const novOK = november >= 5000000;
  const decOK = december >= 5000000;
  const excluded = (date > NOV_END && !novOK) || (date > CAMPAIGN_END && !decOK);
  const bps = rateBps(net);
  const potential = excluded ? 0 : Math.round(net * bps / 10000);
  return { gross, cancels, net, november, december, awaiting, atRisk, confirmed, novOK, decOK, excluded, bps, potential, next: nextTarget(net), registered: selected.length };
}
export default function AceleraConsulmax({
  me, users, isAdmin,
}: {
  me: CRMUser | null; users: CRMUser[]; isAdmin: boolean;
}) {
  const todayTime = localTime();
  const today = todayTime.slice(0, 10);
  const visible = isAdmin || (today <= HIDE_AFTER && todayTime >= "2026-10-26T09:30");
  const [sales, setSales] = useState<Sale[]>([]);
  const [validations, setValidations] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(false);
  const [busySale, setBusySale] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("self");
  const [expanded, setExpanded] = useState(false);
  const [shown, setShown] = useState(20);
  const [version, setVersion] = useState(0);
  const load = useCallback(async () => {
    if (!me || !visible) return;
    setLoading(true);
    setError(null);
    try {
      const all: Sale[] = [];
      // Paginacao explicita: PostgREST retorna no maximo 1.000 linhas por consulta.
      for (let offset = 0; offset < 50000; offset += 500) {
        let query = supabase.from("vendas")
          .select("id,vendedor_id,data_venda,valor_venda,administradora,tipo_venda,contemplada,status,codigo,cancelada_em,reativada_em,encarteirada_em,grupo,cota,inad")
          .gte("data_venda", CAMPAIGN_START).lte("data_venda", CAMPAIGN_END)
          .order("data_venda", { ascending: false }).range(offset, offset + 499);
        if (!isAdmin) query = query.eq("vendedor_id", me.auth_user_id);
        const { data, error: salesError } = await query;
        if (salesError) throw salesError;
        const chunk = (data || []) as Sale[];
        all.push(...chunk);
        if (chunk.length < 500) break;
      }
      const valid = new Map<string, boolean>();
      const ids = all.map((v) => v.id);
      for (let i = 0; i < ids.length; i += 300) {
        const { data, error: validationError } = await supabase.from("acelera_consulmax_validacoes")
          .select("venda_id,primeira_parcela_paga,data_confirmacao").in("venda_id", ids.slice(i, i + 300));
        if (validationError) throw validationError;
        for (const row of (data || []) as Validation[]) valid.set(row.venda_id, row.primeira_parcela_paga);
      }
      setSales(all);
      setValidations(valid);
    } catch (e: any) {
      setError(String(e?.message || "Não foi possível carregar o painel."));
    } finally { setLoading(false); }
  }, [me?.auth_user_id, isAdmin, visible, version]);
  useEffect(() => { void load(); }, [load]);
  const byAuthId = useMemo(() => new Map(users.map((u) => [u.auth_user_id, u.nome])), [users]);
  const targetSeller = isAdmin && selected !== "self" ? selected : (me?.auth_user_id || "");
  const relevant = useMemo(() => targetSeller === "all"
    ? sales : sales.filter((v) => v.vendedor_id === targetSeller), [sales, targetSeller]);
  const totals = useMemo(() => {
    if (targetSeller !== "all") return calculate(relevant, validations, today);
    // Nao misturar vendedores para alcancar uma faixa que nenhum deles atingiu.
    const authIds = Array.from(new Set(sales.map((v) => v.vendedor_id)));
    const positions = authIds.map((id) => calculate(sales.filter((v) => v.vendedor_id === id), validations, today));
    return {
      gross: positions.reduce((a,p)=>a+p.gross,0),
      cancels: positions.reduce((a,p)=>a+p.cancels,0),
      net: positions.reduce((a,p)=>a+p.net,0),
      november: positions.reduce((a,p)=>a+p.november,0),
      december: positions.reduce((a,p)=>a+p.december,0),
      awaiting: positions.reduce((a,p)=>a+p.awaiting,0),
      atRisk: positions.reduce((a,p)=>a+p.atRisk,0),
      confirmed: positions.reduce((a,p)=>a+p.confirmed,0),
      novOK: false, decOK: false, excluded: false, bps: 0,
      potential: positions.reduce((a,p)=>a+p.potential,0),
      next: null, registered: positions.reduce((a,p)=>a+p.registered,0),
    } as Computed;
  }, [relevant, targetSeller, validations, today, sales]);
  const label = targetSeller === "all" ? "Visão da equipe" : byAuthId.get(targetSeller) || me?.nome || "Minha campanha";
  const progress = totals.next ? Math.min(100, Math.round(totals.net * 100 / totals.next)) : 100;
  const adminRows = useMemo(() => relevant.filter(eligible).slice().sort((a,b)=>b.data_venda.localeCompare(a.data_venda)), [relevant]);
  const savePayment = async (v: Sale, paid: boolean) => {
    if (!isAdmin || !me) return;
    setBusySale(v.id);
    setError(null);
    const { error: saveError } = await supabase.from("acelera_consulmax_validacoes").upsert({
      venda_id: v.id, primeira_parcela_paga: paid,
      data_confirmacao: paid ? today : null,
      validado_por: me.auth_user_id, atualizado_em: new Date().toISOString(),
    }, { onConflict: "venda_id" });
    if (saveError) setError("Falha na validação: " + saveError.message);
    else { setValidations((previous) => { const copy = new Map(previous); copy.set(v.id, paid); return copy; }); }
    setBusySale(null);
  };
  if (!me || !visible) return null;
  const card = "rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm";
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#B5A573]/50 bg-[#111E32] text-white shadow-xl">
      <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-[#A11C27]/40 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-[#A11C27] via-[#E0CE8C] to-[#A11C27]" />
      <div className="relative space-y-4 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#E0CE8C]"><Flag className="h-4 w-4" /> Campanha de vendas · 26/10 a 31/12/2026</p>
            <h2 className="mt-2 text-2xl font-black italic uppercase tracking-tight md:text-3xl">ACELERA <span className="text-[#E0CE8C]">CONSULMAX</span></h2>
            <p className="mt-1 text-sm text-white/75">Mais vendas, mais conquistas. Sua corrida é contra o seu próprio resultado.</p>
            <p className="mt-1 text-xs text-white/55">{label} · atualização sob demanda · apuração até 20/02/2027</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <select aria-label="Selecione o vendedor" value={selected} onChange={(e)=>setSelected(e.target.value)} className="max-w-[250px] rounded-xl border border-white/25 bg-[#1E293F] px-3 py-2 text-sm text-white">
                <option value="self">Meu resultado</option>
                <option value="all">Todos os vendedores (gestão)</option>
                {users.filter((u)=>u.is_active !== false).map((u)=><option key={u.auth_user_id} value={u.auth_user_id}>{u.nome}</option>)}
              </select>
            ) : null}
            <button type="button" onClick={()=>setVersion((v)=>v+1)} disabled={loading} className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-60">
              <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar
            </button>
          </div>
        </div>
        {isAdmin && todayTime < "2026-10-26T09:30" ? <div className="rounded-lg border border-[#E0CE8C]/40 bg-[#E0CE8C]/10 px-3 py-2 text-xs text-[#E0CE8C]">Prévia administrativa: o painel dos vendedores será liberado em 26/10, às 9h30 (Rondônia).</div> : null}
        {error ? <div role="alert" className="rounded-xl border border-red-300/50 bg-red-800/40 px-3 py-2 text-sm">{error}</div> : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={card}><div className="text-xs text-white/65">Vendas registradas</div><div className="mt-1 text-lg font-bold md:text-xl">{fmt(totals.gross)}</div><div className="text-xs text-white/50">{totals.registered} cota(s) no período</div></div>
          <div className={card}><div className="text-xs text-white/65">Vendas líquidas validadas</div><div className="mt-1 text-lg font-bold text-[#E0CE8C] md:text-xl">{fmt(totals.net)}</div><div className="text-xs text-white/50">{totals.confirmed} cota(s) válidas</div></div>
          <div className={card}><div className="text-xs text-white/65">Bonificação projetada</div><div className="mt-1 text-lg font-bold text-[#E0CE8C] md:text-xl">{fmt(totals.potential)}</div><div className="text-xs text-white/50">{targetSeller === "all" ? "Soma das projeções individuais" : totals.excluded ? "Não habilitado — excluído" : (totals.bps / 100).toFixed(2).replace(".",",") + "% · sujeita à habilitação"}</div></div>
          <div className={card}><div className="text-xs text-white/65">Cancelamentos / perdas</div><div className="mt-1 text-lg font-bold md:text-xl">{fmt(totals.cancels)}</div><div className="text-xs text-white/50">Pendente: {fmt(totals.awaiting + totals.atRisk)}</div></div>
        </div>
        {targetSeller !== "all" ? (
          <>
            <div className="rounded-xl border border-white/15 bg-black/20 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-[#E0CE8C]" /> {totals.next ? "Próxima faixa" : "Faixa máxima alcançada"}</div>
                <div className="text-xs text-white/70">{totals.next ? fmt(Math.max(0, totals.next - totals.net)) + " para a próxima faixa" : "0,30% na faixa máxima"}</div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-[#A11C27] to-[#E0CE8C] transition-all" style={{width:String(progress)+"%"}} /></div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"><span>Outubro (26–31) + novembro</span><span className={totals.novOK ? "font-semibold text-emerald-300" : "text-amber-200"}>{fmt(totals.november)} / R$ 50.000 {totals.novOK ? "✓" : ""}</span></div>
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"><span>Dezembro</span><span className={totals.decOK ? "font-semibold text-emerald-300" : "text-amber-200"}>{fmt(totals.december)} / R$ 50.000 {totals.decOK ? "✓" : ""}</span></div>
              </div>
              {totals.excluded ? <p className="mt-3 flex items-center gap-2 text-sm text-red-200"><AlertTriangle className="h-4 w-4" /> Não atingiu a habilitação mínima em um dos períodos. Bonificação zerada enquanto não houver regularização válida da apuração.</p> : !totals.novOK || !totals.decOK ? <p className="mt-3 text-xs text-[#E0CE8C]">Para participar, é obrigatório alcançar R$ 50 mil em cada período de habilitação. Sem ambos os períodos, não há prêmio.</p> : <p className="mt-3 flex items-center gap-2 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Habilitação mensal atingida, sujeita à manutenção das vendas.</p>}
            </div>
          </>
        ) : <p className="text-xs text-white/65">A visão de equipe soma os bônus calculados vendedor por vendedor. As faixas nunca são compartilhadas entre participantes.</p>}
        <div className="flex flex-col gap-2 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <span>Somente BB, Embracon e Maggi · sem contempladas · 1ª parcela confirmada + alocação + adimplência · cotas de bolsão somente após alocação.</span>
          {isAdmin ? <button type="button" onClick={()=>setExpanded((v)=>!v)} className="flex shrink-0 items-center gap-2 self-start rounded-lg border border-white/25 px-3 py-2 text-white hover:bg-white/10">Validar parcelas {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button> : null}
        </div>
        {isAdmin && expanded ? (
          <div className="rounded-xl border border-[#E0CE8C]/30 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#E0CE8C]"><Trophy className="h-4 w-4" /> Validação administrativa da primeira parcela</div>
            <p className="mb-3 text-xs text-white/60">Confirme apenas após comprovar o pagamento. Sem confirmação, a venda fica pendente de bonificação, mesmo que esteja alocada.</p>
            {!adminRows.length ? <p className="text-sm text-white/65">Nenhuma venda elegível cadastrada neste período.</p> : (
              <div className="space-y-2">
                {adminRows.slice(0,shown).map((v)=>{
                  const paid = validations.get(v.id) === true;
                  return <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm">
                    <div className="min-w-0"><div className="font-semibold">{fmt(cents(v.valor_venda))} · {v.administradora || "—"} · {v.data_venda}</div><div className="text-xs text-white/60">{byAuthId.get(v.vendedor_id) || "Vendedor"} · {v.tipo_venda || "Normal"} · {allocated(v) ? "Alocada" : "Aguardando alocação"} · {cancelled(v) ? "Cancelada" : v.inad ? "Inadimplente" : paid ? "1ª parcela confirmada" : "Pagamento não confirmado"}</div></div>
                    <button type="button" disabled={busySale===v.id} onClick={()=>void savePayment(v,!paid)} className={paid ? "rounded-lg border border-emerald-300/50 bg-emerald-900/40 px-3 py-2 text-xs text-white" : "rounded-lg border border-[#E0CE8C]/50 bg-[#E0CE8C]/20 px-3 py-2 text-xs text-[#E0CE8C]"}>{busySale===v.id ? "Salvando..." : paid ? "Reverter confirmação" : "Confirmar 1ª parcela paga"}</button>
                  </div>;
                })}
                {shown < adminRows.length ? <button type="button" onClick={()=>setShown((n)=>n+20)} className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white">Mostrar mais {Math.min(20,adminRows.length-shown)} vendas</button> : null}
              </div>
            )}
          </div>
        ) : null}
        <div className="text-[11px] leading-relaxed text-white/50">Painel informativo temporário. Apuração individual até 20/02/2027 ou antes, conforme alocação das cotas; pagamento em data a divulgar. Regularizações posteriores podem gerar recálculo. Qualquer divergência deve ser verificada com a administração antes do fechamento.</div>
      </div>
    </section>
  );
}
