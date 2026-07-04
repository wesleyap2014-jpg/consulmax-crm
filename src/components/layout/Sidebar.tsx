// src/components/layout/Sidebar.tsx
import { NavLink, Link, useLocation } from "react-router-dom";
import { useMemo, useState, useEffect, type CSSProperties, type FC } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BarChart3,
  Briefcase,
  Calculator,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Database,
  FileText,
  FolderKanban,
  Layers,
  LineChart,
  Link as LinkIcon,
  MessageCircle,
  SlidersHorizontal,
  Trophy,
  UserCog,
  Wallet,
  X,
} from "lucide-react";

type SidebarProps = { onNavigate?: () => void };

type NavAlerts = {
  oportunidades: boolean;
  fluxoCaixa: boolean;
  gestaoGrupos: boolean;
  agenda: boolean;
};

type FlatItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  onlyForWesley?: boolean;
  showDot?: boolean;
  end?: boolean;
  activeMatch?: (pathname: string) => boolean;
};

type GroupKey = "vendas" | "pos" | "admin" | "fin" | "max";

type NavGroup = {
  title: string;
  icon: LucideIcon;
  items: FlatItem[];
};

const WESLEY_ID = "524f9d55-48c0-4c56-9ab8-7e6115e7c0b0";

const LOGO_URL = "/logo-consulmax.png?v=3";
const FALLBACK_URL = "/favicon.ico?v=3";

const activePillStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(161,28,39,1) 0%, rgba(161,28,39,.96) 100%)",
  border: "1px solid rgba(255,255,255,.18)",
  boxShadow: "0 6px 18px rgba(161,28,39,.25), inset 0 -8px 20px rgba(255,255,255,.12)",
};

const glassHoverPill: CSSProperties = {
  background: "rgba(255,255,255,.58)",
  border: "1px solid rgba(255,255,255,.35)",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,.04)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

const glassSidebarBase: CSSProperties = {
  position: "relative",
  background: "rgba(255,255,255,.55)",
  borderRight: "1px solid rgba(255,255,255,.35)",
  backdropFilter: "saturate(160%) blur(10px)",
  WebkitBackdropFilter: "saturate(160%) blur(10px)",
  boxShadow: "inset -8px 0 30px rgba(181,165,115,.10)",
};

const sbLiquidCanvas: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

const sbBlob: CSSProperties = {
  position: "absolute",
  width: 280,
  height: 280,
  borderRadius: "50%",
  filter: "blur(40px)",
  opacity: 0.55,
};

const sbBlob1: CSSProperties = {
  left: -80,
  top: -60,
  background: "radial-gradient(closest-side, #A11C27, rgba(161,28,39,0))",
  animation: "sbFloat1 26s ease-in-out infinite",
};

const sbBlob2: CSSProperties = {
  right: -90,
  bottom: -60,
  background: "radial-gradient(closest-side, #1E293F, rgba(30,41,63,0))",
  animation: "sbFloat2 30s ease-in-out infinite",
};

const sbGoldGlow: CSSProperties = {
  position: "absolute",
  right: -60,
  top: "45%",
  width: 180,
  height: 180,
  borderRadius: "50%",
  background: "radial-gradient(closest-side, rgba(181,165,115,.35), rgba(181,165,115,0))",
  filter: "blur(30px)",
  opacity: 0.6,
};

const sbLiquidKeyframes = `
@keyframes sbFloat1 { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(18px,14px) scale(1.06)} 100%{transform:translate(0,0) scale(1)} }
@keyframes sbFloat2 { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(-16px,-10px) scale(1.05)} 100%{transform:translate(0,0) scale(1)} }
`;

const SidebarLiquidBG: FC = () => (
  <div style={sbLiquidCanvas} aria-hidden>
    <style>{sbLiquidKeyframes}</style>
    <span style={{ ...sbBlob, ...sbBlob1 }} />
    <span style={{ ...sbBlob, ...sbBlob2 }} />
    <span style={{ ...sbGoldGlow }} />
  </div>
);

