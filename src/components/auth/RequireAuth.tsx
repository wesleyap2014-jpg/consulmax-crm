// src/components/auth/RequireAuth.tsx
import { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient"; // ajuste o caminho se o seu client for outro

export default function RequireAuth() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof supabase.auth.getSession>
  >["data"]["session"] | null>(null);

  const location = useLocation();

  useEffect(() => {
    let unsub: (() => void) | undefined;

    // 1) Sessão atual
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setReady(true);
    });

    // 2) Mudanças de auth (login/logout)
    const { data } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s ?? null);
      setReady(true);
    });

    unsub = () => data.subscription.unsubscribe();
    return () => unsub?.();
  }, []);

  // Loading "seguro" (evita tela branca)
  if (!ready) {
    return (
      <div style={{ padding: 24, fontFamily: "Inter, system-ui, Arial" }}>
        Carregando…
      </div>
    );
  }

  // Não logado → login
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Flags que pedem troca de senha (considera os dois nomes)
  const meta = session.user?.user_metadata || {};
  const needsChange =
    meta.must_change_password === true ||
    meta.require_password_change === true;

  // Só redireciona se AINDA precisa trocar e NÃO estamos já na página de troca
  if (needsChange && location.pathname !== "/alterar-senha") {
    return <Navigate to="/alterar-senha" replace />;
  }

  // Se as flags já foram limpas pela tela AlterarSenha, libera o app normalmente
  return <Outlet />;
}
