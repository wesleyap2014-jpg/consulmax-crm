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

// Util: timeout para promessas (evita travar a UI em redes ruins)
function withTimeout<T>(promise: Promise<T>, ms: number, label = "Operação") {
  let t: any;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} excedeu ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// Chave de cache por usuário
const cacheKey = (uid: string) => `hdr_profile_v1:${uid}`;
const cacheAvatarKey = (uid: string) => `hdr_avatar_url_v1:${uid}`;

export default function Header() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (
        menuRef.current &&
        !menuRef.current.contains(t) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(t)
      ) {
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
    async (authUserId: string, signal?: AbortSignal) => {
      // SELECT mínimo e direto; com timeout para não travar
      const p = supabase
        .from("users")
        .select("nome, avatar_url")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      const { data, error } = await withTimeout(p, 4000, "Carregar perfil");
      if (signal?.aborted) return null;
      if (error) {
        console.error("users fetch error:", (error as any).message || error);
        return null;
      }
      return data as { nome?: string | null; avatar_url?: string | null } | null;
    },
    []
  );

  // gera/renova signed URL quando há caminho de Storage
  const buildAvatarUrl = useCallback(async (path: string) => {
    // Se já é http(s), usa direto
    if (/^https?:\/\//i.test(path)) return path;

    // Tenta signed de 60min com timeout curto para não travar
    const { data, error } = await withTimeout(
      supabase.storage.from("avatars").createSignedUrl(path, 60 * 60),
      3500,
      "Avatar URL"
    );
    if (error) throw new Error((error as any).message || "Erro ao gerar avatar");
    return data.signedUrl;
  }, []);

  const scheduleAvatarRefresh = useCallback(
    (path: string) => {
      if (avatarRefreshTimer.current) clearTimeout(avatarRefreshTimer.current);
      // Renova 5 min antes de expirar (60min) — aqui aos 55 min
      avatarRefreshTimer.current = setTimeout(async () => {
        try {
          const next = await buildAvatarUrl(path);
          setAvatarUrl(next);
          scheduleAvatarRefresh(path);
        } catch (e) {
          console.error("avatar refresh error:", e);
          setAvatarUrl(null);
        }
      }, 55 * 60 * 1000);
    },
    [buildAvatarUrl]
  );

  const loadAvatar = useCallback(
    async (uid: string, path: string | null | undefined) => {
      // limpa timer
      if (avatarRefreshTimer.current) {
        clearTimeout(avatarRefreshTimer.current);
        avatarRefreshTimer.current = null;
      }
      if (!path) {
        setAvatarUrl(null);
        sessionStorage.removeItem(cacheAvatarKey(uid));
        return;
      }

      // tenta ler do cache do avatar (para render instantânea)
      const cached = sessionStorage.getItem(cacheAvatarKey(uid));
      if (cached) {
        setAvatarUrl(cached);
      }

      try {
        const nextUrl = await buildAvatarUrl(path);
        setAvatarUrl(nextUrl);
        sessionStorage.setItem(cacheAvatarKey(uid), nextUrl);
        scheduleAvatarRefresh(path);
      } catch (e) {
        console.error("avatar url:", e);
        setAvatarUrl(null);
        sessionStorage.removeItem(cacheAvatarKey(uid));
      }
    },
    [buildAvatarUrl, scheduleAvatarRefresh]
  );

  const applyProfile = useCallback((uid: string, value: Profile) => {
    setProfile(value);
    // cache rápido para UX suave
    sessionStorage.setItem(cacheKey(uid), JSON.stringify(value));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);

    let alive = true;
    const ctrl = new AbortController();

    try {
      const { data: userRes, error: userErr } = await withTimeout(
        supabase.auth.getUser(),
        2500,
        "Sessão"
      );
      if (userErr) {
        console.error("auth.getUser error:", (userErr as any).message || userErr);
      }
      const user = userRes?.user;

      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      const uid = user.id;

      // 1) Render instantâneo via cache, se existir
      const cachedRaw = sessionStorage.getItem(cacheKey(uid));
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw) as Profile;
          if (alive) {
            setProfile(cached);
            setLoading(false);
            // não sai — continua atualizando silenciosamente em background
          }
        } catch {
          // ignore cache inválido
        }
      }

      // 2) Monta base mínima (metadata / email) para pintar rápido na falta de cache
      const quickName =
        (user.user_metadata as any)?.nome ||
        (user.user_metadata as any)?.full_name ||
        user.email ||
        "";
      const quickEmail = user.email || "";
      const quickAvatar =
        (user.user_metadata as any)?.avatar_url || null;

      // Preenche se não houver cache
      if (!cachedRaw) {
        if (alive) {
          applyProfile(uid, { name: quickName, email: quickEmail, avatarPath: quickAvatar });
          setLoading(false);
        }
      }

      // 3) Busca refinada no banco (com timeout/abort)
      const row = await fetchUsersRow(uid, ctrl.signal);
      if (!alive) return;

      const finalName = row?.nome || quickName;
      const finalAvatar = row?.avatar_url ?? quickAvatar;

      applyProfile(uid, { name: finalName, email: quickEmail, avatarPath: finalAvatar });

      // 4) Avatar (assíncrono; sem bloquear UI)
      loadAvatar(uid, finalAvatar);
    } catch (e: any) {
      if (!alive) return;
      console.error("load header profile:", e);
      setError(e?.message || "Falha ao carregar usuário");
    } finally {
      if (alive) setLoading(false);
    }

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [applyProfile, fetchUsersRow, loadAvatar, navigate]);

  // carrega sessão + perfil (com redirecionamento se não houver) e assina mudanças
  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      const cleanup = await load();
      // assina mudanças de sessão (login/logout/troca de usuário)
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        if (!user) {
          navigate("/login", { replace: true });
          return;
        }
        // recarrega sem travar (usa cache + background)
        load();
      });
      unsub = () => sub.subscription.unsubscribe();

      // cleanup do load (abort) se existir
      if (typeof cleanup === "function") cleanup();
    })();

    return () => {
      if (unsub) unsub();
      if (avatarRefreshTimer.current) clearTimeout(avatarRefreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleRetry = useCallback(() => {
    setError(null);
    load();
  }, [load]);

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

          {/* Nome / Email + estado de erro */}
          <div className="hidden sm:flex flex-col leading-tight min-w-[10rem]">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {profile.name || (loading ? "Carregando..." : "Usuário")}
            </span>
            {error ? (
              <button
                onClick={handleRetry}
                className="text-xs text-red-600 hover:underline text-left"
                title={error}
              >
                Falha ao carregar — Tentar novamente
              </button>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {profile.email || (loading ? "—" : "")}
              </span>
            )}
          </div>

          {/* Dropdown do usuário */}
          <div className="relative" ref={menuRef}>
            <button
              ref={menuBtnRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
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
                    setMenuOpen(false);
                    navigate("/perfil");
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Meu perfil
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
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
                    setMenuOpen(false);
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
