// Painel temporario da campanha Acelera Consulmax (26/10 a 31/12/2026).
// Nenhum bonus exibido representa promessa de pagamento: depende da apuracao final.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CheckCircle2, Flag, Gauge, RefreshCcw, AlertTriangle } from "lucide-react";

type CRMUser = { id: string; auth_user_id: string; nome: string; is_active?: boolean | null };
type Sale = {
  id: string; vendedor_id: string; data_venda: string; valor_venda: number | null;
  administradora: string | null; tipo_venda: string | null; contemplada: boolean | null;
  status: string | null; codigo: string | null; cancelada_em: string | null; reativada_em: string | null;
  encarteirada_em: string | null; grupo: string | null; cota: string | null; inad: boolean | null;
};
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
  // No CRM, encarteiramento ja comprova pagamento da primeira parcela e alocacao.
  return normalize(v.status) === "encarteirada";
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
function calculate(rows: Sale[], date: string) {
  const selected = rows.filter(eligible);
  let gross = 0, cancels = 0, net = 0;
  let november = 0, december = 0, novemberSold = 0, decemberSold = 0;
  let awaiting = 0, atRisk = 0, confirmed = 0;
  for (const v of selected) {
    const value = cents(v.valor_venda);
    gross += value;
    if (cancelled(v)) { cancels += value; continue; }
    // Data de venda define o periodo mensal, mesmo se encarteirada posteriormente.
    if (v.data_venda <= NOV_END) novemberSold += value;
    else decemberSold += value;
    if (v.inad) { atRisk += value; continue; }
    if (!allocated(v)) { awaiting += value; continue; }
    confirmed += 1;
    net += value;
    if (v.data_venda <= NOV_END) november += value;
    else december += value;
  }
  const novOK = november >= 5000000;
  const decOK = december >= 5000000;
  // Meta comercial e' observada pelo registro; o direito definitivo exige
  // alocacao e adimplencia. Antes da apuracao, nao excluir uma venda
  // registrada no prazo que ainda esteja aguardando encarteiramento.
  const excluded = (date > NOV_END && novemberSold < 5000000)
    || (date > CAMPAIGN_END && decemberSold < 5000000)
    || (date >= HIDE_AFTER && (!novOK || !decOK));
  const bps = rateBps(net);
  const potential = excluded ? 0 : Math.round(net * bps / 10000);
  return { gross, cancels, net, november, december, novemberSold, decemberSold,
    awaiting, atRisk, confirmed, novOK, decOK, excluded, bps, potential,
    next: nextTarget(net), registered: selected.length };
}
export default function AceleraConsulmax({
  me, users, isAdmin,
}: {
  me: CRMUser | null; users: CRMUser[]; isAdmin: boolean;
}) {
  const todayTime = localTime();
  const today = todayTime.slice(0, 10);
  const visible = isAdmin || today <= HIDE_AFTER;
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("self");
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
      setSales(all);
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
    if (targetSeller !== "all") return calculate(relevant, today);
    // Nao misturar vendedores para alcancar uma faixa que nenhum deles atingiu.
    const authIds = Array.from(new Set(sales.map((v) => v.vendedor_id)));
    const positions = authIds.map((id) => calculate(sales.filter((v) => v.vendedor_id === id), today));
    return {
      gross: positions.reduce((a,p)=>a+p.gross,0),
      cancels: positions.reduce((a,p)=>a+p.cancels,0),
      net: positions.reduce((a,p)=>a+p.net,0),
      november: positions.reduce((a,p)=>a+p.november,0),
      december: positions.reduce((a,p)=>a+p.december,0),
      novemberSold: positions.reduce((a,p)=>a+p.novemberSold,0),
      decemberSold: positions.reduce((a,p)=>a+p.decemberSold,0),
      awaiting: positions.reduce((a,p)=>a+p.awaiting,0),
      atRisk: positions.reduce((a,p)=>a+p.atRisk,0),
      confirmed: positions.reduce((a,p)=>a+p.confirmed,0),
      novOK: false, decOK: false, excluded: false, bps: 0,
      potential: positions.reduce((a,p)=>a+p.potential,0),
      next: null, registered: positions.reduce((a,p)=>a+p.registered,0),
    } as Computed;
  }, [relevant, targetSeller, today, sales]);
  const label = targetSeller === "all" ? "Visão da equipe" : byAuthId.get(targetSeller) || me?.nome || "Minha campanha";
  const progress = totals.next ? Math.min(100, Math.round(totals.net * 100 / totals.next)) : 100;
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
        {today < CAMPAIGN_START ? <div className="rounded-lg border border-[#E0CE8C]/40 bg-[#E0CE8C]/10 px-3 py-2 text-xs text-[#E0CE8C]">A largada será em 26/10. Apenas as vendas realizadas durante a campanha serão contabilizadas.</div> : null}
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
                <div className="rounded-lg bg-white/5 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Outubro (26–31) + novembro</span>
                    <span className={totals.novOK ? "font-semibold text-emerald-300" : "text-amber-200"}>{fmt(totals.novemberSold)} / R$ 50.000</span>
                  </div>
                  <div className="mt-1 text-xs text-white/65">Encarteiradas e adimplentes: {fmt(totals.november)} {totals.novOK ? "✓" : ""}</div>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Dezembro</span>
                    <span className={totals.decOK ? "font-semibold text-emerald-300" : "text-amber-200"}>{fmt(totals.decemberSold)} / R$ 50.000</span>
                  </div>
                  <div className="mt-1 text-xs text-white/65">Encarteiradas e adimplentes: {fmt(totals.december)} {totals.decOK ? "✓" : ""}</div>
                </div>
              </div>
              {totals.excluded ? <p className="mt-3 flex items-center gap-2 text-sm text-red-200"><AlertTriangle className="h-4 w-4" /> Não cumpriu os requisitos de habilitação de um dos períodos. Bonificação zerada, sujeita aos recálculos permitidos pelo regulamento.</p> : !totals.novOK || !totals.decOK ? <p className="mt-3 text-xs text-[#E0CE8C]">Para se habilitar, registre R$ 50 mil em cada período e mantenha as vendas encarteiradas e adimplentes até a apuração. Sem ambos os períodos, não há prêmio.</p> : <p className="mt-3 flex items-center gap-2 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Habilitação mensal atingida, sujeita à manutenção das vendas.</p>}
            </div>
          </>
        ) : <p className="text-xs text-white/65">A visão de equipe soma os bônus calculados vendedor por vendedor. As faixas nunca são compartilhadas entre participantes.</p>}
        <div className="text-xs text-white/60">
          Somente BB, Embracon e Maggi · sem vendas contempladas · cota encarteirada confirma 1ª parcela paga e alocação · inadimplência acompanhada na Carteira · cotas de bolsão somente após encarteiramento.
        </div>
        <div className="text-[11px] leading-relaxed text-white/50">Painel informativo temporário. Apuração individual até 20/02/2027 ou antes, conforme alocação das cotas; pagamento em data a divulgar. Regularizações posteriores podem gerar recálculo. Qualquer divergência deve ser verificada com a administração antes do fechamento.</div>
      </div>
    </section>
  );
}
