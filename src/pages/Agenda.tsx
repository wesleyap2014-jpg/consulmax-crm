// src/pages/Agenda.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { waLink, toYMD, dayISO, fmtDateTime } from "@/lib/br";

// ===== Tipos =====
type AgendaTipo = "aniversario" | "contato" | "assembleia" | "reuniao" | "visita" | "outro";
type Origem = "auto" | "manual";

type AgendaBase = {
  id: string;
  tipo: AgendaTipo;
  origem: Origem;
  titulo: string | null;
  inicio_at: string;   // timestamptz
  fim_at: string | null;
  user_id: string | null;
  cliente_id: string | null;
  lead_id: string | null;
  videocall_url: string | null;
};

type AgendaEnriquecida = AgendaBase & {
  cliente_nome?: string | null;
  lead_nome?: string | null;
  telefone?: string | null; // preferencial (cliente.telefone ou lead.telefone)
};

type UserRow = { auth_user_id: string; nome: string; role: "admin" | "vendedor" | "viewer" | "operacoes" };

const TIPO_LABEL: Record<AgendaTipo, string> = {
  aniversario: "Aniversário",
  contato: "Próx. contato",
  assembleia: "Assembleia",
  reuniao: "Reunião",
  visita: "Visita",
  outro: "Outro",
};

function useDebounce<T>(val: T, ms = 300) {
  const [v, setV] = useState(val);
  useEffect(() => { const t = setTimeout(() => setV(val), ms); return () => clearTimeout(t); }, [val, ms]);
  return v;
}