const AlertDot: FC = () => (
  <span
    className="ml-2 h-2.5 w-2.5 rounded-full bg-[#A11C27] animate-pulse shadow-[0_0_0_4px_rgba(161,28,39,0.25)]"
    aria-label="Há pendências para hoje"
  />
);

function todayDateStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dayRangeISO(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

async function checkOpportunitiesAlert(todayStr: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("opportunities")
      .select("id, expected_close_at, estagio")
      .lt("expected_close_at", todayStr)
      .not("estagio", "in", '("Fechado (Ganho)","Fechado (Perdido)")')
      .limit(1);

    if (error) {
      console.error("Erro ao verificar oportunidades atrasadas:", error.message);
      return false;
    }

    return !!(data && data.length > 0);
  } catch (error) {
    console.error("Erro inesperado em checkOpportunitiesAlert:", error);
    return false;
  }
}

async function checkCashFlowAlert(todayStr: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("cash_flows")
      .select("id")
      .eq("data", todayStr)
      .in("tipo", ["entrada", "saida"])
      .eq("created_by", WESLEY_ID)
      .limit(1);

    if (error) {
      console.error("Erro ao verificar fluxo de caixa do dia:", error.message);
      return false;
    }

    return !!(data && data.length > 0);
  } catch (error) {
    console.error("Erro inesperado em checkCashFlowAlert:", error);
    return false;
  }
}

async function checkGroupsAlert(todayStr: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("groups")
      .select("id")
      .or(`prox_vencimento.eq.${todayStr},prox_sorteio.eq.${todayStr},prox_assembleia.eq.${todayStr}`)
      .limit(1);

    if (error) {
      console.error("Erro ao verificar eventos de grupos hoje:", error.message);
      return false;
    }

    return !!(data && data.length > 0);
  } catch (error) {
    console.error("Erro inesperado em checkGroupsAlert:", error);
    return false;
  }
}

async function checkAgendaAlert(startIso: string, endIso: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("agenda_eventos")
      .select("id")
      .gte("inicio_at", startIso)
      .lte("inicio_at", endIso)
      .limit(1);

    if (error) {
      console.error("Erro ao verificar eventos de agenda hoje:", error.message);
      return false;
    }

    return !!(data && data.length > 0);
  } catch (error) {
    console.error("Erro inesperado em checkAgendaAlert:", error);
    return false;
  }
}

function isAnyPathActive(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p));
}

function groupForPath(pathname: string): GroupKey {
  if (
    isAnyPathActive(pathname, [
      "/planejamento",
      "/oportunidades",
      "/atendimento-whatsapp",
      "/whatsapp",
      "/central-whatsapp",
      "/atendimento",
      "/agenda",
      "/simuladores",
      "/central-grupos",
      "/grupos-disponiveis",
      "/propostas",
      "/propostas-pro-max",
      "/ranking",
      "/estoque-contempladas",
    ])
  ) {
    return "vendas";
  }

  if (isAnyPathActive(pathname, ["/carteira", "/giro-de-carteira", "/gestao-de-grupos"])) {
    return "pos";
  }

  if (isAnyPathActive(pathname, ["/relatorios", "/usuarios", "/parametros", "/clientes", "/processos", "/rh"])) {
    return "admin";
  }

  if (isAnyPathActive(pathname, ["/central-projetos", "/gestao-de-projetos", "/projetos", "/links", "/procedimentos"])) {
    return "max";
  }

  return "fin";
}

