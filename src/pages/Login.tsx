// src/pages/Login.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

type Mode = "login" | "reset";

export default function Login() {
  const navigate = useNavigate();

  // ====== estado comum ======
  const [mode, setMode] = useState<Mode>("login");
  const [loadingScreen, setLoadingScreen] = useState(true); // loading de boot (detecta code/session)

  // ====== login form ======
  const [email, setEmail] = useState("");
  const [password, setPwd] = useState("");
  const [loading, setLoading] = useState(false);

  // ====== forgot modal ======
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

  // ====== reset form ======
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // ========= BOOTSTRAP =========
  useEffect(() => {
    let mounted = true;
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code"); // fluxo PKCE: .../login?code=...

    (async () => {
      try {
        // 1) Se veio ?code=, troca por sessão e vai para modo reset
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.warn("exchangeCodeForSession error:", error.message);
            if (mounted) {
              setMode("login");
              setLoadingScreen(false);
            }
            return;
          }
          if (mounted) {
            setMode("reset");
            setLoadingScreen(false);
          }
          return;
        }

        // 2) Já tem sessão? (pode ser retorno via #access_token= também)
        const { data } = await supabase.auth.getSession();

        // Se a sessão veio de um link de recuperação, alguns provedores
        // disparam o evento PASSWORD_RECOVERY.
        const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
          if (evt === "PASSWORD_RECOVERY") {
            if (mounted) {
              setMode("reset");
              setLoadingScreen(false);
            }
          }
        });

        // Se já logado e não está em reset, manda pra home
        if (data.session && mode !== "reset") {
          // checa metadados must_change_password
          const mustChange =
            data.session.user?.user_metadata?.must_change_password === true ||
            data.session.user?.user_metadata?.require_password_change === true;

          if (mustChange) {
            if (mounted) setMode("reset");
          } else {
            navigate("/", { replace: true });
          }
        }

        if (mounted) setLoadingScreen(false);

        return () => {
          sub.subscription.unsubscribe();
        };
      } catch (err) {
        console.warn(err);
        if (mounted) setLoadingScreen(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // ========= AÇÕES =========
  async function onSubmitLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      alert("Informe e-mail e senha.");
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
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

      if (mustChange) {
        setMode("reset");
      } else {
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      alert("Erro inesperado no login: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail) return;

    try {
      setForgotLoading(true);
      setForgotMsg(null);
      // Redireciona de volta para /login. O componente detecta e entra no modo reset.
      const { error } = await supabase.auth.resetPasswordForEmail(
        forgotEmail.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/login` }
      );
      if (error) setForgotMsg(error.message);
      else setForgotMsg("Enviamos um e-mail com o link para redefinir a senha.");
    } catch (err: any) {
      setForgotMsg(err?.message || String(err));
    } finally {
      setForgotLoading(false);
    }
  }

  async function onSubmitReset(e: React.FormEvent) {
    e.preventDefault();
    setResetMsg(null);

    if (!newPwd || newPwd.length < 8) {
      setResetMsg("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPwd !== newPwd2) {
      setResetMsg("As senhas não coincidem.");
      return;
    }

    try {
      setResetLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) {
        setResetMsg(error.message);
        return;
      }
      setResetMsg("Senha atualizada com sucesso! Redirecionando…");
      setTimeout(() => navigate("/", { replace: true }), 900);
    } catch (err: any) {
      setResetMsg(err?.message || String(err));
    } finally {
      setResetLoading(false);
    }
  }

  // ========= UI =========
  if (loadingScreen) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          Carregando…
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* blobs (liquid glass) */}
      <div style={styles.blobA} aria-hidden />
      <div style={styles.blobB} aria-hidden />

      <div style={styles.card}>
        {/* Logo topo (maior) */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <img src="/logo-consulmax.png" alt="Consulmax Consórcios" style={{ height: 44 }} />
        </div>

        {mode === "login" ? (
          <>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, textAlign: "center" }}>Entrar</h1>
            <p style={{ color: "#64748b", marginTop: 6, marginBottom: 16, textAlign: "center" }}>
              Use seu e-mail e a senha provisória (ou definitiva).
            </p>

            <form onSubmit={onSubmitLogin} style={{ display: "grid", gap: 10 }}>
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

              <button
                type="submit"
                disabled={loading}
                style={{ ...styles.button, ...(loading ? { opacity: 0.85, cursor: "default" } : {}) }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#8f1923")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#A11C27")}
                onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <p style={styles.footerBrand}>Consulmax • Maximize as suas conquistas.</p>
          </>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, textAlign: "center" }}>
              Defina sua nova senha
            </h1>
            <p style={{ color: "#64748b", marginTop: 6, marginBottom: 16, textAlign: "center" }}>
              Escolha uma senha forte para proteger sua conta.
            </p>

            <form onSubmit={onSubmitReset} style={{ display: "grid", gap: 10 }}>
              <input
                type="password"
                placeholder="Nova senha (mín. 8 caracteres)"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                style={styles.input}
              />
              <input
                type="password"
                placeholder="Confirmar nova senha"
                value={newPwd2}
                onChange={(e) => setNewPwd2(e.target.value)}
                style={styles.input}
              />

              {resetMsg ? (
                <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>{resetMsg}</p>
              ) : null}

              <button
                type="submit"
                disabled={resetLoading}
                style={{ ...styles.button, ...(resetLoading ? { opacity: 0.85, cursor: "default" } : {}) }}
              >
                {resetLoading ? "Atualizando..." : "Atualizar senha"}
              </button>

              <button
                type="button"
                style={styles.buttonGhost}
                onClick={() => setMode("login")}
              >
                Voltar para login
              </button>
            </form>
          </>
        )}
      </div>

      {/* Modal "Esqueci minha senha" */}
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
              <button onClick={() => setForgotOpen(false)} style={styles.closeX} aria-label="Fechar">
                ×
              </button>
            </div>

            <form onSubmit={onSubmitForgot} style={{ marginTop: 14, display: "grid", gap: 10 }}>
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
    background:
      "radial-gradient(1200px 600px at 20% -10%, rgba(161,28,39,0.08), transparent 60%)," +
      "radial-gradient(1000px 600px at 120% 110%, rgba(30,41,63,0.10), transparent 60%)," +
      "#f6f7f9",
    padding: 16,
    fontFamily: "Inter, system-ui, Arial",
    color: "#1f2937",
    overflow: "hidden",
  },
  blobA: {
    position: "absolute",
    width: 520,
    height: 520,
    top: -140,
    left: -100,
    background: "radial-gradient(50% 50% at 50% 50%, rgba(161,28,39,0.20), transparent 60%)",
    filter: "blur(40px)",
    opacity: 0.6,
    pointerEvents: "none",
  },
  blobB: {
    position: "absolute",
    width: 520,
    height: 520,
    bottom: -160,
    right: -120,
    background: "radial-gradient(50% 50% at 50% 50%, rgba(30,41,63,0.22), transparent 60%)",
    filter: "blur(46px)",
    opacity: 0.55,
    pointerEvents: "none",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "rgba(255,255,255,0.85)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 20px 60px rgba(0,0,0,0.10)",
    backdropFilter: "saturate(140%) blur(6px)",
    WebkitBackdropFilter: "saturate(140%) blur(6px)",
    border: "1px solid rgba(255,255,255,0.6)",
  },
  input: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    outline: "none",
    fontSize: 14,
    background: "rgba(255,255,255,0.9)",
  },
  button: {
    padding: "12px 14px",
    borderRadius: 10,
    background: "#A11C27",
    color: "#fff",
    border: 0,
    cursor: "pointer",
    fontWeight: 700,
    transition: "background 120ms ease, transform 60ms ease",
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
