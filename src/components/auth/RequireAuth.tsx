// src/components/auth/RequireAuth.tsx
import { useEffect, useRef, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type CrmUserAccess = {
  id: string;
  auth_user_id: string | null;
  role?: string | null;
  user_role?: string | null;
  is_active?: boolean | null;
};

export default function RequireAuth() {
  const location = useLocation();

  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [crmUser, setCrmUser] = useState<CrmUserAccess | null>(null);
  const [checkedCrmUser, setCheckedCrmUser] = useState(false);

  const mountedRef = useRef(true);
  const crmUserLoadedForAuthIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    let unsub: (() => void) | undefined;

    async function loadSessionAndProfile(s?: Session | null, opts?: { silent?: boolean }) {
      const silent = opts?.silent === true;

      if (!silent) {
        setReady(false);
        setCheckedCrmUser(false);
      }

      try {
        const currentSession =
          s !== undefined ? s : (await supabase.auth.getSession()).data?.session ?? null;

        if (!mountedRef.current) return;

        setSession(currentSession);

        const authUserId = currentSession?.user?.id ?? null;

        if (!authUserId) {
          crmUserLoadedForAuthIdRef.current = null;
          setCrmUser(null);
          setCheckedCrmUser(true);
          setReady(true);
          return;
        }

        /**
         * Evita desmontar/remontar o CRM quando o Supabase apenas renova o token
         * ao voltar o foco da aba ou durante auto refresh da sessão.
         *
         * Se o perfil do mesmo usuário já foi carregado, apenas atualizamos a sessão.
         */
        if (silent && crmUserLoadedForAuthIdRef.current === authUserId) {
          setCheckedCrmUser(true);
          setReady(true);
          return;
        }

        const { data: profile, error } = await supabase
          .from("users")
          .select("id, auth_user_id, role, user_role, is_active")
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        if (error) {
          console.warn("[RequireAuth] users lookup error:", error.message);
        }

        if (!mountedRef.current) return;

        setCrmUser((profile || null) as CrmUserAccess | null);
        crmUserLoadedForAuthIdRef.current = authUserId;
        setCheckedCrmUser(true);
        setReady(true);
      } catch (e: any) {
        console.warn("[RequireAuth] check exception:", e?.message || e);

        if (!mountedRef.current) return;

        setSession(null);
        setCrmUser(null);
        crmUserLoadedForAuthIdRef.current = null;
        setCheckedCrmUser(true);
        setReady(true);
      }
    }

    const t = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setCheckedCrmUser(true);
      setReady(true);
    }, 8000);

    loadSessionAndProfile().finally(() => window.clearTimeout(t));

    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mountedRef.current) return;

      if (event === "TOKEN_REFRESHED") {
        setSession(s ?? null);
        return;
      }

      if (event === "SIGNED_OUT") {
        crmUserLoadedForAuthIdRef.current = null;
        setSession(null);
        setCrmUser(null);
        setCheckedCrmUser(true);
        setReady(true);
        return;
      }

      loadSessionAndProfile(s ?? null, { silent: true });
    });

    unsub = () => data.subscription.unsubscribe();

    return () => {
      mountedRef.current = false;
      window.clearTimeout(t);

      try {
        unsub?.();
      } catch {}
    };
  }, []);

  if (!ready || !checkedCrmUser) {
    return (
      <div className="min-h-dvh p-6 text-sm text-gray-600 flex items-center justify-center">
        Validando acesso…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  /**
   * Regra principal:
   * Supabase Auth também é usado pela Área do Candidato.
   * Portanto, ter sessão ativa não basta para acessar o CRM.
   *
   * Para acessar as rotas internas, o usuário precisa:
   * 1. existir em public.users;
   * 2. estar ativo.
   *
   * Candidato autenticado sem registro em public.users
   * é redirecionado para /area-candidato.
   */
  if (!crmUser?.id || crmUser.is_active === false) {
    return <Navigate to="/area-candidato" replace />;
  }

  const meta = session.user?.user_metadata || {};
  const mustChange =
    meta.must_change_password === true || meta.require_password_change === true;

  if (mustChange && location.pathname !== "/alterar-senha") {
    return <Navigate to="/alterar-senha" replace />;
  }

  return <Outlet />;
}
