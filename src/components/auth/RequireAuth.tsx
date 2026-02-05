// src/components/auth/RequireAuth.tsx
import { useEffect, useRef, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export default function RequireAuth() {
  const location = useLocation();

  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let unsub: (() => void) | undefined;

    // Timeout de segurança: não deixa travar "Carregando…" para sempre
    const t = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setReady(true);
    }, 8000);

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) console.warn("[RequireAuth] getSession error:", error.message);
        if (!mountedRef.current) return;
        setSession(data?.session ?? null);
      })
      .catch((e) => {
        console.warn("[RequireAuth] getSession exception:", e?.message || e);
      })
      .finally(() => {
        if (!mountedRef.current) return;
        setReady(true);
        window.clearTimeout(t);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mountedRef.current) return;
      setSession(s ?? null);
      setReady(true);
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

  if (!ready) {
    return (
      <div className="min-h-dvh p-6 text-sm text-gray-600 flex items-center justify-center">
        Carregando…
      </div>
    );
  }

  // Se não tem sessão -> vai pro login preservando a rota atual
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Checagem de flags para troca de senha
  const meta = session.user?.user_metadata || {};
  const mustChange =
    meta.must_change_password === true || meta.require_password_change === true;

  if (mustChange && location.pathname !== "/alterar-senha") {
    return <Navigate to="/alterar-senha" replace />;
  }

  return <Outlet />;
}
