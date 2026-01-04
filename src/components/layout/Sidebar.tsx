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
  ChevronDown,
  ChevronRight,
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

/** Oportunidades atrasadas */
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

/** Fluxo de Caixa – usa coluna data (date) e compara string YYYY-MM-DD */
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

/** Gestão de Grupos – campos date */
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

type GroupKey = "vendas" | "pos" | "admin" | "fin";

function isAnyPathActive(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p));
}

function groupForPath(pathname: string): GroupKey {
  if (
    isAnyPathActive(pathname, [
      "/planejamento",
      "/oportunidades",
      "/simuladores",
      "/propostas",
      "/ranking",
      "/estoque-contempladas",
    ])
  )
    return "vendas";

  if (isAnyPathActive(pathname, ["/carteira", "/giro-de-carteira", "/gestao-de-grupos", "/clientes"])) return "pos";

  if (isAnyPathActive(pathname, ["/relatorios", "/usuarios", "/parametros"])) return "admin";

  return "fin";
}

/** ====== Componente ====== */
export default function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation();
  const pathname = location.pathname;

  // Colapsar com persistência
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("@consulmax:sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("@consulmax:sidebar-collapsed", collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  // fecha drawer no mobile ao navegar
  useEffect(() => {
    onNavigate?.();
  }, [location.pathname, onNavigate]);

  // Carregar administradoras (Simuladores)
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [embraconId, setEmbraconId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setAdminsLoading(true);
      try {
        const { data, error } = await supabase
          .from("sim_admins")
          .select("id, name, slug")
          .order("name", { ascending: true });

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
  });

  useEffect(() => {
    let alive = true;
    const todayStr = todayDateStr();

    const loadAlerts = async () => {
      try {
        const [hasOpp, hasCash, hasGroups] = await Promise.all([
          checkOpportunitiesAlert(todayStr),
          checkCashFlowAlert(todayStr),
          checkGroupsAlert(todayStr),
        ]);

        if (!alive) return;
        setNavAlerts({
          oportunidades: hasOpp,
          fluxoCaixa: hasCash,
          gestaoGrupos: hasGroups,
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

  // classes utilitárias colapsado
  const widthClass = collapsed ? "md:w-20 w-full" : "md:w-64 w-full";
  const textHidden = collapsed ? "opacity-0 pointer-events-none select-none w-0" : "opacity-100";
  const pillPadding = collapsed ? "px-2.5" : "px-3";

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
      { to: simuladoresHref, label: "Simuladores", icon: Calculator, end: false },
      { to: "/propostas", label: "Propostas", icon: FileText, end: true },
      { to: "/ranking", label: "Ranking", icon: Trophy, end: true },
      { to: "/estoque-contempladas", label: "Contempladas", icon: BadgeCheck, end: true },

      // Pós-venda (✅ Carteira primeiro)
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
    ],
    [navAlerts, simuladoresHref]
  );

  const pillClass = (isActive: boolean) =>
    `${pillPadding} py-2.5 rounded-2xl transition-colors flex items-center gap-2
     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
     ${isActive ? "bg-consulmax-primary text-white" : "hover:bg-consulmax-neutral"}`;

  // Título pequeno (sem pill), clicável para accordion
  const renderSectionTitle = (key: GroupKey, title: string) => {
    const isOpen = openGroup === key;
    const isActive = currentGroup === key;

    return (
      <button
        type="button"
        onClick={() => {
          if (collapsed) return;
          setOpenGroup((prev) => (prev === key ? prev : key)); // accordion: troca e mantém 1 aberto
        }}
        className={`
          mt-2 flex w-full items-center justify-between px-1.5 py-1
          text-[11px] uppercase tracking-wide
          ${isActive ? "text-consulmax-primary font-semibold" : "text-consulmax-secondary/80"}
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/30
        `}
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <span className="opacity-80" aria-hidden>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
    );
  };

  return (
    <aside
      className={`${widthClass} border-r md:shadow md:sticky md:top-14
                  min-h-[calc(100vh-56px)] h-auto p-3 overflow-visible
                  pb-[max(env(safe-area-inset-bottom),theme(spacing.6))]`}
      style={glassSidebarBase}
      role="navigation"
      aria-label="Navegação principal"
    >
      {!collapsed && <SidebarLiquidBG />}

      {/* LOGO */}
      <Link
        to="/oportunidades"
        className="relative z-[1] flex items-center gap-3 mb-2"
        onClick={() => onNavigate?.()}
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

      {/* Botão ocultar/expandir */}
      <div className="relative z-[1] mb-2">
        <button
          type="button"
          onClick={() => {
            if (!collapsed) {
              setSimGroupOpen(false);
            }
            setCollapsed((v) => !v);
          }}
          className="inline-flex items-center justify-center rounded-xl border px-2.5 py-1.5 text-xs hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40"
          title={collapsed ? "Expandir barra lateral" : "Ocultar barra lateral"}
          aria-label={collapsed ? "Expandir barra lateral" : "Ocultar barra lateral"}
          style={glassHoverPill}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && <span className="ml-1.5">Ocultar</span>}
        </button>
      </div>

      {/* Navegação */}
      <nav className="relative z-[1] grid gap-2">
        {/* ===== MODO COLAPSADO (flat) ===== */}
        {collapsed && (
          <>
            {flatItems
              .filter((i) => !i.onlyForWesley || authUserId === WESLEY_ID)
              .map((i) => (
                <NavLink
                  key={`${i.to}-${i.label}`}
                  to={i.to}
                  className={({ isActive }) => `${pillClass(isActive)} justify-center`}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={() => onNavigate?.()}
                  title={i.label}
                  end={i.end}
                >
                  <i.icon className="h-4 w-4" />
                </NavLink>
              ))}
          </>
        )}

        {/* ===== MODO EXPANDIDO (accordion + títulos pequenos) ===== */}
        {!collapsed && (
          <>
            {/* VENDAS */}
            {renderSectionTitle("vendas", "Vendas")}
            {openGroup === "vendas" && (
              <div className="ml-1 grid gap-2">
                <NavLink
                  to="/planejamento"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={() => onNavigate?.()}
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
                  onClick={() => onNavigate?.()}
                  title="Oportunidades"
                  end
                >
                  <Briefcase className="h-4 w-4" />
                  <span className="flex items-center justify-between w-full">
                    <span>Oportunidades</span>
                    {navAlerts.oportunidades && <AlertDot />}
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
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                               ${isActive ? "bg-consulmax-primary text-white" : "hover:bg-consulmax-neutral"}`
                            }
                            style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                            onClick={() => onNavigate?.()}
                          >
                            {ad.name}
                          </NavLink>
                        ))}

                      {!adminsLoading && admins.length === 0 && embraconId && (
                        <NavLink
                          to={`/simuladores/${embraconId}`}
                          className={({ isActive }) =>
                            `${pillPadding} py-2.5 rounded-2xl transition-colors
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                             ${isActive ? "bg-consulmax-primary text-white" : "hover:bg-consulmax-neutral"}`
                          }
                          style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                          onClick={() => onNavigate?.()}
                        >
                          Embracon
                        </NavLink>
                      )}

                      <NavLink
                        to="/simuladores/add"
                        className={({ isActive }) =>
                          `${pillPadding} py-2.5 rounded-2xl transition-colors
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulmax-primary/40
                           ${isActive ? "bg-consulmax-primary text-white" : "hover:bg-consulmax-neutral"}`
                        }
                        style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                        onClick={() => onNavigate?.()}
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
                  onClick={() => onNavigate?.()}
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
                  onClick={() => onNavigate?.()}
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
                  onClick={() => onNavigate?.()}
                  title="Contempladas"
                  end
                >
                  <BadgeCheck className="h-4 w-4" />
                  Contempladas
                </NavLink>
              </div>
            )}

            {/* PÓS-VENDA */}
            {renderSectionTitle("pos", "Pós-venda")}
            {openGroup === "pos" && (
              <div className="ml-1 grid gap-2">
                {/* ✅ Carteira primeiro */}
                <NavLink
                  to="/carteira"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={() => onNavigate?.()}
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
                  onClick={() => onNavigate?.()}
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
                  onClick={() => onNavigate?.()}
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
                  onClick={() => onNavigate?.()}
                  title="Clientes"
                  end
                >
                  <UserCog className="h-4 w-4" />
                  Clientes
                </NavLink>
              </div>
            )}

            {/* ADMINISTRATIVO */}
            {renderSectionTitle("admin", "Administrativo")}
            {openGroup === "admin" && (
              <div className="ml-1 grid gap-2">
                <NavLink
                  to="/relatorios"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={() => onNavigate?.()}
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
                  onClick={() => onNavigate?.()}
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
                  onClick={() => onNavigate?.()}
                  title="Parâmetros"
                  end
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Parâmetros
                </NavLink>
              </div>
            )}

            {/* FINANCEIRO */}
            {renderSectionTitle("fin", "Financeiro")}
            {openGroup === "fin" && (
              <div className="ml-1 grid gap-2">
                <NavLink
                  to="/comissoes"
                  className={({ isActive }) => pillClass(isActive)}
                  style={({ isActive }) => (isActive ? activePillStyle : glassHoverPill)}
                  onClick={() => onNavigate?.()}
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
                    onClick={() => onNavigate?.()}
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
          </>
        )}
      </nav>
    </aside>
  );
}