export default function AgendaPage() {
  // período padrão: hoje → +6 dias
  const [dateFrom, setDateFrom] = useState(toYMD(new Date()));
  const [dateTo, setDateTo] = useState(toYMD(new Date(Date.now() + 6 * 24 * 3600e3)));

  const [tipo, setTipo] = useState<AgendaTipo | "">("");
  const [userId, setUserId] = useState<string>(""); // gestor pode filtrar
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);

  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AgendaEnriquecida[]>([]);

  // criação/edição
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<AgendaBase>>({
    tipo: "reuniao",
    origem: "manual",
    titulo: "",
    inicio_at: "",
    fim_at: "",
    lead_id: null,
    cliente_id: null,
    videocall_url: "",
    user_id: null, // trigger no DB pode preencher automaticamente
  });

  const [editing, setEditing] = useState<AgendaEnriquecida | null>(null);
  const [editInicio, setEditInicio] = useState("");
  const [editFim, setEditFim] = useState("");

  const isAdminOrGestor = me?.role === "admin";

  // pega usuário atual
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";
      if (user) setMe({ id: user.id, role });
    })();
  }, []);

  // carrega usuários (dropdown gestor)
  useEffect(() => {
    (async () => {
      if (!isAdminOrGestor) return;
      const { data, error } = await supabase
        .from("users")
        .select("auth_user_id,nome,role")
        .order("nome", { ascending: true });
      if (!error && data) setUsers(data as any);
    })();
  }, [isAdminOrGestor]);

  // ====== Load Agenda (tenta view enriquecida; se falhar, cai para tabela base) ======
  async function load() {
    setLoading(true);
    try {
      // 1) tenta view v_agenda_eventos_enriquecida (se você criar no DB)
      let q1 = supabase
        .from("v_agenda_eventos_enriquecida")
        .select("id,tipo,origem,titulo,inicio_at,fim_at,user_id,cliente_id,lead_id,videocall_url,cliente_nome,lead_nome,telefone")
        .gte("inicio_at", dayISO(new Date(dateFrom)))
        .lte("inicio_at", dayISO(new Date(dateTo), true))
        .order("inicio_at", { ascending: true });

      if (tipo) q1 = q1.eq("tipo", tipo);
      if (userId) q1 = q1.eq("user_id", userId);
      if (debounced) q1 = q1.ilike("titulo", `%${debounced}%`);

      const tryView = await q1;
      if (!tryView.error) {
        setRows((tryView.data || []) as AgendaEnriquecida[]);
        setLoading(false);
        return;
      }

      // 2) fallback: tabela agenda_eventos simples
      let q2 = supabase
        .from("agenda_eventos")
        .select("id,tipo,origem,titulo,inicio_at,fim_at,user_id,cliente_id,lead_id,videocall_url")
        .gte("inicio_at", dayISO(new Date(dateFrom)))
        .lte("inicio_at", dayISO(new Date(dateTo), true))
        .order("inicio_at", { ascending: true });

      if (tipo) q2 = q2.eq("tipo", tipo);
      if (userId) q2 = q2.eq("user_id", userId);
      if (debounced) q2 = q2.ilike("titulo", `%${debounced}%`);

      const { data, error } = await q2;
      if (error) throw error;

      // sem enrich: mapeia direto
      setRows((data || []) as AgendaEnriquecida[]);
    } catch (e: any) {
      alert(e.message || "Falha ao carregar agenda");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dateFrom, dateTo, tipo, userId, debounced]);

  // ====== Criar evento manual ======
  async function createManual() {
    if (!form.titulo?.trim()) return alert("Informe o título.");
    if (!form.inicio_at) return alert("Informe o início.");
    try {
      setLoading(true);
      const payload = {
        tipo: form.tipo || "reuniao",
        origem: "manual" as Origem,
        titulo: form.titulo?.trim() || null,
        inicio_at: form.inicio_at,
        fim_at: form.fim_at || null,
        user_id: form.user_id || null, // se null, trigger preenche com auth.uid
        lead_id: form.lead_id || null,
        cliente_id: form.cliente_id || null,
        videocall_url: form.videocall_url?.trim() || null,
      };
      const { error } = await supabase.from("agenda_eventos").insert([payload]);
      if (error) throw error;

      setForm({
        tipo: "reuniao",
        origem: "manual",
        titulo: "",
        inicio_at: "",
        fim_at: "",
        lead_id: null,
        cliente_id: null,
        videocall_url: "",
        user_id: null,
      });
      setCreating(false);
      await load();
      alert("Evento criado!");
    } catch (e: any) {
      alert(e.message || "Falha ao criar evento.");
    } finally {
      setLoading(false);
    }
  }

  // ====== Reagendar / Excluir (apenas manual) ======
  function openEdit(ev: AgendaEnriquecida) {
    if (ev.origem !== "manual") return;
    setEditing(ev);
    setEditInicio(ev.inicio_at?.slice(0, 16) || "");
    setEditFim(ev.fim_at?.slice(0, 16) || "");
  }
  function closeEdit() {
    setEditing(null);
    setEditInicio("");
    setEditFim("");
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      setLoading(true);
      const upd = {
        inicio_at: editInicio ? new Date(editInicio).toISOString() : editing.inicio_at,
        fim_at: editFim ? new Date(editFim).toISOString() : editing.fim_at,
      };
      const { error } = await supabase.from("agenda_eventos").update(upd).eq("id", editing.id);
      if (error) throw error;
      await load();
      closeEdit();
      alert("Evento atualizado!");
    } catch (e: any) {
      alert(e.message || "Falha ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function removeManual(id: string) {
    if (!confirm("Remover este evento?")) return;
    try {
      setLoading(true);
      const { error } = await supabase.from("agenda_eventos").delete().eq("id", id);
      if (error) throw error;
      await load();
      alert("Evento removido!");
    } catch (e: any) {
      alert(e.message || "Falha ao remover.");
    } finally {
      setLoading(false);
    }
  }

  // ====== UI ======
  const total = rows.length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ margin: "8px 0 16px" }}>Agenda</h1>

      {/* Filtros */}
      <div style={card}>
        <div style={grid6}>
          <div>
            <label style={lbl}>De</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Até</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} style={inp}>
              <option value="">Todos</option>
              {Object.keys(TIPO_LABEL).map((k) => (
                <option key={k} value={k}>{TIPO_LABEL[k as AgendaTipo]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Usuário</label>
            {isAdminOrGestor ? (
              <select value={userId} onChange={(e) => setUserId(e.target.value)} style={inp}>
                <option value="">Todos</option>
                {users.map(u => (
                  <option key={u.auth_user_id} value={u.auth_user_id}>{u.nome}</option>
                ))}
              </select>
            ) : (
              <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="(opcional)" style={inp} />
            )}
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Busca (título)</label>
            <input placeholder="ex.: João, assembleia…" value={search} onChange={(e) => setSearch(e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
          {loading ? "Carregando…" : `Exibindo ${total} evento(s).`}
        </div>
      </div>

      {/* Criar evento manual */}
      <div style={card}>
        <div style={listHeader}>
          <h3 style={{ margin: 0 }}>Novo evento (manual)</h3>
          <button style={btnSecondary} onClick={() => setCreating(v => !v)}>{creating ? "Fechar" : "Abrir"}</button>
        </div>

        {creating && (
          <div style={grid6}>
            <div>
              <label style={lbl}>Tipo</label>
              <select
                value={form.tipo || "reuniao"}
                onChange={(e) => setForm(s => ({ ...s, tipo: e.target.value as AgendaTipo }))}
                style={inp}
              >
                {Object.keys(TIPO_LABEL).map((k) => (
                  <option key={k} value={k}>{TIPO_LABEL[k as AgendaTipo]}</option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Título</label>
              <input
                value={form.titulo || ""}
                onChange={(e) => setForm(s => ({ ...s, titulo: e.target.value }))}
                style={inp}
                placeholder="ex.: Reunião com João"
              />
            </div>

            <div>
              <label style={lbl}>Início</label>
              <input
                type="datetime-local"
                value={form.inicio_at || ""}
                onChange={(e) => setForm(s => ({ ...s, inicio_at: e.target.value }))}
                style={inp}
              />
            </div>

            <div>
              <label style={lbl}>Fim</label>
              <input
                type="datetime-local"
                value={form.fim_at || ""}
                onChange={(e) => setForm(s => ({ ...s, fim_at: e.target.value }))}
                style={inp}
              />
            </div>

            <div>
              <label style={lbl}>Lead ID (opcional)</label>
              <input
                value={form.lead_id || ""}
                onChange={(e) => setForm(s => ({ ...s, lead_id: e.target.value || null }))}
                style={inp}
              />
            </div>

            <div>
              <label style={lbl}>Cliente ID (opcional)</label>
              <input
                value={form.cliente_id || ""}
                onChange={(e) => setForm(s => ({ ...s, cliente_id: e.target.value || null }))}
                style={inp}
              />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={lbl}>Link de vídeo (opcional)</label>
              <input
                value={form.videocall_url || ""}
                onChange={(e) => setForm(s => ({ ...s, videocall_url: e.target.value }))}
                style={inp}
                placeholder="https://meet…"
              />
            </div>

            {isAdminOrGestor && (
              <div>
                <label style={lbl}>User ID (opcional)</label>
                <input
                  value={form.user_id || ""}
                  onChange={(e) => setForm(s => ({ ...s, user_id: e.target.value || null }))}
                  style={inp}
                  placeholder="deixe em branco p/ trigger preencher"
                />
              </div>
            )}

            <div style={{ gridColumn: "span 6", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setCreating(false)} style={btnGhost}>Cancelar</button>
              <button onClick={createManual} disabled={loading} style={btnPrimary}>{loading ? "Salvando..." : "Criar"}</button>
            </div>
          </div>
        )}
      </div>

      {/* Lista */}
      <div style={card}>
        <div style={listHeader}>
          <h3 style={{ margin: 0 }}>Eventos</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Início</th>
                <th style={th}>Tipo</th>
                <th style={th}>Título</th>
                <th style={th}>Pessoa</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td style={td} colSpan={5}>Carregando…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td style={td} colSpan={5}>Sem eventos no período.</td></tr>
              )}
              {rows.map((r) => {
                const phone = r.telefone || null;
                const wa = phone ? waLink(phone, r.titulo || "") : null;
                const pessoa = r.cliente_nome || r.lead_nome || "—";

                return (
                  <tr key={r.id}>
                    <td style={td}>{fmtDateTime(r.inicio_at)}</td>
                    <td style={td}>{TIPO_LABEL[r.tipo]}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{r.titulo || "—"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {r.origem === "auto" ? "Automático" : "Manual"} {r.videocall_url ? "• possui link" : ""}
                      </div>
                    </td>
                    <td style={td}>{pessoa}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {r.videocall_url && (
                          <a href={r.videocall_url} target="_blank" rel="noreferrer" style={btnSecondary}>Abrir link</a>
                        )}
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer" style={btnSecondary}>WhatsApp</a>
                        )}
                        {r.origem === "manual" && (
                          <>
                            <button style={btnSecondary} onClick={() => openEdit(r)}>Reagendar</button>
                            <button style={btnDanger} onClick={() => removeManual(r.id)}>Excluir</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de edição (reagendar) */}
      {editing && (
        <>
          <div style={backdrop} onClick={closeEdit} />
          <div role="dialog" aria-modal="true" style={modal} onKeyDown={(e) => { if (e.key === "Escape") closeEdit(); if (e.key === "Enter") saveEdit(); }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Reagendar evento</h3>
            <div style={grid2}>
              <label style={labelCol}>
                Início
                <input
                  type="datetime-local"
                  value={editInicio}
                  onChange={(e) => setEditInicio(e.target.value)}
                  style={inp}
                  autoFocus
                />
              </label>
              <label style={labelCol}>
                Fim
                <input
                  type="datetime-local"
                  value={editFim}
                  onChange={(e) => setEditFim(e.target.value)}
                  style={inp}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button style={btnGhost} onClick={closeEdit}>Cancelar</button>
              <button style={btnPrimary} onClick={saveEdit} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===== estilos inline simples =====
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  marginBottom: 16,
};
const grid6: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(6, minmax(0,1fr))",
  alignItems: "center",
};
const grid2: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(2, minmax(0,1fr))",
};
const listHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "#475569", marginBottom: 4 };
const inp: React.CSSProperties = { padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", outline: "none", background: "#fff", width: "100%" };
const th: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#475569", padding: "10px 8px", borderBottom: "1px solid #eee" };
const td: React.CSSProperties = { padding: "10px 8px", borderTop: "1px solid #eee", verticalAlign: "top" };

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
const btnDanger: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#fee2e2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  fontWeight: 700,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "#fff",
  color: "#1E293F",
  border: "1px solid #e5e7eb",
  cursor: "pointer",
  fontWeight: 700,
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
  width: "min(520px, 92vw)",
  background: "#fff",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 12px 48px rgba(0,0,0,0.22)",
};
const labelCol: React.CSSProperties = { display: "grid", gap: 6, fontSize: 12, color: "#334155" };
