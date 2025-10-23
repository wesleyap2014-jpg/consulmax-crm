import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ExternalLink, Link as LinkIcon, Copy, Eye, EyeOff, Pencil, Trash2, Plus } from "lucide-react";

type LinkUtil = {
  id: string;
  administradora: string;
  sistema: string;
  url: string;
  login?: string | null;
  senha?: string | null;
  notas?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const isUrl = (s: string) => /^https?:\/\//i.test(s || "");

export default function LinksUteisPage() {
  const [loading, setLoading] = useState(false);
  const [itens, setItens] = useState<LinkUtil[]>([]);
  const [search, setSearch] = useState("");
  const [admFilter, setAdmFilter] = useState("");
  const [debounced, setDebounced] = useState("");

  // modal criar/editar
  const [editing, setEditing] = useState<LinkUtil | null>(null);
  const [form, setForm] = useState<Partial<LinkUtil>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, admFilter]);

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("links_uteis")
        .select("*")
        .order("administradora", { ascending: true })
        .order("sistema", { ascending: true });

      if (debounced) {
        q = q.or(
          `administradora.ilike.%${debounced}%,sistema.ilike.%${debounced}%,url.ilike.%${debounced}%,login.ilike.%${debounced}%`
        );
      }
      if (admFilter) q = q.eq("administradora", admFilter);

      const { data, error } = await q;
      if (error) throw error;
      setItens(data || []);
    } catch (e: any) {
      alert(e.message || "Erro ao carregar links.");
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditing(null);
    setForm({ administradora: "", sistema: "", url: "", login: "", senha: "", notas: "" });
  }
  function openEdit(row: LinkUtil) {
    setEditing(row);
    setForm({
      administradora: row.administradora,
      sistema: row.sistema,
      url: row.url,
      login: row.login || "",
      senha: row.senha || "",
      notas: row.notas || "",
    });
  }
  function closeModal() {
    setEditing(null);
    setForm({});
  }

  async function save() {
    const payload: Partial<LinkUtil> = {
      administradora: (form.administradora || "").trim(),
      sistema: (form.sistema || "").trim(),
      url: (form.url || "").trim(),
      login: (form.login || "") || null,
      senha: (form.senha || "") || null,
      notas: (form.notas || "") || null,
    };
    if (!payload.administradora) return alert("Informe a administradora.");
    if (!payload.sistema) return alert("Informe o sistema/portal.");
    if (!payload.url) return alert("Informe o link.");
    if (!isUrl(payload.url)) return alert("O link deve começar com http:// ou https://");

    try {
      setLoading(true);
      if (editing) {
        const { error } = await supabase.from("links_uteis").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("links_uteis").insert(payload);
        if (error) throw error;
      }
      closeModal();
      await load();
    } catch (e: any) {
      alert(e.message || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Remover este link?")) return;
    try {
      setLoading(true);
      const { error } = await supabase.from("links_uteis").delete().eq("id", id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      alert(e.message || "Erro ao excluir.");
    } finally {
      setLoading(false);
    }
  }

  const adms = useMemo(() => Array.from(new Set(itens.map(i => i.administradora))).sort(), [itens]);

  return (
    <div className="space-y-4 p-2 md:p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Links Úteis</h1>
          <p className="text-slate-500 text-sm">Portais de administradoras com acesso rápido.</p>
        </div>
        <button className="btn-primary inline-flex items-center gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              className="input pl-8 w-72"
              placeholder="Buscar (adm, sistema, link, login)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="absolute left-3 top-2.5 opacity-60">🔎</span>
          </div>
          <select className="input w-56" value={admFilter} onChange={(e) => setAdmFilter(e.target.value)}>
            <option value="">Todas as Administradoras</option>
            {adms.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="text-slate-500 text-sm">{itens.length} link(s)</div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="rounded-xl border overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Administradora</th>
                <th className="p-2 text-left">Sistema/Portal</th>
                <th className="p-2 text-left">Link</th>
                <th className="p-2 text-left">Login</th>
                <th className="p-2 text-left">Senha</th>
                <th className="p-2 text-left">Notas</th>
                <th className="p-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="p-3 text-slate-500" colSpan={7}>Carregando…</td></tr>
              )}
              {!loading && itens.length === 0 && (
                <tr><td className="p-3 text-slate-500" colSpan={7}>Nenhum link cadastrado.</td></tr>
              )}
              {itens.map((r, i) => <Row key={r.id} row={r} onEdit={() => openEdit(r)} onDelete={() => del(r.id)} idx={i} />)}
            </tbody>
          </table>
        </div>
      </div>

      {(editing !== null || form.administradora !== undefined) && Object.keys(form).length > 0 && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeModal} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(750px,92vw)] bg-white rounded-2xl shadow-xl p-4">
            <h3 className="font-semibold mb-2">{editing ? "Editar link" : "Novo link"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="input" placeholder="Administradora" value={form.administradora || ""} onChange={(e) => setForm(s => ({ ...s, administradora: e.target.value }))} />
              <input className="input" placeholder="Sistema/Portal" value={form.sistema || ""} onChange={(e) => setForm(s => ({ ...s, sistema: e.target.value }))} />
              <input className="input md:col-span-2" placeholder="Link (https://…)" value={form.url || ""} onChange={(e) => setForm(s => ({ ...s, url: e.target.value }))} />
              <input className="input" placeholder="Login" value={form.login || ""} onChange={(e) => setForm(s => ({ ...s, login: e.target.value }))} />
              <input className="input" placeholder="Senha" value={form.senha || ""} onChange={(e) => setForm(s => ({ ...s, senha: e.target.value }))} />
              <input className="input md:col-span-2" placeholder="Notas (opcional)" value={form.notas || ""} onChange={(e) => setForm(s => ({ ...s, notas: e.target.value }))} />
            </div>
            <div className="mt-3 flex gap-2 justify-end">
              <button className="btn" onClick={closeModal}>Cancelar</button>
              <button className="btn-primary" onClick={save} disabled={loading}>{loading ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </>
      )}

      <style>{`
        .input{padding:10px;border-radius:12px;border:1px solid #e5e7eb;outline:none}
        .btn{padding:8px 12px;border-radius:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:600}
        .btn-primary{padding:10px 16px;border-radius:12px;background:#A11C27;color:#fff;font-weight:800}
        .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc}
        .icon-btn:hover{background:#eef2ff}
      `}</style>
    </div>
  );
}

