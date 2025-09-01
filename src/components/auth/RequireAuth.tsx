// src/components/auth/RequireAuth.tsx
import { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

export default function RequireAuth() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof supabase.auth.getSession>
  >["data"]["session"] | null>(null);

  const location = useLocation();

  useEffect(() => {
    let unsub: (() => void) | undefined;

    // 1) pega sessão atual
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setReady(true);
    });

    // 2) reage a mudanças de auth (login/logout)
    const { data } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s ?? null);
      setReady(true);
    });

    unsub = () => data.subscription.unsubscribe();
    return () => unsub?.();
  }, []);

  // Enquanto verifica => evita tela branca
  if (!ready) {
    return (
      <div style={{ padding: 24, fontFamily: "Inter, system-ui, Arial" }}>
        Carregando…
      </div>
    );
  }

  // Não logado => volta pro login
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Logado, mas precisa trocar a senha => manda pra /alterar-senha
  const needsPwd =
    session.user?.user_metadata?.must_change_password === true;
  if (needsPwd && location.pathname !== "/alterar-senha") {
    return <Navigate to="/alterar-senha" replace />;
  }

  // Autorizado => renderiza as rotas filhas
  return <Outlet />;
}
