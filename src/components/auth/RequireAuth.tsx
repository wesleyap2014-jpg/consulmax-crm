// src/components/auth/RequireAuth.tsx
import { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export default function RequireAuth() {
  const location = useLocation();

  // Controla carregamento e sessão
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    // 1) Busca sessão atual (evita flash/tela em branco)
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn("[RequireAuth] getSession error:", error.message);
        }
        setSession(data?.session ?? null);
      })
      .finally(() => setReady(true));

    // 2) Observa mudanças de autenticação (login/logout/refresh)
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      setReady(true);
    });
    unsub = () => data.subscription.unsubscribe();

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, []);

  // Loading “seguro”
  if (!ready) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Carregando…
      </div>
    );
  }

  // Sem sessão -> mandar para login, preservando a rota atual
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Checagem de flags para troca de senha
  const meta = session.user?.user_metadata || {};
  const mustChange =
    meta.must_change_password === true ||
    meta.require_password_change === true;

  // Redireciona para "Alterar Senha" se necessário (evita loop quando já está lá)
  if (mustChange && location.pathname !== "/alterar-senha") {
    return <Navigate to="/alterar-senha" replace />;
  }

  // Autenticado e ok
  return <Outlet />;
}
