import React from "react";
import { Activity, BarChart3, CalendarDays, CheckCircle2, Clapperboard, FileText, Lightbulb, Radio, Rocket, Settings, Sparkles } from "lucide-react";

type Counts = {
  ideias: number;
  conteudos: number;
  producao: number;
  aprovacoes: number;
  calendario: number;
  publicacoes: number;
};

type Props = {
  activeTab: string;
  onChange: (tab: string) => void;
  counts: Counts;
};

const stages = [
  { key: "visao", index: "00", label: "Visão Geral", icon: Sparkles, description: "Painel da operação" },
  { key: "ideias", index: "01", label: "Ideias", icon: Lightbulb, countKey: "ideias", description: "Ainda não desenvolvidas" },
  { key: "conteudos", index: "02", label: "Conteúdo", icon: FileText, countKey: "conteudos", description: "Estratégia e pauta" },
  { key: "producao", index: "03", label: "Produção", icon: Clapperboard, countKey: "producao", description: "Peças em criação" },
  { key: "aprovacoes", index: "04", label: "Aprovação", icon: CheckCircle2, countKey: "aprovacoes", description: "Peças para revisar" },
  { key: "calendario", index: "05", label: "Calendário", icon: CalendarDays, countKey: "calendario", description: "Aprovadas e agendadas" },
  { key: "publicacoes", index: "06", label: "Publicado", icon: Rocket, countKey: "publicacoes", description: "Conteúdo no ar" },
] as const;

const intelligence = [
  { key: "radar", label: "Radar", icon: Radio },
  { key: "pulso", label: "Pulso", icon: Activity },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "config", label: "Configurações", icon: Settings },
] as const;

export default function MarketingEditorialPipelineNav({ activeTab, onChange, counts }: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-[22px] border border-[#1E293F]/10 bg-white p-3 shadow-[0_10px_30px_rgba(30,41,63,0.05)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#B5A573]">Esteira Editorial</p>
            <p className="mt-0.5 text-xs text-slate-500">Uma ideia nasce uma vez e avança até virar publicação.</p>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-slate-400 lg:flex">
            <span className="h-2 w-2 rounded-full bg-[#B5A573]" />
            Acompanhe onde o trabalho está parado
          </div>
        </div>

        <div className="grid min-w-[980px] grid-cols-7 gap-2 overflow-hidden">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            const selected = activeTab === stage.key;
            const count = stage.countKey ? counts[stage.countKey] : null;
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => onChange(stage.key)}
                className={`relative min-h-[92px] rounded-2xl border px-3 py-3 text-left transition-all ${selected ? "border-[#1E293F] bg-[#1E293F] text-white shadow-[0_10px_24px_rgba(30,41,63,0.20)]" : "border-[#1E293F]/8 bg-[#FAFBFC] text-[#1E293F] hover:-translate-y-0.5 hover:border-[#B5A573]/45 hover:bg-white"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${selected ? "bg-white/10 text-[#E0CE8C]" : "bg-white text-[#A11C27] shadow-sm"}`}><Icon className="h-4 w-4" /></div>
                  <span className={`text-[10px] font-bold tracking-[0.14em] ${selected ? "text-white/45" : "text-slate-300"}`}>{stage.index}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{stage.label}</p>
                  {count !== null ? <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${selected ? "bg-white/12 text-white" : count ? "bg-[#A11C27]/8 text-[#A11C27]" : "bg-slate-100 text-slate-400"}`}>{count}</span> : null}
                </div>
                <p className={`mt-1 truncate text-[10px] ${selected ? "text-white/55" : "text-slate-400"}`}>{stage.description}</p>
                {idx < stages.length - 1 ? <span className="pointer-events-none absolute -right-[7px] top-1/2 z-10 hidden h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-[#1E293F]/8 bg-white xl:block" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Inteligência</span>
        {intelligence.map((item) => {
          const Icon = item.icon;
          const selected = activeTab === item.key;
          return <button key={item.key} type="button" onClick={() => onChange(item.key)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${selected ? "bg-[#E0CE8C]/25 text-[#1E293F] ring-1 ring-[#B5A573]/30" : "text-slate-500 hover:bg-white hover:text-[#1E293F]"}`}><Icon className="h-3.5 w-3.5" />{item.label}</button>;
        })}
      </div>
    </div>
  );
}
