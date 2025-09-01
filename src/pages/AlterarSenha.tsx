// src/pages/AlterarSenha.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // se precisar, troque para "@/lib/supabaseClient"

// Caminho para onde enviar após trocar a senha
const LOGIN_PATH = "/login"; // ajuste se seu login for outra rota

export default function AlterarSenha() {
  const [email, setEmail] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Busca o usuário logado para exibir o e-mail
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const userEmail = data.user?.email || "";
      setEmail(userEmail);
    })();
  }, []);

  function validatePassword(pwd: string): string | null {
    if (!pwd || pwd.length < 8) {
      return "A senha deve ter pelo menos 8 caracteres.";
    }
    if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      return "A senha deve conter letras e números.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const problem = validatePassword(newPassword);
    if (problem) {
      alert(problem);
      return;
    }
    if (newPassword !== confirm) {
      alert("A confirmação não confere.");
      return;
    }

    try {
      setLoading(true);

      // Atualiza a senha do usuário autenticado
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        alert(`Falha ao alterar a senha: ${error.message}`);
        return;
      }

      alert("Senha alterada com sucesso! Você precisará entrar novamente.");

      // Termina a sessão atual e leva ao login
      await supabase.auth.signOut();
      window.location.href = LOGIN_PATH;
    } catch (err: any) {
      alert(`Erro inesperado: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  // Se não houver usuário, orienta a logar
  const noUser = !email;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Alterar senha</h1>

        {noUser ? (
          <p style={styles.muted}>
            Você não está autenticado. Faça login para alterar a senha.
          </p>
        ) : (
          <>
            <p style={styles.muted}>
              Usuário logado: <b>{email}</b>
            </p>

            <form onSubmit={handleSubmit} style={styles.form}>
              <input
                type="password"
                placeholder="Nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={styles.input}
                autoComplete="new-password"
              />
              <input
                type="password"
                placeholder="Confirmar nova senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={styles.input}
                autoComplete="new-password"
              />

              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>

            <ul style={styles.hint}>
              <li>Mínimo de 8 caracteres.</li>
              <li>Deve conter letras e números.</li>
              <li>Após salvar, você fará login novamente.</li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// --- estilos simples inline ---
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
    maxWidth: 420,
    background: "#fff",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  title: { margin: "0 0 12px", fontSize: 22, fontWeight: 800 },
  muted: { color: "#64748b", margin: "0 0 16px" },
  form: { display: "grid", gap: 10 },
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
  hint: { marginTop: 12, color: "#64748b", fontSize: 13, lineHeight: 1.5 },
};
