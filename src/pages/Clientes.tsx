// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cpfMask, phoneMask, onlyDigits, toBRDate } from "@/lib/br";
import {
  Pencil,
  CalendarPlus,
  Eye,
  Search,
} from "lucide-react";

/** Tipos */
type Cliente = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  observacoes: string | null;
  lead_id: string | null;
  created_at: string;
};

export default function ClientesPage() {
  const PAGE_SIZE = 10;

  // ui
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // filtros
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [onlyWithCPF, setOnlyWithCPF] = useState<boolean>(true); // 👈 padrão: só clientes

  // paginação
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // dados
  const [clientes, setClientes] = useState<Cliente[]>([]);

  // form novo
  const [fNome, setFNome] = useState("");
  const [fCPF, setFCPF] = useState("");
  const [fTelefone, setFTelefone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fNasc, setFNasc] = useState("");
  const [fObs, setFObs] = useState("");

  // debounce busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // carregar grid
  async function load(targetPage = 1) {
    setLoading(true);
    try {
      const from = (targetPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("clientes")
        .select(
          "id,nome,cpf,telefone,email,data_nascimento,observacoes,lead_id,created_at",
          { count: "exact" }
        )
        // ordenação A→Z (case-insensitive)
        .order("nome", { ascending: true });

      if (onlyWithCPF) {
        query = query.not("cpf", "is", null).neq("cpf", "");
      }

      if (debouncedSearch) {
        const t = `%${debouncedSearch}%`;
        // busca simples por nome/telefone/email
        query = query.or(
          `nome.ilike.${t},telefone.ilike.${t},email.ilike.${t}`
        );
      }

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      setClientes((data || []) as any);
      setTotal(count || 0);
      setPage(targetPage);
    } catch (e: any) {
      alert("Erro ao carregar clientes: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, onlyWithCPF]);

  // criar cliente
  async function createCliente() {
    const payload = {
      nome: fNome.trim(),
      cpf: onlyDigits(fCPF) || null,
      telefone: onlyDigits(fTelefone) || null,
      email: fEmail.trim() || null,
      data_nascimento: fNasc || null,
      observacoes: fObs.trim() || null,
    };

    if (!payload.nome) return alert("Informe o nome.");
    setCreating(true);
    try {
      const { error } = await supabase.from("clientes").insert([payload]);
      if (error) throw error;
      setFNome("");
      setFCPF("");
      setFTelefone("");
      setFEmail("");
      setFNasc("");
      setFObs("");
      await load(1);
      alert("Cliente criado!");
    } catch (e: any) {
      alert("Erro ao criar cliente: " + (e?.message || e));
    } finally {
      setCreating(false);
    }
  }

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)),
    [total]
  );

  const showing = useMemo(() => {
    if (!total) return "Nenhum cliente";
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    return `Mostrando ${from}-${to} de ${total}`;
  }, [page, total]);

  // helpers UI
  const waUrl = (tel: string | null) => {
    const d = onlyDigits(tel || "");
    if (!d) return null;
    return `https://wa.me/55${d}`;
  };

  const Badge: React.FC<{ type: "cliente" | "lead" }> = ({ type }) => (
    <span
      className={
        "ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " +
        (type === "cliente"
          ? "bg-green-100 text-green-700 border border-green-200"
          : "bg-slate-100 text-slate-700 border border-slate-200")
      }
      title={type === "cliente" ? "Registro com CPF (Cliente)" : "Sem CPF (Lead)"}
    >
      {type === "cliente" ? "Cliente" : "Lead"}
    </span>
  );

  const WhatsAppIconBtn: React.FC<{ href: string; title?: string }> = ({
    href,
    title = "Abrir no WhatsApp",
  }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition"
    >
      {/* WhatsApp logo (mini SVG) */}
      <svg viewBox="0 0 32 32" width="16" height="16" aria-hidden="true">
        <path
          fill="#10B981"
          d="M27 15.5c0 6.1-5 11-11.1 11-1.9 0-3.7-.5-5.3-1.4L5 26.9l1.8-5.4c-.9-1.6-1.5-3.5-1.5-5.5C5.3 9.9 10.2 5 16 5s10.9 4.9 11 10.5z"
        />
        <path
          fill="#fff"
          d="M13.5 10.7c-.2-.6-.4-.6-.6-.6h-.5c-.2 0-.6.1-.8.4-.3.3-1.1 1.1-1.1 2.7s1.1 3.1 1.3 3.3c.2.3 2.1 3.3 5.2 4.5 2.6 1 3.1.8 3.7.8s1.8-.7 2-1.4.2-1.3.2-1.4c0-.1-.1-.2-.3-.3l-1.1-.5c-.2-.1-.3-.1-.5.1-.1.2-.6.8-.7.9-.2.1-.3.2-.5.1-.2-.1-.8-.3-1.5-.8-1.1-.6-1.8-2.1-2-2.3-.2-.3 0-.4.1-.5.1-.1.2-.3.3-.4.1-.1.1-.2.2-.4 0-.1 0-.3 0-.4 0-.1-.5-1.2-.7-1.6z"
        />
      </svg>
    </a>
  );

  return (
    <div className="space-y-4">
      {/* NOVO CLIENTE */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Novo Cliente</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="h-10 rounded-xl border px-3"
            placeholder="Nome"
            value={fNome}
            onChange={(e) => setFNome(e.target.value)}
          />
          <input
            className="h-10 rounded-xl border px-3"
            placeholder="CPF"
            value={fCPF}
            onChange={(e) => setFCPF(cpfMask(e.target.value))}
            inputMode="numeric"
          />
          <input
            className="h-10 rounded-xl border px-3"
            placeholder="Telefone"
            value={fTelefone}
            onChange={(e) => setFTelefone(phoneMask(e.target.value))}
            inputMode="tel"
          />
          <input
            className="h-10 rounded-xl border px-3"
            placeholder="E-mail"
            value={fEmail}
            onChange={(e) => setFEmail(e.target.value)}
            type="email"
          />
          <input
            className="h-10 rounded-xl border px-3 md:col-span-1"
            placeholder="dd/mm/aaaa"
            value={fNasc}
            onChange={(e) => setFNasc(e.target.value)}
            type="date"
          />
          <input
            className="h-10 rounded-xl border px-3 md:col-span-2"
            placeholder="Observações"
            value={fObs}
            onChange={(e) => setFObs(e.target.value)}
          />
          <button
            onClick={createCliente}
            disabled={creating}
            className="h-10 rounded-xl bg-consulmax-primary font-bold text-white hover:opacity-95 md:col-span-1"
          >
            {creating ? "Salvando..." : "Criar Cliente"}
          </button>
        </div>
      </div>

      {/* LISTA */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <label className="inline-flex select-none items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyWithCPF}
                onChange={(e) => setOnlyWithCPF(e.target.checked)}
              />
              Somente com CPF
            </label>
            <span className="text-xs text-slate-500">{showing}</span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="h-10 w-[280px] rounded-xl border pl-9 pr-3"
              placeholder="Buscar por nome, telefone ou e-mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="p-2">Nome</th>
                <th className="p-2">Telefone</th>
                <th className="p-2">E-mail</th>
                <th className="p-2">Nascimento</th>
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

              {!loading &&
                clientes.map((c, idx) => {
                  const isCliente = !!c.cpf && c.cpf.trim() !== "";
                  const wa = waUrl(c.telefone);

                  return (
                    <tr
                      key={c.id}
                      className={`${
                        idx % 2 ? "bg-slate-50/70" : "bg-white"
                      } border-t`}
                    >
                      {/* NOME + badge + cpf pequenino */}
                      <td className="p-2">
                        <div className="flex items-center">
                          <span className="font-medium">{c.nome}</span>
                          <Badge type={isCliente ? "cliente" : "lead"} />
                        </div>
                        {isCliente && (
                          <div className="text-[11px] text-slate-500">
                            CPF: {cpfMask(c.cpf || "")}
                          </div>
                        )}
                      </td>

                      {/* TELEFONE + botão whatsapp */}
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {c.telefone ? phoneMask(c.telefone) : "—"}
                          {wa && <WhatsAppIconBtn href={wa} />}
                        </div>
                      </td>

                      {/* EMAIL */}
                      <td className="p-2">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="text-sky-700 underline-offset-2 hover:underline"
                          >
                            {c.email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* NASCIMENTO */}
                      <td className="p-2">
                        {c.data_nascimento ? toBRDate(c.data_nascimento) : "—"}
                      </td>

                      {/* AÇÕES (ícones com title) */}
                      <td className="p-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            title="Editar"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border hover:bg-slate-100"
                            onClick={() => alert("TODO: abrir modal de edição")}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            title="Adicionar Evento"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border hover:bg-slate-100"
                            onClick={() =>
                              alert("TODO: abrir modal para criar evento")
                            }
                          >
                            <CalendarPlus className="h-5 w-5" />
                          </button>
                          <button
                            title="Ver na Agenda"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border hover:bg-slate-100"
                            onClick={() =>
                              alert("TODO: navegar para Agenda filtrando cliente")
                            }
                          >
                            <Eye className="h-5 w-5" />
                          </button>
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
          <button
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
          >
            ‹ Anterior
          </button>
          <span className="text-xs text-slate-600">
            Página {page} de {totalPages}
          </span>
          <button
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
          >
            Próxima ›
          </button>
        </div>
      </div>
    </div>
  );
}
