// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Pencil,
  CalendarPlus,
  Eye,
  Send,
  Filter,
  SortAsc,
  SortDesc,
  Copy,
  UserPlus,
} from "lucide-react";

/* ========================= Views existentes ========================= */
const SCHEMA_CLIENTES_VIEW = "v_clientes_list";     // public.v_clientes_list
const SCHEMA_VENDAS_VIEW   = "v_vendas_cliente";    // public.v_vendas_cliente

/* ========================= Tipos ========================= */
type Cliente = {
  id: string;
  nome: string;
  cpf_dig?: string | null;
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null; // YYYY-MM-DD
  observacoes?: string | null;
  created_at?: string | null;
  _source?: "clientes" | "vendas";
  _source_id?: string | null;
};

/* ========================= Utils ========================= */
const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");

const maskPhone = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
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

const maskCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = "";
  if (p1) out += p1;
  if (p2) out += (out ? "." : "") + p2;
  if (p3) out += (out ? "." : "") + p3;
  if (p4) out += (out ? "-" : "") + p4;
  return out;
};

const isValidCPF = (raw: string) => {
  const s = onlyDigits(raw);
  if (s.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(s)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * factor--;
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  const dv1 = calc(s.slice(0, 9), 10);
  if (dv1 !== parseInt(s[9], 10)) return false;
  const dv2 = calc(s.slice(0, 10), 11);
  return dv2 === parseInt(s[10], 10);
};

const formatBRDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const upcomingBirthdaySortKey = (iso?: string | null) => {
  if (!iso) return 366;
  const ref = new Date();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 366;
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const thisYear = new Date(Date.UTC(ref.getUTCFullYear(), month, day));
  const nextYear = new Date(Date.UTC(ref.getUTCFullYear() + 1, month, day));
  const target = thisYear < ref ? nextYear : thisYear;
  const diffMs = target.getTime() - ref.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const isBirthdayThisMonth = (iso?: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCMonth() === now.getUTCMonth();
};

const isBirthdayThisWeek = (iso?: string | null) => {
  // semana sex→qui
  if (!iso) return false;
  const now = new Date();
  const toUTC0 = (x: Date) =>
    new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
  const today = toUTC0(now);
  const weekday = today.getUTCDay();
  const offsetToFri = ((weekday - 5 + 7) % 7);
  const start = new Date(today.getTime() - offsetToFri * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  const birth = new Date(iso);
  const thisYear = new Date(Date.UTC(today.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()));
  return thisYear >= start && thisYear <= end;
};

function normalizeString(s?: string | null) {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/* ========================= Componente ========================= */
export default function ClientesPage() {
  const PAGE = 10;

  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // filtros/ordenação
  const [filterWeek, setFilterWeek] = useState(false);
  const [filterMonth, setFilterMonth] = useState(false);
  const [sortBy, setSortBy] = useState<"nomeAsc" | "nomeDesc" | "aniversario">("nomeAsc");

  // modal edição
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBirth, setEditBirth] = useState<string>("");
  const [editObs, setEditObs] = useState("");
  const [editCEP, setEditCEP] = useState("");
  const [editLogr, setEditLogr] = useState("");
  const [editNumero, setEditNumero] = useState("");
  const [editBairro, setEditBairro] = useState("");
  const [editCidade, setEditCidade] = useState("");
  const [editUF, setEditUF] = useState("");

  // form novo cliente
  const [formNome, setFormNome] = useState("");
  const [formCPF, setFormCPF] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBirth, setFormBirth] = useState<string>("");
  const [formObs, setFormObs] = useState("");

  // fila de incompletos
  const [incompletos, setIncompletos] = useState<Cliente[]>([]);

  // toasts
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const pushToast = (type: "success" | "error" | "info", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3800);
  };

  /* ========================= Effects ========================= */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filterWeek, filterMonth, sortBy]);

  useEffect(() => {
    loadIncompletos();
  }, []);

  /* ========================= Mapeamentos ========================= */
  function mapFromClientesView(r: any): Cliente {
    // Campos usuais da v_clientes_list
    const cpf_dig =
      r.cpf_dig ??
      (r.cpf ? String(r.cpf).replace(/\D/g, "") : null);
    return {
      id: r.id,
      nome: r.nome ?? "",
      cpf_dig,
      telefone: r.telefone ?? null,
      email: r.email ?? null,
      data_nascimento: r.data_nascimento ?? null,
      observacoes: r.observacoes ?? null,
      created_at: r.created_at ?? null,
      _source: "clientes",
      _source_id: r.id ?? null,
    };
  }

  function mapFromVendasView(r: any): Cliente {
    // Tentamos diferentes convenções de colunas comuns nessa view
    const nome = r.nome ?? r.cliente_nome ?? r.lead_nome ?? "";
    const tel  = r.telefone ?? r.phone ?? r.celular ?? null;
    const mail = r.email ?? r.lead_email ?? null;
    const cpf  =
      r.cpf_dig ??
      (r.cpf ? String(r.cpf).replace(/\D/g, "") : null) ??
      (r.cpf_cnpj ? String(r.cpf_cnpj).replace(/\D/g, "") : null);

    return {
      id: r.id, // id da venda como id provisório na listagem
      nome,
      cpf_dig: cpf,
      telefone: tel,
      email: mail,
      data_nascimento: r.data_nascimento ?? r.nascimento ?? null,
      observacoes: r.observacoes ?? r.descricao ?? null,
      created_at: r.created_at ?? r.encarteirada_em ?? null,
      _source: "vendas",
      _source_id: r.id ?? null,
    };
  }

  function dedupePreferClientes(rows: Cliente[]): Cliente[] {
    // Prioridade: clientes > vendas
    const byKey = new Map<string, Cliente>();

    const keyFor = (c: Cliente) => {
      if (c.cpf_dig) return `CPF:${c.cpf_dig}`;
      const nn = normalizeString(c.nome);
      const ph = onlyDigits(c.telefone || "");
      const em = (c.email || "").toLowerCase();
      return `NF:${nn}|${ph}|${em}`;
    };

    for (const row of rows) {
      const k = keyFor(row);
      const existing = byKey.get(k);
      if (!existing) {
        byKey.set(k, row);
        continue;
      }
      const score = (c: Cliente) => (c._source === "clientes" ? 2 : 1);
      byKey.set(k, score(row) >= score(existing) ? row : existing);
    }
    return Array.from(byKey.values());
  }

  /* ========================= Loads ========================= */
  async function loadIncompletos() {
    try {
      // Trazemos um pouco de cada fonte e filtramos client-side por faltantes
      const [{ data: dc }, { data: dv }] = await Promise.all([
        supabase.from(SCHEMA_CLIENTES_VIEW).select("*").range(0, 199),
        supabase.from(SCHEMA_VENDAS_VIEW).select("*").range(0, 199),
      ]);

      let rows: Cliente[] = [];
      rows.push(...(dc || []).map(mapFromClientesView));
      rows.push(...(dv || []).map(mapFromVendasView));

      rows = dedupePreferClientes(rows);

      const faltantes = rows.filter(
        (c) => !c.telefone || !c.email || !c.observacoes
      );

      // Ordena por mais recentes
      faltantes.sort((a, b) =>
        (b.created_at || "").localeCompare(a.created_at || "")
      );

      setIncompletos(faltantes.slice(0, 8));
    } catch (e: any) {
      pushToast("error", "Erro ao buscar novos clientes: " + (e?.message || e));
    }
  }

  async function load(target = 1, term = "") {
    setLoading(true);
    try {
      // Carrega lote “largo” e filtra/ordena no cliente (evita depender dos nomes de colunas de cada view)
      const [{ data: dc, error: ec }, { data: dv, error: ev }] = await Promise.all([
        supabase.from(SCHEMA_CLIENTES_VIEW).select("*").range(0, 999),
        supabase.from(SCHEMA_VENDAS_VIEW).select("*").range(0, 999),
      ]);
      if (ec) throw ec;
      if (ev) throw ev;

      let rows: Cliente[] = [];
      rows.push(...(dc || []).map(mapFromClientesView));
      rows.push(...(dv || []).map(mapFromVendasView));

      // Busca por NOME (somente)
      if (term) {
        const nterm = normalizeString(term);
        rows = rows.filter((r) => normalizeString(r.nome).includes(nterm));
      }

      // Filtros de aniversário (client-side)
      if (filterWeek) rows = rows.filter((r) => isBirthdayThisWeek(r.data_nascimento));
      if (filterMonth) rows = rows.filter((r) => isBirthdayThisMonth(r.data_nascimento));

      // Dedupe (clientes > vendas)
      rows = dedupePreferClientes(rows);

      // Ordenação
      if (sortBy === "aniversario") {
        rows.sort(
          (a, b) => upcomingBirthdaySortKey(a.data_nascimento) - upcomingBirthdaySortKey(b.data_nascimento)
        );
      } else if (sortBy === "nomeDesc") {
        rows.sort((a, b) => (b.nome || "").localeCompare(a.nome || "", "pt-BR"));
      } else {
        rows.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      }

      // Paginação client-side
      const from = (target - 1) * PAGE;
      const to = from + PAGE;
      setTotal(rows.length);
      setClientes(rows.slice(from, to));
      setPage(target);
    } catch (e: any) {
      pushToast("error", e.message || "Erro ao listar clientes.");
    } finally {
      setLoading(false);
    }
  }

  /* ========================= Create / Edit ========================= */
  async function createCliente() {
    const nome = formNome.trim();
    const cpf = onlyDigits(formCPF);
    const telefone = onlyDigits(formPhone);
    const email = formEmail.trim() || null;
    const data_nascimento = formBirth || null;
    const observacoes = formObs.trim() || null;

    if (!nome) return pushToast("error", "Informe o nome.");
    if (!cpf) return pushToast("error", "Informe o CPF.");
    if (!isValidCPF(cpf)) return pushToast("error", "CPF inválido.");
    if (telefone && !(telefone.length === 10 || telefone.length === 11)) {
      return pushToast("error", "Telefone deve ter 10 ou 11 dígitos.");
    }

    try {
      setLoading(true);

      // Checa duplicidade por CPF na view de clientes (oficial). Se quiser, dá para olhar também em vendas.
      const { data: exists, error: exErr } = await supabase
        .from(SCHEMA_CLIENTES_VIEW)
        .select("id, nome, cpf_dig")
        .eq("cpf_dig", cpf)
        .limit(1);
      if (exErr) throw exErr;
      if (exists && exists.length) {
        const c = exists[0];
        pushToast("info", `Já existe um cliente com este CPF: ${c.nome}. Abrindo para edição…`);
        openEdit({ id: c.id, nome: c.nome, cpf_dig: cpf });
        return;
      }

      const { error, data } = await supabase
        .from("clientes")
        .insert({
          nome,
          cpf,
          telefone: telefone || null,
          email,
          data_nascimento,
          observacoes,
        })
        .select("id")
        .single();
      if (error) throw error;

      await supabase.rpc("upsert_birthday_event", { p_cliente: data!.id });

      setFormNome("");
      setFormCPF("");
      setFormPhone("");
      setFormEmail("");
      setFormBirth("");
      setFormObs("");

      await Promise.all([load(1), loadIncompletos()]);
      pushToast("success", "Cliente criado com sucesso!");
    } catch (e: any) {
      pushToast("error", "Não foi possível salvar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function openEdit(c: Cliente) {
    setEditing(c);
    setEditNome(c.nome || "");
    setEditEmail(c.email || "");
    setEditPhone(c.telefone ? maskPhone(c.telefone) : "");
    setEditBirth(c.data_nascimento || "");
    setEditObs(c.observacoes || "");
    setEditCEP("");
    setEditLogr("");
    setEditNumero("");
    setEditBairro("");
    setEditCidade("");
    setEditUF("");
  }
  function closeEdit() {
    setEditing(null);
  }

  // ViaCEP quando CEP completo
  useEffect(() => {
    const d = onlyDigits(editCEP);
    if (editing && d.length === 8) {
      (async () => {
        try {
          const resp = await fetch(`https://viacep.com.br/ws/${d}/json/`);
          const data = await resp.json();
          if (!data?.erro) {
            setEditLogr((v) => v || data.logradouro || "");
            setEditBairro((v) => v || data.bairro || "");
            setEditCidade((v) => v || data.localidade || "");
            setEditUF((v) => v || data.uf || "");
          }
        } catch { /* ignore */ }
      })();
    }
  }, [editCEP, editing]);

  async function saveEdit() {
    if (!editing) return;
    if (!editNome.trim()) return pushToast("error", "Nome é obrigatório.");
    const phoneDigits = onlyDigits(editPhone);
    if (phoneDigits && !(phoneDigits.length === 10 || phoneDigits.length === 11)) {
      return pushToast("error", "Telefone deve ter 10 ou 11 dígitos.");
    }

    try {
      setLoading(true);
      const update: any = {
        nome: editNome.trim() || null,
        email: editEmail.trim() || null,
        telefone: phoneDigits || null,
        data_nascimento: editBirth || null,
        observacoes: editObs.trim() || null,
      };
      // Se criar colunas de endereço em "clientes", descomente:
      // update.cep        = onlyDigits(editCEP) || null;
      // update.logradouro = editLogr || null;
      // update.numero     = editNumero || null;
      // update.bairro     = editBairro || null;
      // update.cidade     = editCidade || null;
      // update.uf         = editUF || null;

      const { error } = await supabase.from("clientes").update(update).eq("id", editing.id);
      if (error) throw error;

      await supabase.rpc("upsert_birthday_event", { p_cliente: editing.id });

      await Promise.all([load(page), loadIncompletos()]);
      closeEdit();
      pushToast("success", "Cliente atualizado!");
    } catch (e: any) {
      pushToast("error", "Erro ao salvar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || 0) / PAGE)),
    [total]
  );

  /* ========================= UI ========================= */
  return (
    <div className="space-y-4">
      {/* ====== Novos clientes para complementar ====== */}
      {incompletos.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow border">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="m-0 font-semibold">Novos clientes para complementar</h3>
            <button className="btn" onClick={loadIncompletos}>Atualizar</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {incompletos.map((c) => {
              const phone = c.telefone ? maskPhone(c.telefone) : "";
              const missing: string[] = [];
              if (!c.telefone) missing.push("telefone");
              if (!c.email) missing.push("e-mail");
              if (!c.observacoes) missing.push("observações");
              return (
                <div key={c.id} className="rounded-xl border p-3">
                  <div className="font-semibold">{c.nome}</div>
                  <div className="text-xs text-slate-500 mb-1">CPF: {c.cpf_dig || "—"}</div>
                  <div className="text-sm mb-1">📞 {phone || "—"}</div>
                  <div className="text-sm mb-2">✉️ {c.email || "—"}</div>
                  {missing.length > 0 && (
                    <div className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 rounded px-2 py-1 inline-block">
                      Faltando: {missing.join(", ")}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button className="btn-primary" onClick={() => openEdit(c)}>Completar</button>
                    <a
                      className="btn"
                      title="Abrir WhatsApp"
                      href={c.telefone ? `https://wa.me/55${onlyDigits(c.telefone)}` : undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Send className="h-4 w-4 mr-1" /> WhatsApp
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====== Novo cliente ====== */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <h3 className="mb-2 font-semibold">Novo Cliente</h3>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <input
            placeholder="Nome"
            className="input"
            value={formNome}
            onChange={(e) => setFormNome(e.target.value)}
          />
          <input
            placeholder="CPF"
            className="input"
            value={maskCPF(formCPF)}
            onChange={(e) => setFormCPF(e.target.value)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v && !isValidCPF(v)) pushToast("error", "CPF inválido.");
            }}
          />
          <input
            placeholder="Telefone"
            className="input"
            value={maskPhone(formPhone)}
            onChange={(e) => setFormPhone(e.target.value)}
          />
          <input
            placeholder="E-mail"
            className="input"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
          />
          <input
            type="date"
            className="input"
            value={formBirth}
            onChange={(e) => setFormBirth(e.target.value)}
            placeholder="Data de Nascimento"
          />
          <input
            placeholder="Observações"
            className="input md:col-span-2"
            value={formObs}
            onChange={(e) => setFormObs(e.target.value)}
          />
          <button
            className="btn-primary md:col-span-2"
            onClick={createCliente}
            disabled={loading}
            title="Criar e adicionar à base"
          >
            {loading ? "Salvando..." : <><UserPlus className="h-4 w-4 mr-1 inline" /> Criar Cliente</>}
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Dica: informe CPF e Telefone para evitar duplicidades e acelerar contatos.
        </div>
      </div>

      {/* ====== Lista ====== */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <h3 className="m-0 font-semibold">Lista de Clientes</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                className="input pl-9 w-80"
                placeholder="Buscar por nome"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="absolute left-3 top-2.5 opacity-60">🔎</span>
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-2">
              <button
                className={`chip ${filterWeek ? "chip-on" : ""}`}
                onClick={() => { setFilterWeek((v) => !v); setPage(1); }}
                title="Aniversaria nesta semana (sex→qui)"
              >
                <Filter className="h-3.5 w-3.5" /> Semana
              </button>
              <button
                className={`chip ${filterMonth ? "chip-on" : ""}`}
                onClick={() => { setFilterMonth((v) => !v); setPage(1); }}
                title="Aniversaria neste mês"
              >
                <Filter className="h-3.5 w-3.5" /> Mês
              </button>

              {/* Ordenação */}
              <div className="relative">
                <select
                  className="input pr-8"
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value as any); setPage(1); }}
                  title="Ordenar por"
                >
                  <option value="nomeAsc">Nome (A→Z)</option>
                  <option value="nomeDesc">Nome (Z→A)</option>
                  <option value="aniversario">Próximos aniversários</option>
                </select>
                <span className="absolute right-2 top-2.5 opacity-60">
                  {sortBy === "nomeDesc" ? <SortDesc className="h-4 w-4" /> : <SortAsc className="h-4 w-4" />}
                </span>
              </div>

              <small className="text-slate-500">
                Mostrando {clientes.length ? (page - 1) * PAGE + 1 : 0}-
                {Math.min(page * PAGE, total)} de {total}
              </small>
            </div>
          </div>
        </div>

        <div className="rounded-xl border overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Nome</th>
                <th className="p-2 text-left">Telefone</th>
                <th className="p-2 text-left">E-mail</th>
                <th className="p-2 text-left">Nascimento</th>
                <th className="p-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={5}>
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading && clientes.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={5}>
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
              {clientes.map((c, i) => {
                const phone = c.telefone ? maskPhone(c.telefone) : "";
                const wa = c.telefone ? `https://wa.me/55${onlyDigits(c.telefone)}` : "";
                const contatoStr = `${c.nome} | ${phone || "s/ telefone"} | ${c.email || "s/ e-mail"}`;
                return (
                  <tr key={`${c._source || ""}-${c.id}`} className={i % 2 ? "bg-slate-50/60" : "bg-white"}>
                    <td className="p-2">
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-slate-500">
                        CPF: {c.cpf_dig || "—"}
                        {c._source === "vendas" && (
                          <span className="ml-2 inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase opacity-70">
                            Vendas
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {phone || "—"}
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir WhatsApp"
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-green-50"
                          >
                            <Send className="h-3.5 w-3.5" />
                            WhatsApp
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-2">{c.email || "—"}</td>
                    <td className="p-2">{formatBRDate(c.data_nascimento)}</td>
                    <td className="p-2">
                      <div className="flex items-center justify-center gap-2">
                        <button className="icon-btn" title="Editar" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="icon-btn"
                          title="Copiar contato"
                          onClick={() => {
                            copyToClipboard(contatoStr);
                            pushToast("info", "Contato copiado!");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          className="icon-btn"
                          title="+ Evento na Agenda"
                          onClick={async () => {
                            await supabase.rpc("upsert_birthday_event", { p_cliente: c.id });
                            pushToast("success", "Evento atualizado/gerado na Agenda.");
                          }}
                        >
                          <CalendarPlus className="h-4 w-4" />
                        </button>
                        <a className="icon-btn" title="Ver na Agenda" href="/agenda">
                          <Eye className="h-4 w-4" />
                        </a>
                        <a
                          className="icon-btn"
                          title="Criar oportunidade"
                          href={`/oportunidades?cliente=${encodeURIComponent(c.id)}`}
                        >
                          <UserPlus className="h-4 w-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* paginação */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button className="btn" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
            ‹ Anterior
          </button>
          <span className="text-xs text-slate-600">
            Página {page} de {totalPages}
          </span>
          <button className="btn" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>
            Próxima ›
          </button>
        </div>
      </div>

      {/* ====== Modal edição ====== */}
      {editing && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeEdit} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(900px,92vw)] bg-white rounded-2xl shadow-xl p-4">
            <h3 className="font-semibold mb-2">Editar Cliente</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="input" placeholder="Nome" value={editNome} onChange={(e) => setEditNome(e.target.value)} />
              <input className="input" placeholder="E-mail" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              <input className="input" placeholder="Telefone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              <input type="date" className="input" value={editBirth} onChange={(e) => setEditBirth(e.target.value)} placeholder="Data de Nascimento" />
              <input className="input" placeholder="CEP" value={editCEP} onChange={(e) => setEditCEP(e.target.value)} />
              <input className="input" placeholder="Logradouro" value={editLogr} onChange={(e) => setEditLogr(e.target.value)} />
              <input className="input" placeholder="Número" value={editNumero} onChange={(e) => setEditNumero(e.target.value)} />
              <input className="input" placeholder="Bairro" value={editBairro} onChange={(e) => setEditBairro(e.target.value)} />
              <input className="input" placeholder="Cidade" value={editCidade} onChange={(e) => setEditCidade(e.target.value)} />
              <input className="input" placeholder="UF" value={editUF} onChange={(e) => setEditUF(e.target.value.toUpperCase().slice(0, 2))} />
              <input className="input md:col-span-3" placeholder="Observações" value={editObs} onChange={(e) => setEditObs(e.target.value)} />
            </div>
            <div className="mt-3 flex gap-2 justify-end">
              <button className="btn" onClick={closeEdit}>Cancelar</button>
              <button className="btn-primary" onClick={saveEdit} disabled={loading}>
                {loading ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ====== Toast ====== */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[60] rounded-xl px-4 py-3 shadow-lg text-sm ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : toast.type === "error"
              ? "bg-rose-600 text-white"
              : "bg-slate-800 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* ====== estilos locais ====== */}
      <style>{`
        .input{padding:10px;border-radius:12px;border:1px solid #e5e7eb;outline:none;background:#fff}
        .btn{padding:8px 12px;border-radius:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:600}
        .btn-primary{padding:10px 16px;border-radius:12px;background:#A11C27;color:#fff;font-weight:800}
        .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc}
        .icon-btn:hover{background:#eef2ff}
        .chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px}
        .chip-on{background:#1E293F;color:#fff;border-color:#1E293F}
      `}</style>
    </div>
  );
}
