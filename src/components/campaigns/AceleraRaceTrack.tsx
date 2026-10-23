import React from "react";
import { Flag, Gauge, Zap } from "lucide-react";

const MARKS = [
  { limit: 10_000_000, value: 100_000, label: "0,10%", credit: "R$ 100 mil" },
  { limit: 20_000_001, value: 200_000.01, label: "0,15%", credit: "Acima de R$ 200 mil" },
  { limit: 50_000_001, value: 500_000.01, label: "0,20%", credit: "Acima de R$ 500 mil" },
  { limit: 100_000_001, value: 1_000_000.01, label: "0,30%", credit: "Acima de R$ 1 milhão" },
] as const;
const money = (valueInCents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
// Preserva o carro inteiro dentro da pista também na largura mínima mobile.
const coordinates = [9, 29.5, 50, 70.5, 91];

/** Quatro trechos de pista com tamanhos visuais iguais.
 * O primeiro trecho é contínuo: uma venda de R$ 10 mil já move o carro.
 */
export function positionOnTrack(validNetCents: number) {
  const value = Math.max(0, Math.round(Number(validNetCents) || 0));
  if (value >= MARKS[3].limit) return coordinates[4];
  const limits = [0, ...MARKS.map(m => m.limit)];
  for (let index = 0; index < MARKS.length; index++) {
    if (value <= limits[index + 1]) {
      const ratio = (value - limits[index]) / (limits[index + 1] - limits[index]);
      return coordinates[index] + (coordinates[index + 1] - coordinates[index]) * ratio;
    }
  }
  return coordinates[4];
}

function FormulaCar() {
  return (
    <svg viewBox="0 0 124 62" width="108" height="54" role="img" aria-label="Carro de corrida indicando seu progresso" style={{ filter: "drop-shadow(0 0 8px rgba(239,68,68,.65))" }}>
      <defs>
        <linearGradient id="acelera-body-v2" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ff4b48" />
          <stop offset="55%" stopColor="#b10a20" />
          <stop offset="100%" stopColor="#610719" />
        </linearGradient>
        <linearGradient id="acelera-panel-v2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#7c8899" />
        </linearGradient>
      </defs>
      <path d="M5 39h16M2 43h16" stroke="#fa2638" strokeWidth="3" strokeLinecap="round" opacity=".9"/>
      <path d="M3 47h24" stroke="#fa2638" strokeWidth="2" strokeLinecap="round" opacity=".55"/>
      <path d="M12 17h13v5H12z" fill="#e2e8f0"/>
      <path d="M18 18l2 18" stroke="#e2e8f0" strokeWidth="3"/>
      <path d="M14 20h28l6 14-13 5H14z" fill="url(#acelera-body-v2)" stroke="#ff6a67" strokeWidth="1"/>
      <path d="M38 35l12-7 9-15 22 1 12 16 15 6-5 7H40z" fill="url(#acelera-body-v2)" stroke="#ff8080" strokeWidth="1.2"/>
      <path d="M58 14l-4 16 30 1-11-16z" fill="#101a2d" stroke="#dfe4ec" strokeWidth="1.8"/>
      <path d="M62 16l-2 12 16 1-7-12z" fill="#1b293f"/>
      <path d="M78 24l20 10h17l3 7H92z" fill="url(#acelera-body-v2)"/>
      <path d="M109 25h10v20h-5l-5-7z" fill="#dfe4ec"/>
      <path d="M106 33h16v5h-16z" fill="#a60c20" />
      <path d="M33 43h82" stroke="#f7c4bb" strokeWidth="2" opacity=".7"/>
      <ellipse cx="33" cy="43" rx="13" ry="16" fill="#030712" stroke="#525d6d" strokeWidth="2"/>
      <ellipse cx="33" cy="43" rx="7" ry="9" fill="#26344d" stroke="#d9c68a" strokeWidth="2"/>
      <ellipse cx="98" cy="43" rx="13" ry="16" fill="#030712" stroke="#525d6d" strokeWidth="2"/>
      <ellipse cx="98" cy="43" rx="7" ry="9" fill="#26344d" stroke="#d9c68a" strokeWidth="2"/>
      <path d="M54 36h29" stroke="#ffdc90" strokeWidth="2" opacity=".7"/>
      <path d="M74 17l9 15" stroke="url(#acelera-panel-v2)" strokeWidth="2"/>
    </svg>
  );
}

type Props = {
  validNetCents: number;
  hasEligibility: boolean;
};

export default function AceleraRaceTrack({ validNetCents, hasEligibility }: Props) {
  const progress = positionOnTrack(validNetCents);
  const nextIndex = MARKS.findIndex(mark => validNetCents < mark.limit);
  const next = nextIndex === -1 ? null : MARKS[nextIndex];
  const reached = nextIndex === -1 ? MARKS.length : nextIndex;
  const extra = next ? Math.max(0, next.limit - validNetCents) : 0;

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/15 bg-[#071321]/90 shadow-[inset_0_0_38px_rgba(0,0,0,.24),0_18px_44px_rgba(0,0,0,.19)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "radial-gradient(ellipse at 30% 0%,rgba(161,28,39,.31),transparent 65%),linear-gradient(130deg,transparent 0%,rgba(164,21,35,.18) 46%,transparent 48%),repeating-linear-gradient(170deg,transparent 0 28px,rgba(239,68,68,.08) 29px,transparent 33px)" }} />
      <div className="relative space-y-5 px-4 py-5 md:px-6 md:py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[.13em] text-white">
            <Gauge className="h-5 w-5 text-[#E0CE8C]" /> Sua corrida pelas bonificações
          </h3>
          <span className="rounded-full border border-[#E0CE8C]/35 bg-[#E0CE8C]/10 px-3 py-1 text-[11px] font-bold tracking-wide text-[#E0CE8C]">
            {validNetCents > 0 ? money(validNetCents) + " em vendas válidas" : "Posição de largada"}
          </span>
        </div>
        <div className="overflow-x-auto pb-2" role="group" aria-label="Pista de evolução das bonificações">
          <div className="relative h-[154px] min-w-[660px] md:h-[164px]">
            <div className="absolute inset-x-0 top-[64px] h-[32px] overflow-hidden rounded-xl border border-slate-500/45 shadow-[0_2px_20px_rgba(0,0,0,.45)]"
              style={{ background: "linear-gradient(180deg,#2e3646,#0f192b 58%,#263345)" }}>
              <div className="absolute inset-x-0 top-[14px] border-t-2 border-dashed border-slate-400/50"/>
              <div className="absolute inset-x-0 top-0 h-[2px] bg-white/20"/>
            </div>
            <div className="absolute top-[64px] h-[32px] rounded-l-xl bg-gradient-to-r from-[#8e1422] via-[#df2337] to-[#fe5958] shadow-[0_0_16px_rgba(255,54,67,.65)] transition-[width] duration-1000 ease-out"
              style={{ left: coordinates[0] + "%", width: Math.max(0, progress - coordinates[0]) + "%" }} />
            <div className="absolute top-[70px] h-5 rounded-l-xl bg-red-500/20 blur-md transition-[width] duration-1000"
              style={{ left: coordinates[0] + "%", width: Math.max(0, progress - coordinates[0]) + "%" }} />
            <div className="absolute top-[54px] -translate-x-1/2 text-[11px] font-semibold text-white/70" style={{ left: coordinates[0] + "%" }}>Largada</div>
            {MARKS.map((mark, index) => {
              const x = coordinates[index + 1];
              const completed = validNetCents >= mark.limit;
              return (
                <div key={mark.label} className="absolute top-0 text-center" style={{left:x+"%", transform:"translateX(-50%)", width:"136px"}}>
                  <div className={"mx-auto inline-flex rounded-lg border px-2.5 py-1 text-sm font-extrabold shadow-sm transition-colors " + (completed ? "border-[#E0CE8C] bg-[#E0CE8C]/20 text-[#ffe4a3] shadow-[0_0_12px_rgba(224,206,140,.19)]" : "border-white/25 bg-[#111e2e] text-white/75")}>
                    {mark.label}
                  </div>
                  <div className={"mx-auto mt-[25px] h-[28px] w-[28px] rounded-full border-[3px] shadow-lg " + (completed ? "border-[#ffe4a3] bg-[#b40e2b] shadow-[0_0_15px_rgba(239,68,68,.6)]" : "border-[#8f9bb0] bg-[#111d2c]")} />
                  <div className="mt-[6px] text-[11px] font-semibold text-white/75">{mark.credit}</div>
                </div>
              );
            })}
            <div className="pointer-events-none absolute top-[36px] z-20 transition-[left] duration-1000 ease-out motion-reduce:transition-none"
              style={{left:progress+"%", transform:"translateX(-50%)"}}>
              <FormulaCar/>
            </div>
            <Flag aria-hidden="true" className="absolute right-[0.6%] top-[48px] h-8 w-8 text-[#E0CE8C]"/>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="flex items-center gap-3 rounded-2xl border border-[#B5A573]/30 bg-black/30 px-4 py-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#A11C27]/25 text-[#ff8b81]">
              <Zap className="h-6 w-6"/>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-white/55">
                {next ? "Sua próxima conquista" : "Linha de chegada"}
              </p>
              <p className="mt-0.5 text-sm font-bold text-white md:text-base">
                {next ? <>Faltam <span className="text-[#ffe09a]">{money(extra)}</span> para alcançar {next.label}</>
                  : <>Você alcançou a maior faixa: <span className="text-[#ffe09a]">0,30%</span>!</>}
              </p>
              <p className="mt-1 text-xs text-white/60">
                {validNetCents === 0 ? "Seu carro está na largada. A primeira venda válida já coloca você em movimento."
                  : "Cada venda líquida válida movimenta seu carro, inclusive abaixo de R$ 100 mil."}
              </p>
            </div>
          </div>
          <div className="flex min-w-[160px] flex-col justify-center rounded-2xl border border-white/15 bg-black/20 px-5 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Faixas alcançadas</span>
            <span className="mt-1 text-xl font-black text-[#E0CE8C]">{reached} <span className="text-sm font-semibold text-white/60">de 4</span></span>
            <span className="text-[11px] text-white/55">{hasEligibility ? "Habilitação mensal atingida" : "Sujeito à habilitação mensal"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
