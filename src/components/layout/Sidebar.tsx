// src/components/layout/Sidebar.tsx
import { NavLink, Link, useLocation } from "react-router-dom";
import { useMemo, useState, useEffect, useId, type CSSProperties, type FC } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Calculator,
  FileText,
  Wallet,
  Layers,
  UserCog,
  SlidersHorizontal,
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  Trophy,
  CalendarClock,
  LineChart,
  ClipboardList,
  BadgeCheck,
  Calendar,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  BookOpen,
} from "lucide-react";

type SidebarProps = { onNavigate?: () => void };

const WESLEY_ID = "524f9d55-48c0-4c56-9ab8-7e6115e7c0b0";

const LOGO_URL = "/logo-consulmax.png?v=3";
const FALLBACK_URL = "/favicon.ico?v=3";

type AdminRow = { id: string; name: string; slug: string | null };

type NavAlerts = {
  oportunidades: boolean;
  fluxoCaixa: boolean;
  gestaoGrupos: boolean;
  agenda: boolean;
};

/** ====== Liquid Glass ====== */
const glassSidebarBase: CSSProperties = {
  position: "relative",
  background: "rgba(255,255,255,.55)",
  borderRight: "1px solid rgba(255,255,255,.35)",
  backdropFilter: "saturate(160%) blur(10px)",
  WebkitBackdropFilter: "saturate(160%) blur(10px)",
  boxShadow: "inset -8px 0 30px rgba(181,165,115,.10)",
};

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

const SidebarLiquidBG: FC = () => (
  <div style={sbLiquidCanvas} aria-hidden>
    <style>{sbLiquidKeyframes}</style>
    <span style={{ ...sbBlob, ...sbBlob1 }} />
    <span style={{ ...sbBlob, ...sbBlob2 }} />
    <span style={{ ...sbGoldGlow }} />
  </div>
);

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

/** ====== Helpers de data / alertas ====== */
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
  } catch (e) {
    console.error("Erro inesperado em checkOpportunitiesAlert:", e);
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
  } catch (e) {
    console.error("Erro inesperado em checkCashFlowAlert:", e);
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
  } catch (e) {
    console.error("Erro inesperado em checkGroupsAlert:", e);
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
  } catch (e) {
    console.error("Erro inesperado em checkAgendaAlert:", e);
    return false;
  }
}

const AlertDot: FC = () => (
  <span
    className="ml-2 h-2.5 w-2.5 rounded-full bg-[#A11C27] animate-pulse shadow-[0_0_0_4px_rgba(161,28,39,0.25)]"
    aria-label="Há pendências para hoje"
  />
);

type FlatItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  onlyForWesley?: boolean;
  showDot?: boolean;
  end?: boolean;
};

type GroupKey = "vendas" | "pos" | "admin" | "fin" | "max";

function isAnyPathActive(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p));
}

function groupForPath(pathname: string): GroupKey {
  if (
    isAnyPathActive(pathname, [
      "/planejamento",
      "/oportunidades",
      "/agenda",
      "/simuladores",
      "/propostas",
      "/ranking",
      "/estoque-contempladas",
    ])
  )
    return "vendas";

  if (isAnyPathActive(pathname, ["/carteira", "/giro-de-carteira", "/gestao-de-grupos", "/clientes"])) return "pos";

  if (isAnyPathActive(pathname, ["/relatorios", "/usuarios", "/parametros"])) return "admin";

  if (isAnyPathActive(pathname, ["/links", "/procedimentos"])) return "max";

  return "fin";
}

