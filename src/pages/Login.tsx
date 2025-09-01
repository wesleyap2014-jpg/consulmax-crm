// src/pages/Login.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
// use o mesmo client que você usa no RequireAuth:
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPwd] = useState("");
  const [loading, setLoading] = useState(false);

  // Se já estiver logado, manda para home
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/", { replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      alert("Informe e-mail e senha.");
      return;
    }
    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password,
      });

      if (error) {
        // Mensagens mais claras para os casos comuns
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("email not confirmed")) {
          alert("E-mail não confirmado. Peça para o admin recriar o usuário com e-mail confirmado.");
        } else if (msg.includes("invalid login credentials")) {
          alert("Credenciais inválidas. Verifique e-mail e senha.");
        } else {
          alert("Falha no login: " + error.message);
        }
        return;
      }

      const user = data?.user;
      const mustChange =
        user?.user_metadata?.must_change_password === true ||
        user?.user_metadata?.require_password_change === true;

      // Redireciona conforme a flag
      if (mustChange) {
        navigate("/alterar-senha", { replace: true });
      } else {
        navigate("/", { replace: true }); // o router manda para /leads
      }
    } catch (err: any) {
      alert("Erro inesperado no login: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Entrar</h1>
        <p style={{ color: "#64748b", marginTop: 6, marginBottom: 16 }}>
          Use seu e-mail e a senha provisória (ou definitiva).
        </p>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
          <input
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPwd(e.target.value)}
            style={styles.input}
            autoComplete="current-password"
          />
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f6f7f9",
    padding: 16,
    fontFamily: "Inter, system-ui, Arial",
    color: "#1f2937",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    background: "#fff",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  input: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    outline: "none",
    fontSize: 14,
  },
  button: {
    padding: "12px 14px",
    borderRadius: 10,
    background: "#A11C27",
    color: "#fff",
    border: 0,
    cursor: "pointer",
    fontWeight: 700,
  },
};
