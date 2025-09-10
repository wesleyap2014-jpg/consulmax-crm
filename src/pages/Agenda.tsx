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

function fmtDateBR(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function defaultEndFromStart(isoStart: string): string {
  // 30 min padrão
  const start = new Date(isoStart);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return end.toISOString();
}

function whatsappUrlFromPhones(...phones: (string | null | undefined)[]): string | null {
  for (const p of phones) {
    const d = onlyDigits(String(p || ""));
    if (d.length >= 10) {
      const withCountry = d.length === 11 ? `55${d}` : d.startsWith("55") ? d : `55${d}`;
      return `https://wa.me/${withCountry}`;
    }
  }
  return null;
}

function clipboardCopy(text: string) {
  try {
    navigator.clipboard?.writeText(text);
    alert("Copiado para a área de transferência.");
  } catch {
    // fallback tosco
    prompt("Copie o link:", text);
  }
}

/** ====== Página ====== */
export default function AgendaPage() {
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const isAdmin = me?.role === "admin";

  // filtros
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

  // modal de reagendar/excluir
  const [editing, setEditing] = useState<AgendaEvento | null>(null);
  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");

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

  /** Busca eventos */
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
        .lte("inicio_at", new Date(new Date(dateTo).getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000).toISOString()) // até fim do dia
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

  /** Abrir modal de reagendar */
  function openEdit(ev: AgendaEvento) {
    setEditing(ev);
    // formata valor default em inputs tipo datetime-local
    const s = new Date(ev.inicio_at);
    const e = new Date(ev.fim_at || defaultEndFromStart(ev.inicio_at));
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(
        d.getHours()
      ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setEditStart(fmt(s));
    setEditEnd(fmt(e));
  }
  function closeEdit() {
    setEditing(null);
    setEditStart("");
    setEditEnd("");
  }

  /** Salvar reagendamento (somente origem=manual) */
  async function saveReschedule() {
    if (!editing) return;
    if (editing.origem !== "manual") {
      alert("Somente eventos manuais podem ser reagendados aqui.");
      return;
    }
    const startIso = new Date(editStart).toISOString();
    const endIso = new Date(editEnd).toISOString();

    setLoading(true);
    try {
      const { error } = await supabase
        .from("agenda_eventos")
        .update({ inicio_at: startIso, fim_at: endIso })
        .eq("id", editing.id);
      if (error) {
        alert("Não foi possível reagendar: " + error.message);
        return;
      }
      closeEdit();
      await loadEvents(page);
      alert("Evento reagendado!");
    } finally {
      setLoading(false);
    }
  }

  /** Excluir evento (somente manual) */
  async function deleteEvent(ev: AgendaEvento) {
    if (ev.origem !== "manual") {
      alert("Somente eventos manuais podem ser excluídos aqui.");
      return;
    }
    if (!confirm("Tem certeza que deseja excluir este evento?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("agenda_eventos").delete().eq("id", ev.id);
      if (error) {
        alert("Não foi possível excluir: " + error.message);
        return;
      }
      await loadEvents(page);
      alert("Evento excluído.");
    } finally {
      setLoading(false);
    }
  }

  /** Criar evento manual (mínimo viável) */
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTipo, setNewTipo] = useState<AgendaTipo>("reuniao");
  const [newStart, setNewStart] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [newEnd, setNewEnd] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(30, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [newLink, setNewLink] = useState("");

  async function createManual() {
    if (!newTitle.trim()) return alert("Informe o título.");
    const startIso = new Date(newStart).toISOString();
    const endIso = new Date(newEnd).toISOString();

    setLoading(true);
    try {
      // user_id será preenchido automaticamente pelo trigger (se você ativou)
      const { error } = await supabase.from("agenda_eventos").insert([
        {
          tipo: newTipo,
          titulo: newTitle.trim(),
          inicio_at: startIso,
          fim_at: endIso,
          origem: "manual",
          videocall_url: newLink.trim() || null,
        },
      ]);
      if (error) {
        alert("Falha ao criar evento: " + error.message);
        return;
      }
      setCreating(false);
      setNewTitle("");
      setNewLink("");
      await loadEvents(1);
      alert("Evento criado!");
    } finally {
      setLoading(false);
    }
  }

  /** Render */
  const showingFrom = useMemo(() => (total ? (page - 1) * PAGE_SIZE + 1 : 0), [page, total]);
  const showingTo = useMemo(() => Math.min(page * PAGE_SIZE, total || 0), [page, total]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ margin: "16px 0" }}>Agenda</h1>

      {/* Filtros */}
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
            <select
              value={fTipo}
              onChange={(e) => setFTipo(e.target.value as any)}
              style={input}
            >
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
              <select
                value={fUser}
                onChange={(e) => setFUser(e.target.value)}
                style={input}
              >
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

      {/* Criar evento manual */}
      <div style={card}>
        <div style={listHeader}>
          <h3 style={{ margin: 0 }}>Criar evento manual</h3>
          <button
            style={btnSecondary}
            onClick={() => setCreating((v) => !v)}
            disabled={loading}
          >
            {creating ? "Fechar" : "Novo"}
          </button>
        </div>
        {creating && (
          <div style={grid4}>
            <label style={label}>
              Título
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={input}
                placeholder="Ex.: Reunião com cliente"
              />
            </label>
            <label style={label}>
              Tipo
              <select
                value={newTipo}
                onChange={(e) => setNewTipo(e.target.value as AgendaTipo)}
                style={input}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              Início
              <input
                type="datetime-local"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                style={input}
              />
            </label>
            <label style={label}>
              Fim
              <input
                type="datetime-local"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                style={input}
              />
            </label>
            <label style={{ ...label, gridColumn: "1 / span 4" }}>
              Link de vídeo (opcional)
              <input
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                style={input}
                placeholder="https://meet..."
              />
            </label>
            <div style={{ gridColumn: "1 / span 4", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnGhost} onClick={() => setCreating(false)} disabled={loading}>
                Cancelar
              </button>
              <button style={btnPrimary} onClick={createManual} disabled={loading}>
                {loading ? "Criando..." : "Criar"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lista de eventos */}
      <div style={card}>
        <div style={listHeader}>
          <h3 style={{ margin: 0 }}>Eventos</h3>
          <button style={btnSecondary} onClick={() => loadEvents(page)} disabled={loading}>
            Recarregar
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Início</th>
                <th style={th}>Fim</th>
                <th style={th}>Tipo</th>
                <th style={th}>Origem</th>
                <th style={th}>Título</th>
                <th style={th}>Cliente/Lead</th>
                <th style={th}>Responsável</th>
                <th style={{ ...th, width: 260 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const person =
                  e.cliente?.nome ||
                  e.lead?.nome ||
                  "—";
                const phone =
                  e.cliente?.telefone ||
                  e.lead?.telefone ||
                  null;
                const wa = whatsappUrlFromPhones(phone);
                const ownerName = e.owner?.nome || "—";
                const canEdit = e.origem === "manual";
                return (
                  <tr key={e.id}>
                    <td style={td}>{fmtDateTimeBR(e.inicio_at)}</td>
                    <td style={td}>{fmtDateTimeBR(e.fim_at)}</td>
                    <td style={td}>{e.tipo}</td>
                    <td style={td}>{e.origem}</td>
                    <td style={td}>{e.titulo || "—"}</td>
                    <td style={td}>{person}</td>
                    <td style={td}>{ownerName}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {wa ? (
                          <a href={wa} target="_blank" rel="noreferrer" style={btnSecondary}>
                            WhatsApp
                          </a>
                        ) : (
                          <button style={{ ...btnSecondary, opacity: 0.5 }} disabled>
                            WhatsApp
                          </button>
                        )}

                        {e.videocall_url ? (
                          <>
                            <a
                              href={e.videocall_url}
                              target="_blank"
                              rel="noreferrer"
                              style={btnSecondary}
                            >
                              Abrir link
                            </a>
                            <button
                              style={btnSecondary}
                              onClick={() => clipboardCopy(e.videocall_url!)}
                            >
                              Copiar link
                            </button>
                          </>
                        ) : (
                          <button style={{ ...btnSecondary, opacity: 0.5 }} disabled>
                            Sem link
                          </button>
                        )}

                        <button
                          style={{ ...btnSecondary, opacity: canEdit ? 1 : 0.5 }}
                          disabled={!canEdit || loading}
                          onClick={() => openEdit(e)}
                        >
                          Reagendar
                        </button>
                        <button
                          style={{ ...btnGhost, opacity: canEdit ? 1 : 0.5 }}
                          disabled={!canEdit || loading}
                          onClick={() => deleteEvent(e)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 && (
                <tr>
                  <td style={td} colSpan={8}>
                    {loading ? "Carregando..." : "Nenhum evento encontrado para os filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Reagendar */}
      {editing && (
        <>
          <div style={backdrop} onClick={closeEdit} />
          <div role="dialog" aria-modal="true" style={modal}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Reagendar evento</h3>
            <div style={grid2}>
              <label style={label}>
                Início
                <input
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  style={input}
                />
              </label>
              <label style={label}>
                Fim
                <input
                  type="datetime-local"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  style={input}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button style={btnGhost} onClick={closeEdit} disabled={loading}>
                Cancelar
              </button>
              <button style={btnPrimary} onClick={saveReschedule} disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** ====== Estilos inline (compatível com Leads/Usuários) ====== */
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  marginBottom: 16,
};
const cardTitle: React.CSSProperties = { margin: "0 0 12px 0" };

const grid2: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(2, minmax(0,1fr))",
};
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
};
const td: React.CSSProperties = {
  padding: "10px 8px",
  borderTop: "1px solid #eee",
  verticalAlign: "middle",
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
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
const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  fontWeight: 600,
  cursor: "pointer",
};
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  zIndex: 40,
};
const modal: React.CSSProperties = {
  position: "fixed",
  zIndex: 50,
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(560px, 92vw)",
  background: "#fff",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 12px 48px rgba(0,0,0,0.22)",
};