function Row({ row, onEdit, onDelete, idx }: { row: LinkUtil; onEdit: () => void; onDelete: () => void; idx: number }) {
  const [showPass, setShowPass] = useState(false);

  const copy = async (text?: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert("Copiado!");
    } catch {
      alert("Não foi possível copiar.");
    }
  };

  return (
    <tr className={idx % 2 ? "bg-slate-50/60" : "bg-white"}>
      <td className="p-2">{row.administradora}</td>
      <td className="p-2">{row.sistema}</td>
      <td className="p-2">
        <a className="inline-flex items-center gap-1 text-[#1E293F] hover:underline" href={row.url} target="_blank" rel="noreferrer">
          <LinkIcon className="h-4 w-4" /> {row.url}
          <ExternalLink className="h-3.5 w-3.5 opacity-70" />
        </a>
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <span>{row.login || "—"}</span>
          {row.login ? (
            <button className="icon-btn" title="Copiar login" onClick={() => copy(row.login)}>
              <Copy className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <span>{row.senha ? (showPass ? row.senha : "••••••••") : "—"}</span>
          {row.senha ? (
            <>
              <button className="icon-btn" title="Mostrar/ocultar senha" onClick={() => setShowPass(v => !v)}>
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button className="icon-btn" title="Copiar senha" onClick={() => copy(row.senha)}>
                <Copy className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>
      </td>
      <td className="p-2">{row.notas || "—"}</td>
      <td className="p-2">
        <div className="flex items-center justify-center gap-2">
          <button className="icon-btn" title="Editar" onClick={onEdit}><Pencil className="h-4 w-4" /></button>
          <button className="icon-btn" title="Excluir" onClick={onDelete}><Trash2 className="h-4 w-4" /></button>
        </div>
      </td>
    </tr>
  );
}
