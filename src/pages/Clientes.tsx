// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ===== tente usar seus utils de br.ts =====
import {
  // Ajuste os nomes abaixo conforme o seu lib/br.ts
  onlyDigits as brOnlyDigits,
  maskPhone as brMaskPhone,
  maskCPF as brMaskCPF,
  toYMD as brToYMD,
  toBRDate as brToBRDate,
  whatsappHrefFromPhone as brWaHref,
} from "@/lib/br";

// ===== fallbacks (caso os nomes de br.ts sejam diferentes) =====
const fallbackOnlyDigits = (v: string) => (v || "").replace(/\D+/g, "");
const fallbackMaskPhone = (v: string) => {
  const d = fallbackOnlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 3);
  const p3 = d.slice(3, 7);
  const p4 = d.slice(7, 11);
  let out = "";
  if (p1) out += `(${p1}) `;
  if (p2) out += p2 + (p3 ? " " : "");
  if (p3) out += p3;
  if (p4) out += "-" + p4;
  return out.trim();
};
const fallbackMaskCPF = (v: string) => {
  const d = fallbackOnlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += "." + p2;
  if (p3) out += "." + p3;
  if (p4) out += "-" + p4;
  return out;
};
const fallbackToYMD = (s?: string | null) => {
  if (!s) return "";
  // aceita DD/MM/AAAA ou ISO
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fallbackToBRDate = (ymd?: string | null) => {
  if (!ymd) return "—";
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
};
const fallbackWaHref = (phone: string) => {
  const d = fallbackOnlyDigits(phone);
  if (!d) return "";
  // Brasil: prefixo 55
  return `https://wa.me/55${d}`;
};

// usa lib se existir; senão, fallback:
const onlyDigits = brOnlyDigits ?? fallbackOnlyDigits;
const maskPhone = brMaskPhone ?? fallbackMaskPhone;
const maskCPF = brMaskCPF ?? fallbackMaskCPF;
const toYMD = brToYMD ?? fallbackToYMD;
const toBRDate = brToBRDate ?? fallbackToBRDate;
const whatsappHrefFromPhone = brWaHref ?? fallbackWaHref;

// ===== Tipos =====
type Cliente = {
  id: string;
  nome: string;
  data_nascimento: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco_cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  lead_id: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type UserLite = { id: string; role: string } | null;

// ===== Componente =====
export default function ClientesPage() {
  const PAGE_SIZE = 10;

  const [me, setMe] = useState<UserLite>(null);
  const [loading, setLoading] = useState(false);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState(1);

  // busca
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  // criação
  const [form, setForm] = useState<Partial<Cliente>>({
    nome: "",
    cpf: "",
    telefone: "",
    email: "",
    data_nascimento: "",
    observacoes: "",
  });

  // edição (modal)
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [edit, setEdit] = useState<Partial<Cliente>>({});

  // criar evento manual (modal)
  const [eventForCliente, setEventForCliente] = useState<Cliente | null>(null);
  const [evtTitle, setEvtTitle] = useState("");
  const [evtInicio, setEvtInicio] = useState("");
  const [evtFim, setEvtFim] = useState("");
  const [evtVideo, setEvtVideo] = useState("");

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)),
    [total]
  );
  const showingFrom = useMemo(
    () => (total ? (page - 1) * PAGE_SIZE + 1 : 0),
    [page, total]
  );
  const showingTo = useMemo(
    () => Math.min(page * PAGE_SIZE, total || 0),
    [page, total]
  );

  // user atual
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      const role = (u?.app_metadata as any)?.role || "viewer";
      if (u) setMe({ id: u.id, role });
    })();
  }, []);

  // debounce busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  // carregar clientes
  async function load(targetPage = 1, term = debouncedQ) {
    const from = (targetPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    setLoading(true);
    try {
      let query = supabase
        .from("clientes")
        .select(
          "id,nome,data_nascimento,cpf,telefone,email,endereco_cep,logradouro,numero,bairro,cidade,uf,observacoes,lead_id,created_by,created_at,updated_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      if (term) {
        // busca simplificada: nome/telefone/email
        query = query.or(
          `nome.ilike.%${term}%,telefone.ilike.%${term}%,email.ilike.%${term}%`
        );
      }

      const { data, error, count } = await query.range(from, to);
      if (error) {
        alert("Erro ao carregar clientes: " + error.message);
        return;
      }
      setClientes(data || []);
      setTotal(count || 0);
      setPage(targetPage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    load(1, debouncedQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // criar cliente
  async function createCliente() {
    const payload = {
      nome: (form.nome || "").trim(),
      cpf: (form.cpf || "").trim() || null,
      telefone: (form.telefone || "").trim() || null,
      email: (form.email || "").trim() || null,
      data_nascimento: form.data_nascimento
        ? toYMD(String(form.data_nascimento))
        : null,
      observacoes: (form.observacoes || "").trim() || null,
      created_by: me?.id || null, // ok se houver trigger para preencher
    };

    if (!payload.nome) {
      alert("Informe o nome do cliente.");
      return;
    }
    if (payload.cpf && onlyDigits(payload.cpf).length !== 11) {
      alert("CPF inválido.");
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from("clientes").insert([payload]);
      if (error) {
        alert("Erro ao criar cliente: " + error.message);
        return;
      }
      // limpa
      setForm({
        nome: "",
        cpf: "",
        telefone: "",
        email: "",
        data_nascimento: "",
        observacoes: "",
      });
      await load(1);
      alert("Cliente criado com sucesso!");
      // 🔔 Trigger no DB já cuida de aniversário automático na agenda
    } finally {
      setLoading(false);
    }
  }

  // abrir/fechar edição
  function openEdit(c: Cliente) {
    setEditing(c);
    setEdit({
      nome: c.nome,
      cpf: c.cpf ? maskCPF(c.cpf) : "",
      telefone: c.telefone ? maskPhone(c.telefone) : "",
      email: c.email || "",
      data_nascimento: c.data_nascimento ? toYMD(c.data_nascimento) : "",
      observacoes: c.observacoes || "",
      endereco_cep: c.endereco_cep || "",
      logradouro: c.logradouro || "",
      numero: c.numero || "",
      bairro: c.bairro || "",
      cidade: c.cidade || "",
      uf: c.uf || "",
    });
  }
  function closeEdit() {
    setEditing(null);
    setEdit({});
  }

  // salvar edição
  async function saveEdit() {
    if (!editing) return;
    const upd: any = {
      nome: (edit.nome || "").trim() || null,
      cpf: edit.cpf ? onlyDigits(String(edit.cpf)) : null,
      telefone: edit.telefone ? onlyDigits(String(edit.telefone)) : null,
      email: (edit.email || "").trim() || null,
      data_nascimento: edit.data_nascimento
        ? toYMD(String(edit.data_nascimento))
        : null,
      observacoes: (edit.observacoes || "").trim() || null,
      endereco_cep: (edit.endereco_cep || "").trim() || null,
      logradouro: (edit.logradouro || "").trim() || null,
      numero: (edit.numero || "").trim() || null,
      bairro: (edit.bairro || "").trim() || null,
      cidade: (edit.cidade || "").trim() || null,
      uf: (edit.uf || "").trim().toUpperCase() || null,
    };

    if (!upd.nome) {
      alert("O nome não pode ficar em branco.");
      return;
    }
    if (upd.cpf && String(upd.cpf).length !== 11) {
      alert("CPF inválido.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("clientes")
        .update(upd)
        .eq("id", editing.id);
      if (error) {
        alert("Não foi possível salvar: " + error.message);
        return;
      }
      await load(page);
      closeEdit();
      alert("Cliente atualizado!");
      // 🔔 Trigger de aniversário permanece cobrindo a automação
    } finally {
      setLoading(false);
    }
  }

  // abrir/fechar modal de evento manual
  function openEventModal(c: Cliente) {
    setEventForCliente(c);
    setEvtTitle(`Contato com ${c.nome}`);
    setEvtInicio("");
    setEvtFim("");
    setEvtVideo("");
  }
  function closeEventModal() {
    setEventForCliente(null);
    setEvtTitle("");
    setEvtInicio("");
    setEvtFim("");
    setEvtVideo("");
  }

  // criar evento manual (agenda_eventos)
  async function createManualEvent() {
    if (!eventForCliente) return;
    if (!evtTitle.trim()) {
      alert("Informe o título do evento.");
      return;
    }
    if (!evtInicio || !evtFim) {
      alert("Informe início e fim.");
      return;
    }
    try {
      setLoading(true);
      const payload = {
        tipo: "contato" as const,
        titulo: evtTitle.trim(),
        cliente_id: eventForCliente.id,
        lead_id: null,
        user_id: me?.id ?? null, // há trigger de preenchimento automático, mas enviamos se soubermos
        inicio_at: new Date(evtInicio).toISOString(),
        fim_at: new Date(evtFim).toISOString(),
        videocall_url: evtVideo?.trim() || null,
        origem: "manual" as const,
        relacao_id: null,
      };
      const { error } = await supabase
        .from("agenda_eventos")
        .insert([payload]);
      if (error) {
        alert("Erro ao criar evento: " + error.message);
        return;
      }
      closeEventModal();
      alert("Evento criado na Agenda!");
    } finally {
      setLoading(false);
    }
  }

  // ===== UI =====
  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", paddingBottom: 24 }}>
      <h1 style={{ margin: "16px 0" }}>Clientes</h1>

      {/* Card: novo cliente */}
      <div style={card}>
        <h3 style={cardTitle}>Novo Cliente</h3>
        <div style={grid3}>
          <input
            placeholder="Nome"
            value={form.nome || ""}
            onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
            style={input}
          />

          <input
            placeholder="CPF"
            value={form.cpf || ""}
            onChange={(e) =>
              setForm((s) => ({ ...s, cpf: maskCPF(e.target.value) }))
            }
            style={input}
            inputMode="numeric"
          />

          <input
            placeholder="Telefone"
            value={form.telefone || ""}
            onChange={(e) =>
              setForm((s) => ({ ...s, telefone: maskPhone(e.target.value) }))
            }
            style={input}
            inputMode="tel"
          />

          <input
            placeholder="E-mail"
            value={form.email || ""}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            style={input}
            type="email"
          />

          <label style={label}>
            Data de Nascimento
            <input
              type="date"
              value={toYMD(String(form.data_nascimento || ""))}
              onChange={(e) =>
                setForm((s) => ({ ...s, data_nascimento: e.target.value }))
              }
              style={input}
            />
          </label>

          <input
            placeholder="Observações"
            value={form.observacoes || ""}
            onChange={(e) =>
              setForm((s) => ({ ...s, observacoes: e.target.value }))
            }
            style={input}
          />

          <button onClick={createCliente} disabled={loading} style={btnPrimary}>
            {loading ? "Salvando..." : "Criar Cliente"}
          </button>
        </div>
      </div>

      {/* Card: busca/listagem */}
      <div style={card}>
        <div style={listHeader}>
          <h3 style={{ margin: 0 }}>Lista de Clientes</h3>

          <div style={rightHeader}>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...input, paddingLeft: 36, width: 300 }}
                placeholder="Buscar por nome, telefone ou e-mail…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  top: 10,
                  fontSize: 14,
                  opacity: 0.6,
                }}
              >
                🔎
              </span>
            </div>
            <small style={{ color: "#64748b", marginLeft: 12 }}>
              {total > 0
                ? `Mostrando ${showingFrom}-${showingTo} de ${total}`
                : "Nenhum cliente"}
            </small>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}
          >
            <thead>
              <tr>
                <th style={th}>Nome</th>
                <th style={th}>Telefone</th>
                <th style={th}>E-mail</th>
                <th style={th}>Nascimento</th>
                <th style={{ ...th, width: 240 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{c.nome}</div>
                    {c.cpf ? (
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        CPF: {maskCPF(String(c.cpf))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>—</div>
                    )}
                  </td>
                  <td style={td}>
                    {c.telefone ? (
                      <>
                        {maskPhone(String(c.telefone))}{" "}
                        <a
                          href={whatsappHrefFromPhone(String(c.telefone))}
                          target="_blank"
                          rel="noreferrer"
                          style={waLink}
                          title="Abrir WhatsApp"
                        >
                          WhatsApp
                        </a>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={td}>{c.email || "-"}</td>
                  <td style={td}>
                    {c.data_nascimento ? toBRDate(toYMD(c.data_nascimento)) : "—"}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        style={btnSecondary}
                        disabled={loading}
                        onClick={() => openEdit(c)}
                      >
                        Editar
                      </button>
                      <button
                        style={btnSecondary}
                        onClick={() => openEventModal(c)}
                        disabled={loading}
                        title="Criar evento manual (Agenda)"
                      >
                        + Evento
                      </button>
                      <a
                        href={`/agenda?cliente_id=${c.id}`}
                        style={btnGhostLink}
                        title="Ver na Agenda"
                      >
                        Ver na Agenda
                      </a>
                    </div>
                  </td>
                </tr>
              ))}

              {clientes.length === 0 && (
                <tr>
                  <td style={td} colSpan={5}>
                    {loading ? "Carregando..." : "Nenhum cliente encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div style={pager}>
          <button
            style={{ ...btnSecondary, opacity: page <= 1 ? 0.6 : 1 }}
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
          >
            ‹ Anterior
          </button>
          <span style={{ fontSize: 12, color: "#475569" }}>
            Página {page} de {totalPages}
          </span>
          <button
            style={{ ...btnSecondary, opacity: page >= totalPages ? 0.6 : 1 }}
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
          >
            Próxima ›
          </button>
        </div>
      </div>

      {/* Modal Edição */}
      {editing && (
        <>
          <div style={backdrop} onClick={closeEdit} />
          <div
            role="dialog"
            aria-modal="true"
            style={modal}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeEdit();
              if (e.key === "Enter") saveEdit();
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              Editar Cliente — {editing.nome}
            </h3>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
              <label style={label}>
                Nome
                <input
                  value={edit.nome || ""}
                  onChange={(e) => setEdit((s) => ({ ...s, nome: e.target.value }))}
                  style={input}
                  autoFocus
                />
              </label>

              <label style={label}>
                CPF
                <input
                  value={edit.cpf || ""}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, cpf: maskCPF(String(e.target.value)) }))
                  }
                  style={input}
                  inputMode="numeric"
                />
              </label>

              <label style={label}>
                Telefone
                <input
                  value={edit.telefone || ""}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, telefone: maskPhone(e.target.value) }))
                  }
                  style={input}
                  inputMode="tel"
                />
              </label>

              <label style={label}>
                E-mail
                <input
                  type="email"
                  value={edit.email || ""}
                  onChange={(e) => setEdit((s) => ({ ...s, email: e.target.value }))}
                  style={input}
                />
              </label>

              <label style={label}>
                Data de Nascimento
                <input
                  type="date"
                  value={toYMD(String(edit.data_nascimento || ""))}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, data_nascimento: e.target.value }))
                  }
                  style={input}
                />
              </label>

              <label style={label}>
                Observações
                <input
                  value={edit.observacoes || ""}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, observacoes: e.target.value }))
                  }
                  style={input}
                />
              </label>

              {/* Endereço opcional */}
              <label style={label}>
                CEP
                <input
                  value={edit.endereco_cep || ""}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, endereco_cep: e.target.value }))
                  }
                  style={input}
                />
              </label>
              <label style={label}>
                Logradouro
                <input
                  value={edit.logradouro || ""}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, logradouro: e.target.value }))
                  }
                  style={input}
                />
              </label>
              <label style={label}>
                Número
                <input
                  value={edit.numero || ""}
                  onChange={(e) => setEdit((s) => ({ ...s, numero: e.target.value }))}
                  style={input}
                />
              </label>
              <label style={label}>
                Bairro
                <input
                  value={edit.bairro || ""}
                  onChange={(e) => setEdit((s) => ({ ...s, bairro: e.target.value }))}
                  style={input}
                />
              </label>
              <label style={label}>
                Cidade
                <input
                  value={edit.cidade || ""}
                  onChange={(e) => setEdit((s) => ({ ...s, cidade: e.target.value }))}
                  style={input}
                />
              </label>
              <label style={label}>
                UF
                <input
                  value={edit.uf || ""}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, uf: e.target.value.toUpperCase().slice(0, 2) }))
                  }
                  style={input}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button style={btnSecondary} onClick={closeEdit} disabled={loading}>
                Cancelar
              </button>
              <button style={btnPrimary} onClick={saveEdit} disabled={loading}>
                Salvar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal Evento Manual */}
      {eventForCliente && (
        <>
          <div style={backdrop} onClick={closeEventModal} />
          <div role="dialog" aria-modal="true" style={modal}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              Novo evento — {eventForCliente.nome}
            </h3>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              <label style={label}>
                Título
                <input
                  value={evtTitle}
                  onChange={(e) => setEvtTitle(e.target.value)}
                  style={input}
                />
              </label>

              <label style={label}>
                Link de vídeo (opcional)
                <input
                  value={evtVideo}
                  onChange={(e) => setEvtVideo(e.target.value)}
                  style={input}
                />
              </label>

              <label style={label}>
                Início
                <input
                  type="datetime-local"
                  value={evtInicio}
                  onChange={(e) => setEvtInicio(e.target.value)}
                  style={input}
                />
              </label>

              <label style={label}>
                Fim
                <input
                  type="datetime-local"
                  value={evtFim}
                  onChange={(e) => setEvtFim(e.target.value)}
                  style={input}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button style={btnSecondary} onClick={closeEventModal} disabled={loading}>
                Cancelar
              </button>
              <button style={btnPrimary} onClick={createManualEvent} disabled={loading}>
                Criar evento
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===== estilos inline (mesmo padrão que você usa nas outras guias) =====
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  marginBottom: 16,
};
const cardTitle: React.CSSProperties = { margin: "0 0 12px 0" };
const grid3: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(3, minmax(0,1fr))",
};
const input: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
  background: "#fff",
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
const btnGhostLink: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  fontWeight: 600,
  textDecoration: "none",
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
const listHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};
const rightHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};
const pager: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
  marginTop: 12,
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
  width: "min(720px, 92vw)",
  background: "#fff",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 12px 48px rgba(0,0,0,0.22)",
};
const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "#334155",
};
const waLink: React.CSSProperties = {
  marginLeft: 8,
  fontSize: 12,
  color: "#0ea5e9",
  textDecoration: "underline",
};
