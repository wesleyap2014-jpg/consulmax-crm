// src/pages/Agenda.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ====== Tipos ====== */
type AgendaTipo = "aniversario" | "contato" | "assembleia" | "reuniao" | "visita" | "outro";
type AgendaOrigem = "auto" | "manual";

type AgendaEvento = {
  id: string;
  tipo: AgendaTipo;
  titulo: string | null;
  cliente_id: string | null;
  lead_id: string | null;
  user_id: string | null;
  inicio_at: string;   // timestamptz
  fim_at: string | null;
  videocall_url: string | null;
  origem: AgendaOrigem;
  relacao_id: string | null;
  created_at: string | null;
  updated_at: string | null;

  // joins
  cliente?: { id: string; nome: string | null; telefone: string | null } | null;
  lead?: { id: string; nome: string | null; telefone: string | null } | null;
  owner?: { id: string; auth_user_id: string; nome: string | null; role: string | null } | null;

  // (para assembleias) – título já vem “Assembleia do grupo 1234”
  grupo?: { codigo?: number | null } | null;
};

type UserProfile = {
  id: string;
  auth_user_id: string;
  nome: string | null;
  role: "admin" | "vendedor" | "viewer" | string | null;
};

const PAGE_SIZE = 20;
const TIPOS: AgendaTipo[] = ["aniversario", "contato", "assembleia", "reuniao", "visita", "outro"];
const ORIGENS: AgendaOrigem[] = ["auto", "manual"];

