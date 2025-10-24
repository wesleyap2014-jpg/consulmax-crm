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

  // --- Recuperação de senha (modal) ---
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

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

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail) return;

    try {
      setForgotLoading(true);
      setForgotMsg(null);

      const { error } = await supabase.auth.resetPasswordForEmail(
        forgotEmail.trim().toLowerCase(),
        {
          // temos a página AlterarSenha.tsx
          redirectTo: `${window.location.origin}/alterar-senha`,
        }
      );

      if (error) {
        setForgotMsg(error.message);
      } else {
        setForgotMsg("Enviamos um e-mail com o link para redefinir a senha.");
      }
    } catch (err: any) {
      setForgotMsg(err?.message || String(err));
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      {/* Marca d’água no fundo */}
      <img
        src="/logo-consulmax.png"
        alt=""
        aria-hidden
        style={styles.bgMark}
      />

      <div style={styles.card}>
        {/* Logo pequena no topo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <img src="/logo-consulmax.png" alt="Consulmax Consórcios" style={{ height: 34 }} />
        </div>

        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, textAlign: "center" }}>Entrar</h1>
        <p style={{ color: "#64748b", marginTop: 6, marginBottom: 16, textAlign: "center" }}>
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

          <div style={styles.rowBetween}>
            <button
              type="button"
              onClick={() => {
                setForgotEmail(email);
                setForgotOpen(true);
                setForgotMsg(null);
              }}
              style={styles.linkButton}
            >
              Esqueci minha senha
            </button>
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p style={styles.footerBrand}>Consulmax • Maximize as suas conquistas.</p>
      </div>

      {/* Modal simples (sem libs) */}
      {forgotOpen && (
        <div style={styles.modalBackdrop} onClick={() => setForgotOpen(false)}>
          <div
            style={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Recuperar senha</h2>
              <button onClick={() => setForgotOpen(false)} style={styles.closeX} aria-label="Fechar">×</button>
            </div>

            <form onSubmit={handleForgotSubmit} style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <label style={styles.label} htmlFor="forgotEmail">E-mail</label>
              <input
                id="forgotEmail"
                type="email"
                placeholder="voce@consulmax.com.br"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                style={styles.input}
              />

              {forgotMsg ? (
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>{forgotMsg}</p>
              ) : null}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                <button type="button" onClick={() => setForgotOpen(false)} style={styles.buttonGhost}>
                  Fechar
                </button>
                <button type="submit" disabled={forgotLoading || !forgotEmail} style={styles.button}>
                  {forgotLoading ? "Enviando..." : "Enviar link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: "relative",
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f6f7f9",
    padding: 16,
    fontFamily: "Inter, system-ui, Arial",
    color: "#1f2937",
    overflow: "hidden",
  },
  bgMark: {
    position: "absolute",
    inset: 0,
    margin: "auto",
    width: "min(72vw, 720px)",
    height: "auto",
    opacity: 0.06,
    filter: "grayscale(100%)",
    pointerEvents: "none",
    userSelect: "none" as any,
  },
  card: {
    width: "100%",
    maxWidth: 420,
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
  buttonGhost: {
    padding: "12px 14px",
    borderRadius: 10,
    background: "#fff",
    color: "#1f2937",
    border: "1px solid #e5e7eb",
    cursor: "pointer",
    fontWeight: 600,
  },
  rowBetween: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 2,
  },
  linkButton: {
    background: "transparent",
    border: "none",
    padding: 0,
    color: "#A11C27",
    cursor: "pointer",
    fontSize: 13,
    textDecoration: "underline",
  },
  footerBrand: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 12,
    color: "#9aa3af",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 12,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  },
  label: {
    fontSize: 13,
    color: "#374151",
    fontWeight: 600,
  },
  closeX: {
    border: "none",
    background: "transparent",
    fontSize: 22,
    lineHeight: 1,
    cursor: "pointer",
    color: "#6b7280",
  },
};
