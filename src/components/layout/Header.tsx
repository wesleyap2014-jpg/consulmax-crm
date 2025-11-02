// src/components/layout/Header.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  name: string;
  email: string;
  avatarPath?: string | null; // caminho no bucket (ex.: "user123/avatar.png") ou URL http(s)
};

function getInitials(name?: string, email?: string) {
  const base = (name || email || "").trim();
  if (!base) return "U";
  const parts = base.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Header() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: "",
    avatarPath: null,
  });

  // URL final do avatar (signed ou http) + controle de refresh
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dropdown simples (acessível)
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Fecha menu ao clicar fora
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuOpen) return;
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t) &&
          menuBtnRef.current && !menuBtnRef.current.contains(t)) {
        setMenuOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  const fetchUsersRow = useCallback(
    async (authUserId: string) => {
      const { data, error } = await supabase
        .from("users")
        .select("nome, avatar_url")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (error) {
        console.error("users fetch error:", error.message);
      }
      return data as { nome?: string | null; avatar_url?: string | null } | null;
    },
    []
  );

  // carrega sessão + perfil (com redirecionamento se não houver)
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        // base do Auth
        let baseName =
          (user.user_metadata as any)?.nome ||
          (user.user_metadata as any)?.full_name ||
          user.email ||
          "";
        const baseEmail = user.email || "";

        // linha em public.users
        const row = await fetchUsersRow(user.id);
        const name = row?.nome || baseName;
        const avatarPath =
          (user.user_metadata as any)?.avatar_url || row?.avatar_url || null;

        if (!alive) return;
        setProfile({ name, email: baseEmail, avatarPath });
      } catch (e) {
        console.error("load header profile:", e);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    // assina mudanças de sessão (login/logout/troca de usuário)
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user;
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      setLoading(true);
      try {
        const quickName =
          (user.user_metadata as any)?.nome ||
          (user.user_metadata as any)?.full_name ||
          user.email ||
          "";
        const quickEmail = user.email || "";
        // Atualiza rápido
        setProfile((p) => ({ ...p, name: quickName, email: quickEmail }));

        // Busca completa (tabela users)
        const row = await fetchUsersRow(user.id);
        const name = row?.nome || quickName;
        const avatarPath =
          (user.user_metadata as any)?.avatar_url || row?.avatar_url || null;
        setProfile({ name, email: quickEmail, avatarPath });
      } catch (e) {
        console.error("auth change reload:", e);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchUsersRow, navigate]);

  // gera/renova signed URL quando há caminho de Storage
  const buildAvatarUrl = useCallback(async (path: string) => {
    // Se já é http(s), usa direto
    if (/^https?:\/\//i.test(path)) return path;
    // Troque "avatars" se o bucket tiver outro nome
    const { data, error } = await supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60); // 1h
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }, []);

  const scheduleAvatarRefresh = useCallback(
    (path: string) => {
      if (avatarRefreshTimer.current) clearTimeout(avatarRefreshTimer.current);
      // Renova 5 min antes de expirar
      avatarRefreshTimer.current = setTimeout(async () => {
        try {
          const next = await buildAvatarUrl(path);
          setAvatarUrl(next);
          // reprograma novamente
          scheduleAvatarRefresh(path);
        } catch (e) {
          console.error("avatar refresh error:", e);
          setAvatarUrl(null);
        }
      }, 55 * 60 * 1000);
    },
    [buildAvatarUrl]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!profile.avatarPath) {
          setAvatarUrl(null);
          // limpa timer
          if (avatarRefreshTimer.current) {
            clearTimeout(avatarRefreshTimer.current);
            avatarRefreshTimer.current = null;
          }
          return;
        }
        const nextUrl = await buildAvatarUrl(profile.avatarPath);
        if (!alive) return;
        setAvatarUrl(nextUrl);
        scheduleAvatarRefresh(profile.avatarPath);
      } catch (e) {
        console.error("avatar url:", e);
        setAvatarUrl(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profile.avatarPath, buildAvatarUrl, scheduleAvatarRefresh]);

  useEffect(() => {
    return () => {
      if (avatarRefreshTimer.current) clearTimeout(avatarRefreshTimer.current);
    };
  }, []);

  const initials = useMemo(
    () => getInitials(profile.name, profile.email),
    [profile.name, profile.email]
  );

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const handleOpenMenu = useCallback(() => setMenuOpen(true), []);
  const handleCloseMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <header
      className="sticky top-0 z-50 h-14 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:bg-slate-900/80 dark:border-slate-800"
      role="banner"
    >
      <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4">
        {/* Marca (coerente com a Sidebar) */}
        <div className="flex items-center gap-3 font-extrabold text-slate-900 dark:text-slate-100">
          <img
            src="/logo-consulmax.png?v=3"
            alt="Consulmax"
            className="h-8 w-8 object-contain rounded-md bg-[#F5F5F5] dark:bg-slate-800"
          />
          <div className="leading-tight">
            <span>Consulmax • </span>
            <span className="text-[#A11C27]">Maximize as suas conquistas</span>
          </div>
        </div>

        {/* Usuário / Menu */}
        <div className="relative flex items-center gap-3">
          {/* Avatar / Iniciais */}
          {loading ? (
            <div
              className="h-9 w-9 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"
              aria-hidden
            />
          ) : avatarUrl ? (
            <img
              src={avatarUrl}
              alt={profile.name || "Avatar"}
              className="h-9 w-9 rounded-full object-cover"
              onError={() => setAvatarUrl(null)}
            />
          ) : (
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              aria-label={`Usuário ${profile.name || profile.email}`}
              title={profile.name || profile.email}
            >
              {initials}
            </div>
          )}

          {/* Nome / Email */}
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {loading ? "Carregando..." : profile.name || "Usuário"}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {loading ? "—" : profile.email}
            </span>
          </div>

          {/* Dropdown do usuário */}
          <div className="relative" ref={menuRef}>
            <button
              ref={menuBtnRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              onFocus={handleOpenMenu}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls="user-menu"
              className="ml-1 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A11C27]/30 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="Abrir menu do usuário"
            >
              Menu
            </button>

            {menuOpen && (
              <div
                id="user-menu"
                role="menu"
                aria-labelledby="user-menu-button"
                className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border bg-white shadow-lg ring-1 ring-black/5 focus:outline-none dark:bg-slate-800 dark:border-slate-700"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    handleCloseMenu();
                    navigate("/perfil");
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Meu perfil
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    handleCloseMenu();
                    navigate("/preferencias");
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Preferências
                </button>
                <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" aria-hidden />
                <button
                  role="menuitem"
                  onClick={() => {
                    handleCloseMenu();
                    handleSignOut();
                  }}
                  className="block w-full px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