function itemIsVisible(item: FlatItem, authUserId: string | null) {
  return !item.onlyForWesley || !authUserId || authUserId === WESLEY_ID;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation();
  const pathname = location.pathname;

  const [isSmall, setIsSmall] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [navAlerts, setNavAlerts] = useState<NavAlerts>({
    oportunidades: false,
    fluxoCaixa: false,
    gestaoGrupos: false,
    agenda: false,
  });

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("@consulmax:sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const currentGroup = useMemo<GroupKey>(() => groupForPath(pathname), [pathname]);
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(currentGroup);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 767px)");
    const handler = () => setIsSmall(mq.matches);

    handler();

    if ("addEventListener" in mq) mq.addEventListener("change", handler);
    else mq.addListener(handler);

    return () => {
      if ("removeEventListener" in mq) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    if (isSmall && collapsed) setCollapsed(false);
  }, [isSmall, collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem("@consulmax:sidebar-collapsed", collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed) setOpenGroup(currentGroup);
  }, [currentGroup, collapsed]);

  useEffect(() => {
    if (isSmall) setMobileOpen(false);
    onNavigate?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!isSmall) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = mobileOpen ? "hidden" : previousOverflow || "";

    return () => {
      document.body.style.overflow = previousOverflow || "";
    };
  }, [mobileOpen, isSmall]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;
        setAuthUserId(error || !data?.user ? null : data.user.id);
      } catch {
        if (!alive) return;
        setAuthUserId(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const todayStr = todayDateStr();
    const { startIso, endIso } = dayRangeISO(todayStr);

    const loadAlerts = async () => {
      try {
        const [hasOpp, hasCash, hasGroups, hasAgenda] = await Promise.all([
          checkOpportunitiesAlert(todayStr),
          checkCashFlowAlert(todayStr),
          checkGroupsAlert(todayStr),
          checkAgendaAlert(startIso, endIso),
        ]);

        if (!alive) return;
        setNavAlerts({
          oportunidades: hasOpp,
          fluxoCaixa: hasCash,
          gestaoGrupos: hasGroups,
          agenda: hasAgenda,
        });
      } catch (error) {
        if (!alive) return;
        console.error("Erro ao carregar alertas de navegação:", error);
      }
    };

    loadAlerts();
    const interval = window.setInterval(loadAlerts, 5 * 60 * 1000);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  const navGroups = useMemo<Record<GroupKey, NavGroup>>(
    () => ({
      vendas: {
        title: "Vendas",
        icon: Briefcase,
        items: [
          { to: "/planejamento", label: "Sala de Guerra", icon: ClipboardList, end: true },
          { to: "/oportunidades", label: "Oportunidades", icon: Briefcase, showDot: navAlerts.oportunidades, end: true },
          {
            to: "/atendimento-whatsapp",
            label: "WhatsApp",
            icon: MessageCircle,
            end: true,
            activeMatch: (p) => p === "/atendimento-whatsapp" || p.startsWith("/atendimento-whatsapp") || p === "/whatsapp" || p === "/central-whatsapp" || p === "/atendimento",
          },
          { to: "/agenda", label: "Agenda", icon: Calendar, showDot: navAlerts.agenda, end: true },
          {
            to: "/simuladores",
            label: "Simuladores",
            icon: Calculator,
            end: false,
            activeMatch: (p) => p.startsWith("/simuladores"),
          },
          { to: "/central-grupos", label: "Central de Grupos", icon: Database, end: true },
          { to: "/propostas", label: "Propostas", icon: FileText, end: true },
          {
            to: "/propostas-pro-max",
            label: "Propostas Pró Max",
            icon: FileText,
            end: false,
            activeMatch: (p) => p.startsWith("/propostas-pro-max"),
          },
          { to: "/ranking", label: "Ranking", icon: Trophy, end: true },
          { to: "/estoque-contempladas", label: "Contempladas", icon: BadgeCheck, end: true },
        ],
      },
      pos: {
        title: "Pós-venda",
        icon: Wallet,
        items: [
          { to: "/carteira", label: "Carteira", icon: Wallet, end: true },
          { to: "/giro-de-carteira", label: "Giro de Carteira", icon: CalendarClock, end: true },
          { to: "/gestao-de-grupos", label: "Gestão de Grupos", icon: Layers, showDot: navAlerts.gestaoGrupos, end: true },
        ],
      },
      admin: {
        title: "Administrativo",
        icon: SlidersHorizontal,
        items: [
          { to: "/relatorios", label: "Relatórios", icon: BarChart3, end: true },
          { to: "/usuarios", label: "Usuários", icon: UserCog, end: true },
          { to: "/parametros", label: "Parâmetros", icon: SlidersHorizontal, end: true },
          { to: "/clientes", label: "Clientes", icon: UserCog, end: true },
          { to: "/processos", label: "Processos", icon: ClipboardList, end: true },
          { to: "/rh", label: "RH", icon: ClipboardList, end: true },
        ],
      },
      fin: {
        title: "Financeiro",
        icon: LineChart,
        items: [
          { to: "/comissoes", label: "Comissões", icon: BarChart3, end: true },
          { to: "/fluxo-de-caixa", label: "Fluxo de Caixa", icon: LineChart, onlyForWesley: true, showDot: navAlerts.fluxoCaixa, end: true },
        ],
      },
      max: {
        title: "Maximize-se",
        icon: Trophy,
        items: [
          { to: "/central-projetos", label: "Central de Projetos", icon: FolderKanban, end: true },
          { to: "/procedimentos", label: "Procedimentos", icon: ClipboardList, end: true },
          { to: "/links", label: "Links Úteis", icon: LinkIcon, end: true },
        ],
      },
    }),
    [navAlerts]
  );

  const widthClass = useMemo(() => {
    if (isSmall) return "w-[92vw] max-w-[360px]";
    return collapsed ? "md:w-20" : "md:w-64";
  }, [isSmall, collapsed]);

  const textHidden = collapsed ? "md:opacity-0 md:pointer-events-none md:select-none md:w-0 opacity-100" : "opacity-100";
  const pillPadding = collapsed ? "md:px-2.5 px-3" : "px-3";
  const mobileTapFx = "active:scale-[0.99] active:opacity-90";

  const flatItems = useMemo(() => {
    const groupOrder: GroupKey[] = ["vendas", "pos", "admin", "fin", "max"];
    return groupOrder.flatMap((key) => navGroups[key].items);
  }, [navGroups]);

  const handleNav = () => {
    if (isSmall) setMobileOpen(false);
    onNavigate?.();
  };

  const isItemActive = (item: FlatItem) => Boolean(item.activeMatch?.(pathname));

  const pillClass = (isActive: boolean) =>
    `${pillPadding} py-2.5 rounded-2xl transition-colors flex items-center gap-2
     ${mobileTapFx}
     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
     ${isActive ? "bg-consulmax-primary text-white" : "hover:bg-consulmax-neutral"}`;

  const renderNavItem = (item: FlatItem, compact = false) => {
    if (!itemIsVisible(item, authUserId)) return null;

    const Icon = item.icon;

    return (
      <NavLink
        key={`${item.to}-${item.label}`}
        to={item.to}
        className={({ isActive }) => `${pillClass(isActive || isItemActive(item))} ${compact ? "justify-center" : ""}`}
        style={({ isActive }) => (isActive || isItemActive(item) ? activePillStyle : glassHoverPill)}
        onClick={handleNav}
        title={item.label}
        end={item.end}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!compact && (
          <span className="flex w-full min-w-0 items-center justify-between">
            <span className="truncate">{item.label}</span>
            {item.showDot && <AlertDot />}
          </span>
        )}
        {compact && item.showDot && <AlertDot />}
      </NavLink>
    );
  };

  const renderSectionPill = (key: GroupKey) => {
    const group = navGroups[key];
    const Icon = group.icon;
    const isOpen = openGroup === key;
    const isActive = currentGroup === key;

    return (
      <button
        type="button"
        onClick={() => {
          if (collapsed) return;
          setOpenGroup((prev) => (prev === key ? null : key));
        }}
        className={`${pillPadding} py-2.5 rounded-2xl transition-colors w-full flex items-center justify-between
                    ${mobileTapFx}
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40`}
        style={isActive ? activePillStyle : glassHoverPill}
        aria-expanded={isOpen}
        title={group.title}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="font-semibold">{group.title}</span>
        </span>
        <span className="opacity-90" aria-hidden>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
    );
  };

  const AsideContent = (
    <aside
      className={`${widthClass} border-r md:shadow md:sticky md:top-14
                  md:min-h-[calc(100vh-56px)] md:h-auto
                  h-[calc(100vh-56px)] p-3 overflow-y-auto overflow-x-hidden
                  pb-[max(env(safe-area-inset-bottom),theme(spacing.6))]`}
      style={glassSidebarBase}
      role="navigation"
      aria-label="Navegação principal"
    >
      {!collapsed && <SidebarLiquidBG />}

      <div
        className="sticky top-0 z-[2] -mx-3 px-3 pt-0 pb-3"
        style={{
          background: "rgba(245,245,245,.65)",
          backdropFilter: "saturate(160%) blur(10px)",
          WebkitBackdropFilter: "saturate(160%) blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,.35)",
        }}
      >
        {isSmall && (
          <div className="flex items-center justify-end mb-2">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center justify-center rounded-xl border px-2.5 py-2 hover:bg-white/60"
              style={glassHoverPill}
              aria-label="Fechar menu"
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <Link
          to="/oportunidades"
          className="relative z-[1] flex items-center gap-3 mb-2"
          onClick={handleNav}
          aria-label="Ir para Oportunidades"
        >
          <img
            src={LOGO_URL}
            alt="Consulmax"
            title="Consulmax"
            width={40}
            height={40}
            loading="eager"
            className="h-10 w-10 object-contain rounded-md bg-[#F5F5F5]"
            onError={(event) => {
              (event.currentTarget as HTMLImageElement).src = FALLBACK_URL;
            }}
          />

          <div className={`flex flex-col leading-tight transition-opacity duration-200 ${textHidden}`}>
            <span className="font-bold text-consulmax-primary text-lg">Consulmax</span>
            <span className="text-xs text-consulmax-secondary -mt-0.5">Maximize as suas conquistas</span>
          </div>
        </Link>

        <div className="relative z-[1]">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={`hidden md:inline-flex items-center justify-center rounded-xl border px-2.5 py-1.5 text-xs hover:bg-white/60
                        ${mobileTapFx}
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40`}
            title={collapsed ? "Expandir barra lateral" : "Ocultar barra lateral"}
            aria-label={collapsed ? "Expandir barra lateral" : "Ocultar barra lateral"}
            style={glassHoverPill}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span className="ml-1.5">Ocultar</span>}
          </button>
        </div>
      </div>

      <nav className="relative z-[1] grid gap-2 mt-3">
        {collapsed && !isSmall && flatItems.map((item) => renderNavItem(item, true))}

        {(!collapsed || isSmall) && (
          <>
            {(["vendas", "pos", "admin", "fin", "max"] as GroupKey[]).map((key) => (
              <div key={key} className="grid gap-2">
                {renderSectionPill(key)}
                {openGroup === key && (
                  <div className="ml-4 grid gap-2">
                    {navGroups[key].items.map((item) => renderNavItem(item))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </nav>
    </aside>
  );

  return (
    <>
      {isSmall && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="fixed top-16 left-3 z-[60] rounded-2xl border px-3 py-2 text-sm bg-white/70 backdrop-blur hover:bg-white/80"
          style={{ borderColor: "rgba(255,255,255,.45)" }}
          aria-label="Abrir menu"
        >
          Menu
        </button>
      )}

      {isSmall ? (
        <>
          {mobileOpen && <div className="fixed inset-0 z-[50] bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />}

          <div
            className={`fixed left-0 top-0 z-[55] h-dvh transform transition-transform duration-200 ${
              mobileOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            {AsideContent}
          </div>
        </>
      ) : (
        AsideContent
      )}
    </>
  );
}
