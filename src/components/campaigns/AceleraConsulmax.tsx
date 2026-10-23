// Painel temporario da campanha Acelera Consulmax (26/10 a 31/12/2026).
// Nenhum bonus exibido representa promessa de pagamento: depende da apuracao final.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CheckCircle2, Flag, RefreshCcw, AlertTriangle, CircleDollarSign, TicketCheck, ShieldAlert, Trophy } from "lucide-react";
import AceleraRaceTrack from "./AceleraRaceTrack";

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
  if (!me || !visible) return null;
  const card = "group relative overflow-hidden rounded-[20px] border border-white/10 bg-[#0b182a]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_8px_28px_rgba(0,0,0,.2)] transition-colors hover:border-[#B5A573]/40";
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#a11c27]/50 bg-[#060e1e] text-white shadow-[0_25px_72px_rgba(9,18,32,.3)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0"
        style={{background:"radial-gradient(ellipse at 90% 1%,rgba(210,28,55,.25),transparent 45%),radial-gradient(ellipse at 0% 100%,rgba(124,14,29,.2),transparent 55%),linear-gradient(130deg,#061326,#0b101e 58%,#161321)"}}/>
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-28 w-48 opacity-[.13]"
        style={{backgroundImage:"conic-gradient(#fff 25%,transparent 0 50%,#fff 0 75%,transparent 0)",backgroundSize:"22px 22px",maskImage:"linear-gradient(to left,black,transparent)"}}/>
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 top-16 h-1 w-[70%] -rotate-[13deg] bg-gradient-to-r from-transparent via-[#f43749]/70 to-[#ff6673] shadow-[0_0_15px_#f43749]"/>
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 top-28 h-[2px] w-[80%] -rotate-[13deg] bg-gradient-to-r from-transparent via-[#f43749]/35 to-[#ff6673]/70"/>
      <div className="pointer-events-none absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-[#A11C27] via-[#E0CE8C] to-[#A11C27]" />
      <div className="relative space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-[20px] border border-white/10 bg-[#0b1729]/75 px-5 py-5 md:px-6 md:py-6">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#E0CE8C]/65 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[.17em] text-[#E0CE8C]">
              <Trophy className="h-3.5 w-3.5"/> Campanha de vendas · 26/10 a 31/12/2026
            </p>
            <h2 className="mt-3 -skew-x-6 text-[clamp(27px,4.2vw,50px)] font-black italic uppercase leading-[1] tracking-[-.045em] text-white"
              style={{textShadow:"0 3px 0 rgba(255,255,255,.09),0 5px 18px rgba(0,0,0,.65)"}}>
              ACELERA <span className="block text-[#f32a3b]" style={{textShadow:"0 0 25px rgba(243,42,59,.28)"}}>CONSULMAX</span>
            </h2>
            <div className="mt-3 h-[3px] w-48 skew-x-[-30deg] bg-gradient-to-r from-[#A11C27] via-[#f24155] to-transparent"/>
            <p className="mt-3 text-sm font-semibold tracking-wide text-white/85">Mais vendas, mais conquistas.</p>
            <p className="mt-1 text-xs text-white/55">{label} · Apuração até 20/02/2027 · Atualização sob demanda</p>
          </div>
          <div className="relative z-10 flex flex-wrap items-start gap-2">
            {isAdmin ? (
              <select aria-label="Selecione o vendedor" value={selected} onChange={(e)=>setSelected(e.target.value)}
                className="max-w-[250px] rounded-xl border border-white/20 bg-[#14243a] px-3 py-2.5 text-sm font-semibold text-white">
                <option value="self">Meu resultado</option>
                <option value="all">Todos os vendedores (gestão)</option>
                {users.filter((u)=>u.is_active !== false).map((u)=><option key={u.auth_user_id} value={u.auth_user_id}>{u.nome}</option>)}
              </select>
            ) : null}
            <button type="button" onClick={()=>setVersion((v)=>v+1)} disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60">
              <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}/> Atualizar
            </button>
          </div>
        </div>
        {today < CAMPAIGN_START ? (
          <div className="rounded-xl border border-[#E0CE8C]/35 bg-[#B5A573]/10 px-4 py-2.5 text-xs font-medium text-[#ffdfa1]">
            🏁 A largada será em 26/10. O painel já está disponível, mas só serão contadas vendas realizadas dentro do período oficial.
          </div>
        ) : null}
        {error ? <div role="alert" className="rounded-xl border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</div> : null}
        {targetSeller !== "all" ? (
          <AceleraRaceTrack validNetCents={totals.net} hasEligibility={totals.novOK && totals.decOK}/>
        ) : (
          <div className="rounded-2xl border border-[#E0CE8C]/30 bg-[#E0CE8C]/10 px-4 py-3 text-sm text-white/80">
            Visão gerencial: bônus e resultados somados individualmente. Cada vendedor percorre sua própria pista e conquista suas próprias faixas.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={card}>
            <div className="flex items-center gap-2 text-xs font-bold text-white/65"><Flag className="h-4 w-4 text-[#ff5561]"/> Vendas registradas</div>
            <div className="mt-3 text-xl font-black tracking-tight text-white md:text-2xl">{fmt(totals.gross)}</div>
            <div className="mt-1 text-[11px] text-white/50">{totals.registered} cota(s) no período</div>
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[#A11C27] to-transparent" />
          </div>
          <div className={card}>
            <div className="flex items-center gap-2 text-xs font-bold text-white/65"><TicketCheck className="h-4 w-4 text-[#E0CE8C]"/> Vendas válidas</div>
            <div className="mt-3 text-xl font-black tracking-tight text-white md:text-2xl">{fmt(totals.net)}</div>
            <div className="mt-1 text-[11px] text-white/50">{totals.confirmed} cota(s) encarteiradas e adimplentes</div>
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[#E0CE8C] to-transparent" />
          </div>
          <div className={card}>
            <div className="flex items-center gap-2 text-xs font-bold text-white/65"><CircleDollarSign className="h-4 w-4 text-[#ffe29a]"/> Bonificação projetada</div>
            <div className="mt-3 text-xl font-black tracking-tight text-[#E0CE8C] md:text-2xl">{fmt(totals.potential)}</div>
            <div className="mt-1 text-[11px] text-white/50">
              {targetSeller === "all" ? "Soma das projeções individuais" : totals.excluded ? "Não habilitado — excluído" : (totals.bps / 100).toFixed(2).replace(".",",") + "% · sujeita à habilitação"}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[#E0CE8C] to-transparent" />
          </div>
          <div className={card}>
            <div className="flex items-center gap-2 text-xs font-bold text-white/65"><ShieldAlert className="h-4 w-4 text-[#ff7582]"/> Cancelamentos / perdas</div>
            <div className="mt-3 text-xl font-black tracking-tight text-white md:text-2xl">{fmt(totals.cancels)}</div>
            <div className="mt-1 text-[11px] text-white/50">Pendente / inadimplente: {fmt(totals.awaiting + totals.atRisk)}</div>
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[#A11C27] to-transparent" />
          </div>
        </div>
        {targetSeller !== "all" ? (
          <div className="rounded-[22px] border border-white/15 bg-[#0b182a]/90 p-4 md:p-5">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[.11em]"><Flag className="h-4 w-4 text-[#ff6470]"/> Habilitação mensal</h3>
            <p className="mt-1 text-xs text-white/55">Mínimo de R$ 50 mil em cada período. Vendas de 26 a 31/10 contam para novembro.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                {key:"nov",title:"Outubro (26–31) + novembro",sold:totals.novemberSold,valid:totals.november,ok:totals.novOK},
                {key:"dec",title:"Dezembro",sold:totals.decemberSold,valid:totals.december,ok:totals.decOK},
              ].map(item => (
                <div key={item.key} className="rounded-2xl border border-white/10 bg-[#101f33] px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <span className={"rounded-full border px-2.5 py-1 text-[10px] font-bold " + (item.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-[#E0CE8C]/25 bg-[#E0CE8C]/10 text-[#ffe0a6]")}>
                      {item.ok ? "✓ Meta validada" : "Em evolução"}
                    </span>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#A11C27] to-[#E0CE8C] transition-[width] duration-700"
                      style={{width:Math.min(100,item.sold/5000000*100)+"%"}}/>
                  </div>
                  <div className="mt-2 flex justify-between gap-2 text-xs">
                    <span className="font-bold text-[#E0CE8C]">{fmt(item.sold)}</span><span className="text-white/55">Meta R$ 50.000</span>
                  </div>
                  <p className="mt-2 text-[11px] text-white/55">Encarteiradas e adimplentes: {fmt(item.valid)}</p>
                </div>
              ))}
            </div>
            {totals.excluded ?
              <p className="mt-4 flex items-center gap-2 text-xs text-red-200"><AlertTriangle className="h-4 w-4"/> Não cumpriu os requisitos de habilitação de um dos períodos. Bonificação zerada, sujeita aos recálculos permitidos pelo regulamento.</p>
              : !totals.novOK || !totals.decOK ?
              <p className="mt-4 text-xs text-[#E0CE8C]">Para se habilitar, registre R$ 50 mil em cada período e mantenha as vendas encarteiradas e adimplentes até a apuração.</p>
              : <p className="mt-4 flex items-center gap-2 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4"/> Habilitação mensal atingida, sujeita à manutenção das vendas.</p>}
          </div>
        ) : null}
        <div className="px-1 text-[11px] leading-relaxed text-white/55">
          Somente BB, Embracon e Maggi · sem contempladas · encarteiramento confirma primeira parcela e alocação · inadimplência verificada na Carteira · bolsão válido após encarteiramento.
        </div>
        <div className="px-1 text-[11px] leading-relaxed text-white/40">
          Painel informativo temporário. Apuração individual até 20/02/2027 ou antes, conforme alocação das cotas. Pagamento em data a divulgar. Regularizações posteriores podem gerar recálculo; valores não representam premiação garantida.
        </div>
      </div>
    </section>
  );
}