/** ====== Helpers ====== */
const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateTimeBR(iso?: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clipboardCopy(text: string) {
  try {
    navigator.clipboard?.writeText(text);
    alert("Mensagem copiada. Cole no WhatsApp e envie ao cliente. 📋");
  } catch {
    // fallback simples
    prompt("Copie a mensagem abaixo:", text);
  }
}

function firstName(full?: string | null): string {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  if (!parts.length) return "";
  const name = parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function buildBdayMessage(name?: string | null): string {
  const fname = firstName(name) || "Olá";
  return (
`${fname}, 🎉 *Feliz Aniversário!* 🎉

Hoje celebramos mais um capítulo da sua história, cheio de conquistas, aprendizados e sonhos que se renovam.
Que este novo ciclo seja repleto de *prosperidade, saúde e realizações* — e que cada meta se transforme em vitória.

Na *Consulmax*, acreditamos que planejar é o caminho para conquistar. Que você continue sonhando grande e realizando cada vez mais! ✨

Um brinde ao seu futuro e a todas as conquistas que estão por vir.
🥂 Parabéns pelo seu dia!`
  );
}

function waUrlWithMessage(rawPhone?: string | null, message?: string): string | null {
  const d = onlyDigits(String(rawPhone || ""));
  if (!d) return null;
  const phone = d.startsWith("55") ? d : `55${d}`;
  const text = encodeURIComponent(message || "");
  return `https://wa.me/${phone}?text=${text}`;
}

/** ====== Página ====== */
export default function AgendaPage() {
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const isAdmin = me?.role === "admin";

  // filtros gerais (lista principal)
  const today = useMemo(() => new Date(), []);
  const weekAhead = useMemo(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), []);
  const [dateFrom, setDateFrom] = useState<string>(() => toISODate(today));
  const [dateTo, setDateTo] = useState<string>(() => toISODate(weekAhead));
  const [fTipo, setFTipo] = useState<"" | AgendaTipo>("");
  const [fOrigem, setFOrigem] = useState<"" | AgendaOrigem>("");
  const [fUser, setFUser] = useState<string>(""); // users.id

  // dados
  const [events, setEvents] = useState<AgendaEvento[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // paginação
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number>(0);
  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)), [total]);

  // blocos de cartões
  const [birthdays, setBirthdays] = useState<AgendaEvento[]>([]);
  const [assemblies, setAssemblies] = useState<
    { id: string; quando: string; titulo: string }[]
  >([]);

  /** Carrega usuário atual */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";
      if (user) setMe({ id: user.id, role });
    })();
  }, []);

  /** Carrega usuários (para filtro, se admin) */
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id,auth_user_id,nome,role")
        .order("nome", { ascending: true });
      if (!error) setUsers((data || []) as any);
    })();
  }, [isAdmin]);

  /** Busca eventos (tabela principal com filtros) */
  async function loadEvents(targetPage = 1) {
    if (!dateFrom || !dateTo) {
      alert("Informe período (início e fim).");
      return;
    }

    setLoading(true);
    try {
      const from = (targetPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("agenda_eventos")
        .select(
          `
          id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,origem,relacao_id,created_at,updated_at,
          cliente:clientes!agenda_eventos_cliente_id_fkey (id,nome,telefone),
          lead:leads!agenda_eventos_lead_id_fkey (id,nome,telefone),
          owner:users!agenda_eventos_user_id_fkey (id,auth_user_id,nome,role)
        `,
          { count: "exact" }
        )
        .gte("inicio_at", new Date(dateFrom).toISOString())
        .lte(
          "inicio_at",
          new Date(new Date(dateTo).getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000).toISOString()
        )
        .order("inicio_at", { ascending: true });

      if (fTipo) query = query.eq("tipo", fTipo);
      if (fOrigem) query = query.eq("origem", fOrigem);
      if (isAdmin && fUser) query = query.eq("user_id", fUser);

      const { data, error, count } = await query.range(from, to);
      if (error) {
        alert("Erro ao carregar agenda: " + error.message);
        return;
      }
      setEvents((data || []) as any);
      setTotal(count || 0);
      setPage(targetPage);
    } finally {
      setLoading(false);
    }
  }

  /** Entradas: carrega já na abertura */
  useEffect(() => {
    loadEvents(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  /** Recarrega ao trocar filtros */
  useEffect(() => {
    loadEvents(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, fTipo, fOrigem, fUser]);

  /** ====== Cartões: Aniversários (próximos) ====== */
  useEffect(() => {
    (async () => {
      // próximos 120 dias
      const { data, error } = await supabase
        .from("agenda_eventos")
        .select(
          `
          id,tipo,titulo,inicio_at,cliente:clientes!agenda_eventos_cliente_id_fkey (id,nome,telefone)
        `
        )
        .eq("tipo", "aniversario")
        .gte("inicio_at", new Date().toISOString())
        .lte("inicio_at", new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString())
        .order("inicio_at", { ascending: true });
      if (!error) setBirthdays((data || []) as any);
    })();
  }, []);

  /** ====== Cartões: Assembleias (próximas) ====== */
  async function refreshAssembliesCard() {
    // próximos 120 dias
    const { data, error } = await supabase
      .from("agenda_eventos")
      .select(
        `
        id, inicio_at, titulo, tipo, relacao_id
      `
      )
      .eq("tipo", "assembleia")
      .gte("inicio_at", new Date().toISOString())
      .lte("inicio_at", new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString())
      .order("inicio_at", { ascending: true });

    if (error) {
      alert("Erro ao carregar assembleias: " + error.message);
      return;
    }

    // Ajuste do título para mostrar apenas o número do grupo (public.groups.codigo),
    // caso o backend já tenha atualizado os títulos, esse mapping aqui apenas mantém o formato.
    const rows = (data || []).map((r: any) => {
      // Se o título vier no padrão "Assembleia do grupo 1234", mantemos. Caso contrário, exibe o título.
      const match = /grupo\s+(\d+)/i.exec(r.titulo || "");
      const titulo = match ? `Assembleia do grupo ${match[1]}` : r.titulo || "Assembleia";
      return {
        id: r.id,
        quando: r.inicio_at,
        titulo,
      };
    });

    setAssemblies(rows);
  }

  useEffect(() => {
    refreshAssembliesCard();
  }, []);

  /** Render */
  const showingFrom = useMemo(() => (total ? (page - 1) * PAGE_SIZE + 1 : 0), [page, total]);
  const showingTo = useMemo(() => Math.min(page * PAGE_SIZE, total || 0), [page, total]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ margin: "16px 0" }}>Agenda</h1>

      {/* Cartões no topo */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        {/* Aniversários */}
        <div style={card}>
          <div style={listHeader}>
            <h3 style={{ margin: 0 }}>Aniversários (próximos)</h3>
            {/* (campo de busca foi mantido visualmente, mas sem botão WhatsApp extra) */}
            <input
              placeholder="Buscar título/nome..."
              style={{ ...input, width: 260 }}
              onChange={() => {}}
            />
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Quando</th>
                  <th style={th}>Cliente</th>
                  <th style={{ ...th, width: 180 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {birthdays.map((b) => {
                  const nome = b?.cliente?.nome || "Cliente";
                  const when = fmtDateTimeBR(b.inicio_at);
                  const message = buildBdayMessage(nome);
                  const wa = waUrlWithMessage(b?.cliente?.telefone, message);

                  return (
                    <tr key={b.id}>
                      <td style={td}>{when}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{nome}</div>
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            style={btnPrimary}
                            onClick={() => {
                              if (wa) {
                                window.open(wa, "_blank", "noopener,noreferrer");
                              } else {
                                clipboardCopy(message);
                              }
                            }}
                          >
                            Parabenizar 🎉
                          </button>
                          {/* ⚠️ WhatsApp (botão separado) removido conforme solicitado */}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {birthdays.length === 0 && (
                  <tr>
                    <td style={td} colSpan={3}>
                      Nenhum aniversário nos próximos dias.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assembleias (próximas) */}
        <div style={card}>
          <div style={listHeader}>
            <h3 style={{ margin: 0 }}>Assembleias (próximas)</h3>
            <button style={btnSecondary} onClick={refreshAssembliesCard}>
              Atualizar
            </button>
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Quando</th>
                  <th style={th}>Título/Grupo</th>
                  {/* Coluna Ações removida */}
                </tr>
              </thead>
              <tbody>
                {assemblies.map((a) => (
                  <tr key={a.id}>
                    <td style={td}>{fmtDateTimeBR(a.quando)}</td>
                    <td style={td}>{a.titulo}</td>
                  </tr>
                ))}
                {assemblies.length === 0 && (
                  <tr>
                    <td style={td} colSpan={2}>
                      Nenhuma assembleia próxima.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ====== Filtros / Lista principal (mantida) ====== */}
      <div style={card}>
        <h3 style={cardTitle}>Filtros</h3>
        <div style={grid4}>
          <label style={label}>
            De
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={input}
            />
          </label>
          <label style={label}>
            Até
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={input}
            />
          </label>
          <label style={label}>
            Tipo
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value as any)} style={input}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label style={label}>
            Origem
            <select
              value={fOrigem}
              onChange={(e) => setFOrigem(e.target.value as any)}
              style={input}
            >
              <option value="">Todas</option>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          {isAdmin && (
            <label style={label}>
              Usuário
              <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={input}>
                <option value="">Equipe toda</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome || u.id} ({(u.role || "").toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <small style={{ color: "#64748b" }}>
            {total > 0 ? `Mostrando ${showingFrom}-${showingTo} de ${total}` : "Nenhum evento"}
          </small>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...btnSecondary, opacity: page <= 1 ? 0.6 : 1 }}
              disabled={page <= 1 || loading}
              onClick={() => loadEvents(page - 1)}
            >
              ‹ Anterior
            </button>
            <span style={{ fontSize: 12, color: "#475569", alignSelf: "center" }}>
              Página {page} de {totalPages}
            </span>
            <button
              style={{ ...btnSecondary, opacity: page >= totalPages ? 0.6 : 1 }}
              disabled={page >= totalPages || loading}
              onClick={() => loadEvents(page + 1)}
            >
              Próxima ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ====== Estilos inline ====== */
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  marginBottom: 16,
};
const cardTitle: React.CSSProperties = { margin: "0 0 12px 0" };

const grid4: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(4, minmax(0,1fr))",
  alignItems: "center",
};
const listHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};
const input: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
  background: "#fff",
};
const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "#334155",
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: "#475569",
  padding: "10px 8px",
  position: "sticky",
  top: 0,
  background: "#fff",
};
const td: React.CSSProperties = {
  padding: "10px 8px",
  borderTop: "1px solid #eee",
  verticalAlign: "middle",
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#A11C27",
  color: "#fff",
  border: 0,
  fontWeight: 700,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#f1f5f9",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  fontWeight: 600,
  cursor: "pointer",
};
