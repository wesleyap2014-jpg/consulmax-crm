import React from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, CheckCircle2, LayoutDashboard, Megaphone, MessageCircle, ShieldCheck } from "lucide-react";

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

const tabs = [
  {
    to: "/whatsapp/atendimento",
    label: "Atendimento",
    desc: "Kanban, chat e ações rápidas",
    icon: MessageCircle,
  },
  {
    to: "/whatsapp/campanhas",
    label: "Campanhas",
    desc: "Públicos, disparos e relatórios",
    icon: Megaphone,
  },
  {
    to: "/whatsapp/modelos",
    label: "Modelos",
    desc: "Templates aprovados e variáveis",
    icon: LayoutDashboard,
  },
  {
    to: "/whatsapp/autorizacoes",
    label: "Autorizações",
    desc: "Aceites, recusas e opt-out",
    icon: ShieldCheck,
  },
];

export function WhatsAppModuleHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-xl shadow-slate-900/5 backdrop-blur">
      <div
        className="relative overflow-hidden px-5 py-5 text-white md:px-7"
        style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.ruby} 58%, #7f1220 100%)` }}
      >
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 right-16 h-28 w-72 rounded-full bg-[#B5A573]/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-white/65">Consulmax WhatsApp</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">{title}</h1>
              <p className="mt-1 max-w-3xl text-sm text-white/75">{subtitle}</p>
            </div>
          </div>
          {children}
        </div>
      </div>

      <div className="grid gap-2 border-t border-slate-100 bg-white/70 p-3 md:grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `group rounded-2xl border p-3 transition ${
                  isActive
                    ? "border-[#A11C27]/25 bg-[#A11C27]/10 shadow-sm"
                    : "border-slate-200 bg-white hover:border-[#B5A573]/60 hover:bg-[#F5F5F5]"
                }`
              }
            >
              {({ isActive }) => (
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      isActive ? "bg-[#A11C27] text-white" : "bg-slate-100 text-slate-600 group-hover:bg-[#B5A573]/20"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-black ${isActive ? "text-[#A11C27]" : "text-slate-800"}`}>{tab.label}</p>
                    <p className="truncate text-xs text-slate-500">{tab.desc}</p>
                  </div>
                </div>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

export function StatCard({
  icon: Icon = BarChart3,
  title,
  value,
  note,
  tone = "ruby",
}: {
  icon?: any;
  title: string;
  value: string | number;
  note?: string;
  tone?: "ruby" | "gold" | "navy" | "green";
}) {
  const toneMap = {
    ruby: "bg-[#A11C27]/10 text-[#A11C27]",
    gold: "bg-[#B5A573]/20 text-[#7c6b2b]",
    navy: "bg-[#1E293F]/10 text-[#1E293F]",
    green: "bg-emerald-100 text-emerald-700",
  } as const;

  return (
    <div className="rounded-[22px] border border-white/80 bg-white/85 p-4 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
          {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${toneMap[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

export function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "green" | "red" | "gold" | "blue" | "slate" }) {
  const map = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    gold: "bg-amber-50 text-amber-700 ring-amber-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    slate: "bg-slate-50 text-slate-600 ring-slate-200",
  } as const;
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${map[tone]}`}>{children}</span>;
}

export { C };