/** ====== Componente ====== */
export default function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation();
  const pathname = location.pathname;

  // Detecta mobile/tablet (para ajustar colapso/width/scroll)
  const [isSmall, setIsSmall] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
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

  // Colapsar com persistência (apenas desktop)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("@consulmax:sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Em telas pequenas, forçamos expandido (menu em drawer já faz o papel de “compacto”)
    if (isSmall && collapsed) setCollapsed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSmall]);

  useEffect(() => {
    try {
      localStorage.setItem("@consulmax:sidebar-collapsed", collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  // fecha drawer no mobile ao navegar (fallback)
  useEffect(() => {
    onNavigate?.();
  }, [location.pathname, onNavigate]);

  // Fecha drawer IMEDIATAMENTE ao clicar (experiência mobile “app-like”)
  const handleNav = () => {
    onNavigate?.();
  };

  // Carregar administradoras (Simuladores)
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [embraconId, setEmbraconId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setAdminsLoading(true);
      try {
        const { data, error } = await supabase.from("sim_admins").select("id, name, slug").order("name", { ascending: true });

        if (!alive) return;

        if (error) {
          console.error("Erro ao carregar administradoras:", error.message);
          setAdmins([]);
          setEmbraconId(null);
        } else {
          const list = (data ?? []) as AdminRow[];
          setAdmins(list);
          const embr = list.find((a) => a.name?.toLowerCase?.() === "embracon");
          setEmbraconId(embr?.id ?? null);
        }
      } catch (e: any) {
        if (!alive) return;
        console.error("Erro inesperado ao carregar administradoras:", e?.message || e);
        setAdmins([]);
        setEmbraconId(null);
      } finally {
        if (alive) setAdminsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const simuladoresActive = useMemo(() => pathname.startsWith("/simuladores"), [pathname]);

  // Usuário autenticado (para esconder Fluxo de Caixa pros demais)
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;
        if (error || !data?.user) setAuthUserId(null);
        else setAuthUserId(data.user.id);
      } catch {
        if (!alive) return;
        setAuthUserId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Alerts de hoje
  const [navAlerts, setNavAlerts] = useState<NavAlerts>({
    oportunidades: false,
    fluxoCaixa: false,
    gestaoGrupos: false,
    agenda: false,
  });

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
      } catch (e) {
        if (!alive) return;
        console.error("Erro ao carregar alertas de navegação:", e);
      }
    };

    loadAlerts();
    const interval = window.setInterval(loadAlerts, 5 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  // ====== Responsividade ======
  // No mobile/tablet (drawer), NÃO usar w-full (isso estoura). Usar largura “panel”.
  const widthClass = useMemo(() => {
    if (isSmall) return "w-[92vw] max-w-[360px]";
    return collapsed ? "md:w-20" : "md:w-64";
  }, [isSmall, collapsed]);

  const textHidden = collapsed ? "md:opacity-0 md:pointer-events-none md:select-none md:w-0 opacity-100" : "opacity-100";
  const pillPadding = collapsed ? "md:px-2.5 px-3" : "px-3";

  // Accordion: só 1 grupo aberto
  const currentGroup = useMemo<GroupKey>(() => groupForPath(pathname), [pathname]);
  const [openGroup, setOpenGroup] = useState<GroupKey>(currentGroup);

  useEffect(() => {
    if (!collapsed) setOpenGroup(currentGroup);
  }, [currentGroup, collapsed]);

  // subgrupo Simuladores abre quando a rota é /simuladores
  const simListId = useId();
  const [simGroupOpen, setSimGroupOpen] = useState(simuladoresActive);
  useEffect(() => {
    setSimGroupOpen(simuladoresActive);
  }, [simuladoresActive]);

  // Href para Simuladores no modo colapsado
  const simuladoresHref = useMemo(() => {
    if (embraconId) return `/simuladores/${embraconId}`;
    if (admins.length > 0) return `/simuladores/${admins[0].id}`;
    return "/simuladores/add";
  }, [embraconId, admins]);

  // ====== Itens “flat” (modo colapsado) ======
  const flatItems: FlatItem[] = useMemo(
    () => [
      // Vendas
      { to: "/planejamento", label: "Planejamento", icon: ClipboardList, end: true },
      { to: "/oportunidades", label: "Oportunidades", icon: Briefcase, showDot: navAlerts.oportunidades, end: true },
      { to: "/agenda", label: "Agenda", icon: Calendar, showDot: navAlerts.agenda, end: true },
      { to: simuladoresHref, label: "Simuladores", icon: Calculator, end: false },
      { to: "/propostas", label: "Propostas", icon: FileText, end: true },
      { to: "/ranking", label: "Ranking", icon: Trophy, end: true },
      { to: "/estoque-contempladas", label: "Contempladas", icon: BadgeCheck, end: true },

      // Pós-venda
      { to: "/carteira", label: "Carteira", icon: Wallet, end: true },
      { to: "/giro-de-carteira", label: "Giro de Carteira", icon: CalendarClock, end: true },
      { to: "/gestao-de-grupos", label: "Gestão de Grupos", icon: Layers, showDot: navAlerts.gestaoGrupos, end: true },
      { to: "/clientes", label: "Clientes", icon: UserCog, end: true },

      // Administrativo
      { to: "/relatorios", label: "Relatórios", icon: BarChart3, end: true },
      { to: "/usuarios", label: "Usuários", icon: UserCog, end: true },
      { to: "/parametros", label: "Parâmetros", icon: SlidersHorizontal, end: true },

      // Financeiro
      { to: "/comissoes", label: "Comissões", icon: BarChart3, end: true },
      {
        to: "/fluxo-de-caixa",
        label: "Fluxo de Caixa",
        icon: LineChart,
        onlyForWesley: true,
        showDot: navAlerts.fluxoCaixa,
        end: true,
      },

      // Maximize-se
      { to: "/procedimentos", label: "Procedimentos", icon: BookOpen, end: true },
      { to: "/links", label: "Links Úteis", icon: LinkIcon, end: true },
    ],
    [navAlerts, simuladoresHref]
  );

  // Feedback de toque (mobile): active/pressed
  const mobileTapFx = "active:scale-[0.99] active:opacity-90";

  const pillClass = (isActive: boolean) =>
    `${pillPadding} py-2.5 rounded-2xl transition-colors flex items-center gap-2
     ${mobileTapFx}
     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
     ${isActive ? "bg-consulmax-primary text-white" : "hover:bg-consulmax-neutral"}`;

  const renderSectionPill = (key: GroupKey, title: string, Icon: LucideIcon) => {
    const isOpen = openGroup === key;
    const isActive = currentGroup === key;

    return (
      <button
        type="button"
        onClick={() => {
          if (collapsed) return;
          setOpenGroup((prev) => (prev === key ? prev : key));
        }}
        className={`${pillPadding} py-2.5 rounded-2xl transition-colors w-full flex items-center justify-between
                    ${mobileTapFx}
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40`}
        style={isActive ? activePillStyle : glassHoverPill}
        aria-expanded={isOpen}
        title={title}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="font-semibold">{title}</span>
        </span>
        <span className="opacity-90" aria-hidden>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
    );
  };

  return (
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

      {/* HEADER (sticky no mobile/tablet pra ficar “app-like”) */}
      <div
        className="sticky top-0 z-[2] -mx-3 px-3 pt-0 pb-3"
        style={{
          background: "rgba(245,245,245,.65)",
          backdropFilter: "saturate(160%) blur(10px)",
          WebkitBackdropFilter: "saturate(160%) blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,.35)",
        }}
      >
        {/* LOGO */}
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
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = FALLBACK_URL;
            }}
          />
          <div className={`flex flex-col leading-tight transition-opacity duration-200 ${textHidden}`}>
            <span className="font-bold text-consulmax-primary text-lg">Consulmax</span>
            <span className="text-xs text-consulmax-secondary -mt-0.5">Maximize as suas conquistas</span>
          </div>
        </Link>

        {/* Botão ocultar/expandir (apenas desktop) */}
        <div className="relative z-[1]">
          <button
            type="button"
            onClick={() => {
              if (!collapsed) setSimGroupOpen(false);
              setCollapsed((v) => !v);
            }}
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

      {/* Navegação */}
      <nav className="relative z-[1] grid gap-2">
        {/* ===== MODO COLAPSADO (flat) ===== */}
        {collapsed && !isSmall && (
          <>
            {flatItems
              .filter((i) => !i.onlyForWesley || authUserId === WESLEY_ID)
              .map((i) => (
                <NavLink
                  key={`${i.to}-${i.label}`}
                  to={i.to}
                  className={({ isActive }) => `${pillClass(isActive)} justify-center`}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title={i.label}
                  end={i.end}
                >
                  <i.icon className="h-4 w-4" />
                </NavLink>
              ))}
          </>
        )}

        {/* ===== MODO EXPANDIDO (accordion + títulos em pill) ===== */}
        {(!collapsed || isSmall) && (
          <>
            {/* VENDAS */}
            {renderSectionPill("vendas", "Vendas", Briefcase)}
            {openGroup === "vendas" && (
              <div className="ml-1 grid gap-2">
                <NavLink
                  to="/planejamento"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Planejamento"
                  end
                >
                  <ClipboardList className="h-4 w-4" />
                  Planejamento
                </NavLink>

                <NavLink
                  to="/oportunidades"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Oportunidades"
                  end
                >
                  <Briefcase className="h-4 w-4" />
                  <span className="flex items-center justify-between w-full">
                    <span>Oportunidades</span>
                    {navAlerts.oportunidades && <AlertDot />}
                  </span>
                </NavLink>

                <NavLink
                  to="/agenda"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Agenda"
                  end
                >
                  <Calendar className="h-4 w-4" />
                  <span className="flex items-center justify-between w-full">
                    <span>Agenda</span>
                    {navAlerts.agenda && <AlertDot />}
                  </span>
                </NavLink>

                {/* Simuladores (subgrupo dentro de Vendas) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setSimGroupOpen((v) => !v)}
                    className={pillClass(simuladoresActive) + " w-full justify-between"}
                    style={simuladoresActive ? activePillStyle : glassHoverPill}
                    aria-expanded={simGroupOpen}
                    aria-controls={simListId}
                    title="Simuladores"
                  >
                    <span className="flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      <span>Simuladores</span>
                    </span>
                    <span className="text-xs opacity-80" aria-hidden>
                      {simGroupOpen ? "▾" : "▸"}
                    </span>
                  </button>

                  {simGroupOpen && (
                    <div id={simListId} className="ml-6 grid gap-1 mt-1">
                      {adminsLoading && <div className="px-3 py-2 text-xs text-gray-500">Carregando…</div>}

                      {!adminsLoading &&
                        admins.length > 0 &&
                        admins.map((ad) => (
                          <NavLink
                            key={ad.id}
                            to={`/simuladores/${ad.id}`}
                            className={({ isActive }) =>
                              `${pillPadding} py-2.5 rounded-2xl transition-colors
                               ${mobileTapFx}
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                               ${isActive ? "bg-consulmax-primary text-white" : "hover:bg-consulmax-neutral"}`
                            }
                            style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                            onClick={handleNav}
                          >
                            {ad.name}
                          </NavLink>
                        ))}

                      {!adminsLoading && admins.length === 0 && embraconId && (
                        <NavLink
                          to={`/simuladores/${embraconId}`}
                          className={({ isActive }) =>
                            `${pillPadding} py-2.5 rounded-2xl transition-colors
                             ${mobileTapFx}
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                             ${isActive ? "bg-consulmax-primary text-white" : "hover:bg-consulmax-neutral"}`
                          }
                          style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                          onClick={handleNav}
                        >
                          Embracon
                        </NavLink>
                      )}

                      <NavLink
                        to="/simuladores/add"
                        className={({ isActive }) =>
                          `${pillPadding} py-2.5 rounded-2xl transition-colors
                           ${mobileTapFx}
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                           ${isActive ? "bg-consulmax-primary text-white" : "hover:bg-consulmax-neutral"}`
                        }
                        style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                        onClick={handleNav}
                      >
                        + Add Administradora
                      </NavLink>
                    </div>
                  )}
                </div>

                <NavLink
                  to="/propostas"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Propostas"
                  end
                >
                  <FileText className="h-4 w-4" />
                  Propostas
                </NavLink>

                <NavLink
                  to="/ranking"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Ranking"
                  end
                >
                  <Trophy className="h-4 w-4" />
                  Ranking
                </NavLink>

                <NavLink
                  to="/estoque-contempladas"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Contempladas"
                  end
                >
                  <BadgeCheck className="h-4 w-4" />
                  Contempladas
                </NavLink>
              </div>
            )}

            {/* PÓS-VENDA */}
            {renderSectionPill("pos", "Pós-venda", Wallet)}
            {openGroup === "pos" && (
              <div className="ml-1 grid gap-2">
                <NavLink
                  to="/carteira"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Carteira"
                  end
                >
                  <Wallet className="h-4 w-4" />
                  Carteira
                </NavLink>

                <NavLink
                  to="/giro-de-carteira"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Giro de Carteira"
                  end
                >
                  <CalendarClock className="h-4 w-4" />
                  Giro de Carteira
                </NavLink>

                <NavLink
                  to="/gestao-de-grupos"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Gestão de Grupos"
                  end
                >
                  <Layers className="h-4 w-4" />
                  <span className="flex items-center justify-between w-full">
                    <span>Gestão de Grupos</span>
                    {navAlerts.gestaoGrupos && <AlertDot />}
                  </span>
                </NavLink>

                <NavLink
                  to="/clientes"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Clientes"
                  end
                >
                  <UserCog className="h-4 w-4" />
                  Clientes
                </NavLink>
              </div>
            )}

            {/* ADMINISTRATIVO */}
            {renderSectionPill("admin", "Administrativo", SlidersHorizontal)}
            {openGroup === "admin" && (
              <div className="ml-1 grid gap-2">
                <NavLink
                  to="/relatorios"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Relatórios"
                  end
                >
                  <BarChart3 className="h-4 w-4" />
                  Relatórios
                </NavLink>

                <NavLink
                  to="/usuarios"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Usuários"
                  end
                >
                  <UserCog className="h-4 w-4" />
                  Usuários
                </NavLink>

                <NavLink
                  to="/parametros"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Parâmetros"
                  end
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Parâmetros
                </NavLink>
              </div>
            )}

            {/* FINANCEIRO */}
            {renderSectionPill("fin", "Financeiro", LineChart)}
            {openGroup === "fin" && (
              <div className="ml-1 grid gap-2">
                <NavLink
                  to="/comissoes"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Comissões"
                  end
                >
                  <BarChart3 className="h-4 w-4" />
                  Comissões
                </NavLink>

                {(!authUserId || authUserId === WESLEY_ID) && (
                  <NavLink
                    to="/fluxo-de-caixa"
                    className={({ isActive }) => pillClass(isActive)}
                    style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                    onClick={handleNav}
                    title="Fluxo de Caixa"
                    end
                  >
                    <LineChart className="h-4 w-4" />
                    <span className="flex items-center justify-between w-full">
                      <span>Fluxo de Caixa</span>
                      {navAlerts.fluxoCaixa && <AlertDot />}
                    </span>
                  </NavLink>
                )}
              </div>
            )}

            {/* MAXIMIZE-SE */}
            {renderSectionPill("max", "Maximize-se", Trophy)}
            {openGroup === "max" && (
              <div className="ml-1 grid gap-2">
                <NavLink
                  to="/procedimentos"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Procedimentos"
                  end
                >
                  <BookOpen className="h-4 w-4" />
                  Procedimentos
                </NavLink>

                <NavLink
                  to="/links"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={handleNav}
                  title="Links Úteis"
                  end
                >
                  <LinkIcon className="h-4 w-4" />
                  Links Úteis
                </NavLink>
              </div>
            )}
          </>
        )}
      </nav>
    </aside>
  );
}
