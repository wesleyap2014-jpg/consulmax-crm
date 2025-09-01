// src/components/auth/RequireAuth.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase"; // troque se seu compat for "@/lib/supabaseClient"

type Props = { children: React.ReactNode };

export default function RequireAuth({ children }: Props) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Checagem inicial
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      const must = user.user_metadata?.must_change_password === true;
      if (must && location.pathname !== "/alterar-senha") {
        navigate("/alterar-senha", { replace: true });
        return;
      }
      setReady(true);
    });

    // Ouve mudanças de auth
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const user = session?.user;
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      const must = user.user_metadata?.must_change_password === true;
      if (must && location.pathname !== "/alterar-senha") {
        navigate("/alterar-senha", { replace: true });
        return;
      }
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!ready) return null; // ou um skeleton/spinner
  return <>{children}</>;
}
