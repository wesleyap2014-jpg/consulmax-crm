// src/pages/Carteira.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type Lead = { id: string; nome: string; telefone?: string | null; email?: string | null };
type Produto =
  | "Automóvel"
  | "Imóvel"
  | "Serviço"
  | "Motocicleta"
  | "Pesados"
  | "Imóvel Estendido"
  | "Consórcio Ouro";
type FormaVenda = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";
type Administradora = string;

type Venda = {
  id: string;
  lead_id: string;
  cpf: string;
  data_venda: string;
  vendedor_id: string;
  produto: Produto;
  administradora: Administradora;
  forma_venda: FormaVenda;
  numero_proposta: string;
  valor_venda: number;
  tipo_venda: "Normal" | "Contemplada" | "Bolsão";
  descricao: string | null;
  status: "nova" | "encarteirada";
  grupo: string | null;
  cota: string | null;
  codigo: string | null;
  encarteirada_em: string | null;
  contemplada?: boolean | null;
  data_contemplacao?: string | null;
  tabela?: string | null;
  created_at: string;
  segmento?: string | null;
  data_nascimento?: string | null;
};

type UserRow = { id: string; nome: string | null; email: string | null; role?: string | null };

type AppUser = {
  id: string;
  nome: string;
  email?: string | null;
  role?: string | null;
  auth_user_id?: string | null;
};

const PRODUTOS: Produto[] = [
  "Automóvel",
  "Imóvel",
  "Serviço",
  "Motocicleta",
  "Pesados",
  "Imóvel Estendido",
  "Consórcio Ouro",
];

const FORMAS: FormaVenda[] = ["Parcela Cheia", "Reduzida 25%", "Reduzida 50%"];

const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n);

const isAtiva = (codigo: string | null) => (codigo?.trim() ?? "") === "00";

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const formatCPF = (s: string) => {
  const d = onlyDigits(s).slice(0, 11);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)].filter(Boolean);
  return parts.length <= 3 ? parts.join(".") : `${parts[0]}.${parts[1]}.${parts[2]}-${parts[3]}`;
};
const validateCPF = (cpf: string) => {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (factor - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = calc(d.slice(0, 9), 10);
  const d2 = calc(d.slice(0, 10), 11);
  return d1 === parseInt(d[9]) && d2 === parseInt(d[10]);
};

function normalizeProdutoToSegmento(produto: Produto | string | null | undefined): string | null {
  const p = (produto || "").toString().trim();
  if (!p) return null;
  if (p === "Imóvel Estendido") return "Imóvel";
  if (p === "Serviço") return "Serviços";
  return p;
}

type LinhaEncarteirarProps = {
  venda: Venda;
  lead?: Lead;
  canEncarteirar: boolean;
  onSubmit: (vendaId: string, grupo: string, cota: string, codigo: string) => Promise<void>;
  onDelete: (vendaId: string) => Promise<void>;
  onViewVenda: (v: Venda, lead?: Lead) => void;
  onOpenEditarVenda: (v: Venda) => void;
};
const LinhaEncarteirar: React.FC<LinhaEncarteirarProps> = ({
  venda,
  lead,
  canEncarteirar,
  onSubmit,
  onDelete,
  onViewVenda,
  onOpenEditarVenda,
}) => {
  const [grupo, setGrupo] = useState("");
  const [cota, setCota] = useState("");
  const [codigo, setCodigo] = useState("");

  return (
    <tr className="border-t">
      <td className="p-2">
        <div className="flex items-center gap-2">
          <button title="Ver venda" className="text-gray-500 hover:text-gray-800" onClick={() => onViewVenda(venda, lead)}>
            👁️
          </button>
          <div className="font-medium">{lead?.nome ?? "—"}</div>
          <button title="Editar pendente" className="text-gray-500 hover:text-gray-800" onClick={() => onOpenEditarVenda(venda)}>
            ✏️
          </button>
        </div>
        <div className="text-xs text-gray-500">{lead?.telefone ?? "—"}</div>
      </td>
      <td className="p-2">{venda.administradora}</td>
      <td className="p-2">{venda.numero_proposta}</td>
      <td className="p-2">
        <input value={grupo} onChange={(e) => setGrupo(e.target.value)} className="border rounded px-2 py-1 w-28" disabled={!canEncarteirar} />
      </td>
      <td className="p-2">
        <input value={cota} onChange={(e) => setCota(e.target.value)} className="border rounded px-2 py-1 w-20" disabled={!canEncarteirar} />
      </td>
      <td className="p-2">
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="border rounded px-2 py-1 w-20" disabled={!canEncarteirar} />
      </td>
      <td className="p-2">{currency(venda.valor_venda ?? 0)}</td>
      <td className="p-2">
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded ${canEncarteirar ? "bg-[#A11C27] text-white hover:opacity-90" : "bg-gray-200 text-gray-500 cursor-not-allowed"}`}
            disabled={!canEncarteirar}
            onClick={() => onSubmit(venda.id, grupo, cota, codigo)}
          >
            ENCARTEIRAR
          </button>
          <button
            className="px-3 py-1 rounded border hover:bg-gray-50"
            onClick={() => {
              if (confirm("Excluir este lançamento? Essa ação não pode ser desfeita.")) onDelete(venda.id);
            }}
          >
            Excluir
          </button>
        </div>
      </td>
    </tr>
  );
};

type LinhaCotaProps = {
  venda: Venda;
  onSave: (patch: Partial<Venda>) => Promise<void>;
  onViewVenda: (v: Venda) => void;
  isAdmin: boolean;
};
const LinhaCota: React.FC<LinhaCotaProps> = ({ venda, onSave, onViewVenda, isAdmin }) => {
  const ativa = isAtiva(venda.codigo);
  const [edit, setEdit] = useState(false);
  const [grupo, setGrupo] = useState(venda.grupo ?? "");
  const [cota, setCota] = useState(venda.cota ?? "");
  const [codigo, setCodigo] = useState(venda.codigo ?? "");
  const [valor, setValor] = useState<number>(venda.valor_venda);
  const [adm, setAdm] = useState<Administradora>(venda.administradora);
  const [flagCont, setFlagCont] = useState<boolean>(!!venda.contemplada);
  const [dataCont, setDataCont] = useState<string>(venda.data_contemplacao ?? "");

  const saveEdit = async () => {
    setEdit(false);
    const segmento = normalizeProdutoToSegmento(venda.produto);
    await onSave({ grupo, cota, codigo, valor_venda: valor, administradora: adm, segmento: segmento ?? undefined });
  };
  const saveContemplacao = async () => {
    if (flagCont && !dataCont) {
      alert("Informe a data da contemplação.");
      return;
    }
    await onSave({ contemplada: flagCont, data_contemplacao: flagCont ? dataCont : null });
  };

  return (
    <tr className="border-t">
      <td className="p-2">
        <span className={`px-2 py-1 rounded-full text-xs ${ativa ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{ativa ? "Ativa" : "Cancelada"}</span>
      </td>
      <td className="p-2">
        {edit ? (
          <select className="border rounded px-2 py-1" value={adm} onChange={(e) => setAdm(e.target.value as Administradora)}>
            <option value={adm}>{adm}</option>
          </select>
        ) : (
          venda.administradora
        )}
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <button title="Ver venda" className="text-gray-500 hover:text-gray-800" onClick={() => onViewVenda(venda)}>
            👁️
          </button>
          <span>{venda.numero_proposta}</span>
        </div>
      </td>
      <td className="p-2">{venda.produto}</td>
      <td className="p-2">{edit ? <input className="border rounded px-2 py-1 w-24" value={grupo} onChange={(e) => setGrupo(e.target.value)} /> : venda.grupo ?? "—"}</td>
      <td className="p-2">{edit ? <input className="border rounded px-2 py-1 w-20" value={cota} onChange={(e) => setCota(e.target.value)} /> : venda.cota ?? "—"}</td>
      <td className="p-2">{edit ? <input className="border rounded px-2 py-1 w-20" value={codigo} onChange={(e) => setCodigo(e.target.value)} /> : venda.codigo ?? "—"}</td>
      <td className="p-2">{edit ? <input className="border rounded px-2 py-1 w-28" value={valor} onChange={(e) => setValor(Number(e.target.value))} type="number" step="0.01" /> : currency(venda.valor_venda ?? 0)}</td>
      <td className="p-2">
        {isAdmin ? (
          edit ? (
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded bg-[#1E293F] text-white hover:opacity-90" onClick={saveEdit}>
                Salvar
              </button>
              <button className="px-3 py-1 rounded border" onClick={() => setEdit(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button className="px-3 py-1 rounded border" onClick={() => setEdit(true)}>
              ✏️ Editar
            </button>
          )
        ) : (
          <span className="text-xs text-gray-400">Somente admin edita</span>
        )}
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <label className="text-sm">
            <input type="checkbox" className="mr-1" checked={flagCont} onChange={(e) => setFlagCont(e.target.checked)} />
            Contemplada
          </label>
          {flagCont && (
            <>
              <input type="date" className="border rounded px-2 py-1" value={dataCont} onChange={(e) => setDataCont(e.target.value)} />
              <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={saveContemplacao}>
                Salvar
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

type ClienteGroup = { cliente: Lead; itens: Venda[]; totalAtivas: number; qtdAtivas: number; segmentos: Set<string> };
type ClienteBlocoProps = {
  group: ClienteGroup;
  onSaveVenda: (v: Venda, patch: Partial<Venda>) => Promise<void>;
  onViewVenda: (v: Venda) => void;
  isAdmin: boolean;
};
const ClienteBloco: React.FC<ClienteBlocoProps> = ({ group, onSaveVenda, onViewVenda, isAdmin }) => {
  const [open, setOpen] = useState(false);
  const segs = Array.from(group.segmentos).join("; ");
  return (
    <div className="border rounded-2xl p-4">
      <div className="w-full flex items-center justify-between">
        <button className="text-left" onClick={() => setOpen((o) => !o)}>
          <div className="font-medium">
            {group.cliente.nome}
            <span className="text-xs text-gray-500 ml-2">{group.cliente.telefone ?? ""}</span>
          </div>
          <div className="text-sm text-gray-600">
            Total Ativas: <strong>{currency(group.totalAtivas)}</strong> • Qtd: <strong>{group.qtdAtivas}</strong> • Segmentos: {segs}
          </div>
        </button>
        <button title="Ver descrições" className="text-gray-500 hover:text-gray-800" onClick={() => setOpen(true)}>
          👁️
        </button>
      </div>
      {open && (
        <div className="mt-3 overflow-auto">
          <table className="min-w-[1100px] w-full border border-gray-200 rounded-xl">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Adm</th>
                <th className="text-left p-2">Proposta</th>
                <th className="text-left p-2">Segmento</th>
                <th className="text-left p-2">Grupo</th>
                <th className="text-left p-2">Cota</th>
                <th className="text-left p-2">Código</th>
                <th className="text-left p-2">Valor</th>
                <th className="text-left p-2">Editar</th>
                <th className="text-left p-2">Contemplação</th>
              </tr>
            </thead>
            <tbody>
              {group.itens.map((v) => (
                <LinhaCota key={v.id} venda={v} onSave={(patch) => onSaveVenda(v, patch)} onViewVenda={onViewVenda} isAdmin={isAdmin} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Carteira: React.FC = () => {
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadMap, setLeadMap] = useState<Record<string, Lead>>({});
  const [pendentes, setPendentes] = useState<Venda[]>([]);
  const [encarteiradas, setEncarteiradas] = useState<Venda[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>("");

  const [q, setQ] = useState<string>("");
  const [showCarteira, setShowCarteira] = useState<boolean>(true);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [form, setForm] = useState<Partial<Venda>>({
    cpf: "",
    data_venda: new Date().toISOString().slice(0, 10),
    produto: "Automóvel",
    administradora: "",
    forma_venda: "Parcela Cheia",
    tipo_venda: "Normal",
    descricao: "",
    grupo: "",
    tabela: "",
    data_nascimento: "",
  });

  const [editVendaModal, setEditVendaModal] = useState<{ open: boolean; venda?: Venda }>({ open: false });
  const [viewVendaModal, setViewVendaModal] = useState<{ open: boolean; venda?: Venda; lead?: Lead }>({ open: false });

  const [descModal, setDescModal] = useState<{ open: boolean; title: string; text: string }>({ open: false, title: "", text: "" });

  const [simAdmins, setSimAdmins] = useState<Array<{ id: string; name: string }>>([]);
  const [simTables, setSimTables] = useState<
    Array<{ id: string; admin_id: string; segmento: string; nome_tabela: string; faixa_min?: number | null; faixa_max?: number | null; prazo_limite?: number | null }>
  >([]);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [metaOverlay, setMetaOverlay] = useState<{ open: boolean }>({ open: false });
  const [metaForm, setMetaForm] = useState<{ vendedor_id: string; ano: number; m: number[] }>({
    vendedor_id: "",
    ano: new Date().getFullYear(),
    m: Array(12).fill(0),
  });

  const [selectedSeller, setSelectedSeller] = useState<string>(""); // admin pode escolher; vendedor fixa no próprio
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [metaMensal, setMetaMensal] = useState<number[]>(Array(12).fill(0));
  const [realizadoMensal, setRealizadoMensal] = useState<number[]>(Array(12).fill(0));
  const metaAnual = useMemo(() => metaMensal.reduce((a, b) => a + b, 0), [metaMensal]);
  const realizadoAnual = useMemo(() => realizadoMensal.reduce((a, b) => a + b, 0), [realizadoMensal]);
  const pct = metaAnual > 0 ? Math.max(0, Math.min(100, Math.round((realizadoAnual / metaAnual) * 100))) : 0;

  useEffect(() => {
    setForm((f) => ({ ...f, tabela: "" }));
  }, [form.produto]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id ?? "";
        const uemail = authData.user?.email ?? "";
        setUserId(uid);
        setUserEmail(uemail);
        setUserName(authData.user?.user_metadata?.nome ?? uemail ?? "Vendedor");

        let adminFlag = false;
        try {
          const { data } = await supabase.from("users").select("email, role").eq("email", uemail).maybeSingle();
          adminFlag = (data?.role ?? "").toString().toLowerCase() === "admin";
        } catch {}
        setIsAdmin(adminFlag);

        const { data: lds } = await supabase.from("leads").select("id,nome,telefone,email").order("nome", { ascending: true });
        const leadsArr = lds ?? [];
        setLeads(leadsArr);
        setLeadMap(Object.fromEntries(leadsArr.map((l: any) => [l.id, l])));

        const pendQuery = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
        const encQuery = supabase.from("vendas").select("*").eq("status", "encarteirada").order("created_at", { ascending: false });
        if (!adminFlag) {
          pendQuery.eq("vendedor_id", uid);
          encQuery.eq("vendedor_id", uid);
        }
        const [{ data: pend }, { data: enc }] = await Promise.all([pendQuery, encQuery]);
        setPendentes(pend ?? []);
        setEncarteiradas(enc ?? []);

        const [{ data: admins }, { data: tables }, { data: us }] = await Promise.all([
       supabase.from("sim_admins").select("id,name").order("name", { ascending: true }),
       supabase.from("sim_tables").select("id,admin_id,segmento,nome_tabela,faixa_min,faixa_max,prazo_limite"),
      supabase.from("users").select("id,nome,email,role,auth_user_id").order("nome", { ascending: true }),
     ]);
      setSimAdmins(admins ?? []);
      setSimTables(tables ?? []);
      setUsers((us ?? []) as AppUser[]);

        setSelectedSeller(adminFlag ? "" : uid);
      } catch (e: any) {
        setErr(e.message || "Falha ao carregar Carteira.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pendentesComNome = useMemo(() => pendentes.map((v) => ({ venda: v, lead: leadMap[v.lead_id] })), [pendentes, leadMap]);

  const encarteiradasFiltradas = useMemo(() => {
    if (!q.trim()) return encarteiradas;
    const s = q.toLowerCase();
    return encarteiradas.filter((v) => leadMap[v.lead_id]?.nome?.toLowerCase().includes(s));
  }, [q, encarteiradas, leadMap]);

  const totalAtivas = useMemo(() => encarteiradas.reduce((a, v) => (isAtiva(v.codigo) ? a + (v.valor_venda || 0) : a), 0), [encarteiradas]);
  const totalCanceladas = useMemo(() => encarteiradas.reduce((a, v) => (!isAtiva(v.codigo) ? a + (v.valor_venda || 0) : a), 0), [encarteiradas]);
  const totalContempladas = useMemo(() => encarteiradas.reduce((a, v) => (v.contemplada ? a + (v.valor_venda || 0) : a), 0), [encarteiradas]);

  const porCliente: ClienteGroup[] = useMemo(() => {
    const map: Record<string, ClienteGroup> = {};
    for (const v of encarteiradasFiltradas) {
      const lead = leadMap[v.lead_id];
      if (!lead) continue;
      if (!map[lead.id]) map[lead.id] = { cliente: lead, itens: [], totalAtivas: 0, qtdAtivas: 0, segmentos: new Set() };
      map[lead.id].itens.push(v);
      if (isAtiva(v.codigo)) {
        map[lead.id].totalAtivas += v.valor_venda || 0;
        map[lead.id].qtdAtivas += 1;
      }
      map[lead.id].segmentos.add(v.produto);
    }
    return Object.values(map).sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR", { sensitivity: "base" }));
  }, [encarteiradasFiltradas, leadMap]);

  const onFormChange = (k: keyof Venda, val: any) => setForm((f) => ({ ...f, [k]: val }));

  async function insertVenda(payload: any) {
    let { error } = await supabase.from("vendas").insert(payload as any);
    if (error && /data_nascimento/.test(error.message || "")) {
      const { error: e2 } = await supabase.from("vendas").insert({ ...payload, data_nascimento: undefined } as any);
      if (e2) throw e2;
    } else if (error) throw error;
  }
  async function updateVenda(id: string, patch: any) {
    let { error } = await supabase.from("vendas").update(patch as any).eq("id", id);
    if (error && /data_nascimento/.test(error.message || "")) {
      const { error: e2 } = await supabase.from("vendas").update({ ...patch, data_nascimento: undefined } as any).eq("id", id);
      if (e2) throw e2;
    } else if (error) throw error;
  }

  const prefillFromLead = async (leadId: string) => {
    if (!leadId) return;
    const { data: cliente } = await supabase.from("clientes").select("cpf,data_nascimento").eq("lead_id", leadId).maybeSingle();
    if (cliente?.cpf || cliente?.data_nascimento) {
      setForm((f) => ({ ...f, cpf: cliente.cpf ?? f.cpf, data_nascimento: cliente.data_nascimento ?? f.data_nascimento }));
      return;
    }
    const { data: lastVenda } = await supabase
      .from("vendas")
      .select("cpf,data_nascimento,administradora,produto,tabela")
      .eq("lead_id", leadId)
      .eq("status", "encarteirada")
      .order("encarteirada_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastVenda) {
      setForm((f) => ({
        ...f,
        cpf: lastVenda.cpf ?? f.cpf,
        data_nascimento: lastVenda.data_nascimento ?? f.data_nascimento,
        administradora: lastVenda.administradora ?? f.administradora,
        produto: (lastVenda.produto as Produto) ?? f.produto,
        tabela: lastVenda.tabela ?? f.tabela,
      }));
    }
  };

  const registrarVenda = async () => {
    try {
      if (!form.lead_id) throw new Error("Selecione o Lead.");
      if (!form.cpf?.trim()) throw new Error("CPF é obrigatório.");
      if (!validateCPF(form.cpf)) throw new Error("CPF inválido.");
      if (!form.numero_proposta?.trim()) throw new Error("Número da proposta é obrigatório.");
      const valor = Number((form.valor_venda as any)?.toString().replace(/\./g, "").replace(",", "."));
      if (Number.isNaN(valor)) throw new Error("Valor inválido.");

      const segmento = normalizeProdutoToSegmento(form.produto as Produto);
      const payload: Partial<Venda> = {
        lead_id: form.lead_id,
        cpf: onlyDigits(form.cpf!),
        data_venda: form.data_venda!,
        vendedor_id: userId,
        produto: form.produto as Produto,
        administradora: (form.administradora as Administradora) || "",
        forma_venda: form.forma_venda as FormaVenda,
        numero_proposta: form.numero_proposta!,
        valor_venda: valor,
        tipo_venda: (form.tipo_venda as any) ?? "Normal",
        descricao: form.descricao ?? "",
        status: "nova",
        tabela: form.tabela || null,
        segmento: segmento ?? undefined,
        data_nascimento: form.data_nascimento || null,
        grupo: form.tipo_venda === "Bolsão" ? form.grupo || "" : null,
        codigo: "00",
      };
      if (form.tipo_venda === "Bolsão" && !form.grupo?.trim()) throw new Error("Informe o número do Grupo (Bolsão).");

      await insertVenda(payload);
      const pendQuery = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
      if (!isAdmin) pendQuery.eq("vendedor_id", userId);
      const { data: pend } = await pendQuery;
      setPendentes(pend ?? []);
      setForm({
        cpf: "",
        data_venda: new Date().toISOString().slice(0, 10),
        produto: "Automóvel",
        administradora: simAdmins[0]?.name ?? "",
        forma_venda: "Parcela Cheia",
        tipo_venda: "Normal",
        descricao: "",
        grupo: "",
        tabela: "",
        data_nascimento: "",
      });
      setShowModal(false);
    } catch (e: any) {
      alert(e.message ?? "Erro ao registrar venda.");
    }
  };

  const encarteirar = async (vendaId: string, grupo: string, cota: string, codigo: string) => {
    try {
      if (!isAdmin) throw new Error("Somente administradores podem encarteirar.");
      if (!grupo?.trim() || !cota?.trim() || !codigo?.trim()) throw new Error("Preencha Grupo, Cota e Código.");

      const { data: vOne, error: selErr } = await supabase.from("vendas").select("produto").eq("id", vendaId).maybeSingle();
      if (selErr) throw selErr;
      const segmento = normalizeProdutoToSegmento(vOne?.produto as Produto);

      const { error } = await supabase
        .from("vendas")
        .update({ grupo, cota, codigo, status: "encarteirada", encarteirada_em: new Date().toISOString(), segmento: segmento ?? undefined })
        .eq("id", vendaId);
      if (error) throw error;

      const [{ data: pend }, { data: enc }] = await Promise.all([
        (async () => {
          const q = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
          if (!isAdmin) q.eq("vendedor_id", userId);
          return await q;
        })(),
        (async () => {
          const q = supabase.from("vendas").select("*").eq("status", "encarteirada").order("created_at", { ascending: false });
          if (!isAdmin) q.eq("vendedor_id", userId);
          return await q;
        })(),
      ]);
      setPendentes(pend ?? []);
      setEncarteiradas(enc ?? []);
      await loadMetrics(selectedSeller, selectedYear);
    } catch (e: any) {
      alert(e.message ?? "Erro ao encarteirar.");
    }
  };

  const excluirVenda = async (vendaId: string) => {
    try {
      const { error } = await supabase.from("vendas").delete().eq("id", vendaId);
      if (error) throw error;
      const pendQuery = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
      if (!isAdmin) pendQuery.eq("vendedor_id", userId);
      const { data: pend } = await pendQuery;
      setPendentes(pend ?? []);
    } catch (e: any) {
      alert(e.message ?? "Erro ao excluir.");
    }
  };

  const salvarEdicao = async (v: Venda, patch: Partial<Venda>) => {
    try {
      const seg = normalizeProdutoToSegmento(v.produto);
      await updateVenda(v.id, { ...patch, segmento: seg ?? undefined });
      const encQuery = supabase.from("vendas").select("*").eq("status", "encarteirada").order("created_at", { ascending: false });
      if (!isAdmin) encQuery.eq("vendedor_id", userId);
      const { data: enc } = await encQuery;
      setEncarteiradas(enc ?? []);
      await loadMetrics(selectedSeller, selectedYear);
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar edição.");
    }
  };

  const salvarEdicaoPendente = async (venda: Venda, novo: Partial<Venda>) => {
    try {
      if (novo.cpf && !validateCPF(novo.cpf)) throw new Error("CPF inválido.");
      if (novo.numero_proposta && !novo.numero_proposta.trim()) throw new Error("Informe o número da proposta.");
      const patch: any = { ...novo };
      if (patch.cpf) patch.cpf = onlyDigits(patch.cpf);
      if (patch.valor_venda != null) {
        const valor = Number(patch.valor_venda);
        if (Number.isNaN(valor)) throw new Error("Valor inválido.");
        patch.valor_venda = valor;
      }
      if (patch.produto) patch.segmento = normalizeProdutoToSegmento(patch.produto as Produto);
      await updateVenda(venda.id, patch);
      const pendQuery = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
      if (!isAdmin) pendQuery.eq("vendedor_id", userId);
      const { data: pend } = await pendQuery;
      setPendentes(pend ?? []);
      setEditVendaModal({ open: false, venda: undefined });
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar.");
    }
  };

  const tabelaOptions = useMemo(() => {
    const prod = (form.produto as Produto) || "Automóvel";
    const admName = (form.administradora as string) || "";
    const admId = simAdmins.find((a) => a.name === admName)?.id;
    return simTables.filter((t) => (!admId || t.admin_id === admId) && (t.segmento === prod || t.segmento === normalizeProdutoToSegmento(prod)));
  }, [form.produto, form.administradora, simTables, simAdmins]);

  const adminOptions = useMemo(() => simAdmins.map((a) => a.name), [simAdmins]);

  const onSelectLead = async (leadId: string) => {
    onFormChange("lead_id", leadId);
    await prefillFromLead(leadId);
  };

  const loadMetrics = async (sellerId: string, year: number) => {
  if (sellerId) {
    const { data: metasRow } = await supabase
      .from("metas_vendedores")
      .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
      .eq("vendedor_id", sellerId)
      .eq("ano", year)
      .maybeSingle();

    const m = metasRow
      ? [
          metasRow.m01, metasRow.m02, metasRow.m03, metasRow.m04, metasRow.m05, metasRow.m06,
          metasRow.m07, metasRow.m08, metasRow.m09, metasRow.m10, metasRow.m11, metasRow.m12,
        ].map((x: any) => Number(x || 0))
      : Array(12).fill(0);
    setMetaMensal(m);
  } else {
    const { data: metasAll } = await supabase
      .from("metas_vendedores")
      .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
      .eq("ano", year);

    const sum = Array(12).fill(0);
    (metasAll ?? []).forEach((row: any) => {
      const arr = [
        row.m01, row.m02, row.m03, row.m04, row.m05, row.m06,
        row.m07, row.m08, row.m09, row.m10, row.m11, row.m12,
      ].map((x: any) => Number(x || 0));
      for (let i = 0; i < 12; i++) sum[i] += arr[i];
    });
    setMetaMensal(sum);
  }

  const ativasBase = supabase
    .from("vendas")
    .select("valor_venda, encarteirada_em, vendedor_id, codigo, status")
    .eq("status", "encarteirada")
    .eq("codigo", "00")
    .gte("encarteirada_em", `${year}-01-01`)
    .lte("encarteirada_em", `${year}-12-31T23:59:59`);

  const cancBase = supabase
    .from("vendas")
    .select("valor_venda, cancelada_em, vendedor_id, codigo, status")
    .eq("status", "encarteirada")
    .neq("codigo", "00")
    .gte("cancelada_em", `${year}-01-01`)
    .lte("cancelada_em", `${year}-12-31T23:59:59`);

  const qAtivas = sellerId ? ativasBase.eq("vendedor_id", sellerId) : ativasBase;
  const qCanc = sellerId ? cancBase.eq("vendedor_id", sellerId) : cancBase;

  const [{ data: vendasAtivas }, { data: vendasCanc }] = await Promise.all([qAtivas, qCanc]);

  const vendido = Array(12).fill(0);
  (vendasAtivas ?? []).forEach((v: any) => {
    const d = v.encarteirada_em ? new Date(v.encarteirada_em) : null;
    if (!d || isNaN(d.getTime())) return;
    vendido[d.getMonth()] += Number(v.valor_venda || 0);
  });

  const cancelado = Array(12).fill(0);
  (vendasCanc ?? []).forEach((v: any) => {
    const d = v.cancelada_em ? new Date(v.cancelada_em) : null;
    if (!d || isNaN(d.getTime())) return;
    cancelado[d.getMonth()] += Number(v.valor_venda || 0);
  });

  const realizado = vendido.map((v: number, i: number) => v - cancelado[i]);
  setRealizadoMensal(realizado);
};

  useEffect(() => {
  loadMetrics(selectedSeller, selectedYear);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedSeller, selectedYear]);

  const donutData = useMemo(() => {
    const reached = Math.max(0, Math.min(realizadoAnual, metaAnual));
    const remaining = Math.max(0, metaAnual - reached);
    return [
      { name: "Atingido", value: reached },
      { name: "Restante", value: remaining },
    ];
  }, [metaAnual, realizadoAnual]);

  const lineData = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        name: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][i],
        Meta: metaMensal[i] || 0,
        Realizado: realizadoMensal[i] || 0,
      })),
    [metaMensal, realizadoMensal]
  );

  const handleOpenMeta = () => {
    const baseSeller = isAdmin ? "" : userId;
    setMetaForm({ vendedor_id: baseSeller, ano: selectedYear, m: Array.from(metaMensal) });
    setMetaOverlay({ open: true });
  };

  const saveMeta = async () => {
    try {
      if (!isAdmin) throw new Error("Somente administradores podem cadastrar metas.");
      if (!metaForm.vendedor_id) throw new Error("Selecione o vendedor.");
      const payload: any = {
        vendedor_id: metaForm.vendedor_id,
        ano: metaForm.ano,
        m01: metaForm.m[0],
        m02: metaForm.m[1],
        m03: metaForm.m[2],
        m04: metaForm.m[3],
        m05: metaForm.m[4],
        m06: metaForm.m[5],
        m07: metaForm.m[6],
        m08: metaForm.m[7],
        m09: metaForm.m[8],
        m10: metaForm.m[9],
        m11: metaForm.m[10],
        m12: metaForm.m[11],
      };
      const { data: exists } = await supabase.from("metas_vendedores").select("id").eq("vendedor_id", metaForm.vendedor_id).eq("ano", metaForm.ano).maybeSingle();
      if (exists?.id) {
        const { error } = await supabase.from("metas_vendedores").update(payload).eq("id", exists.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("metas_vendedores").insert(payload);
        if (error) throw error;
      }
      setMetaOverlay({ open: false });
      if ((isAdmin ? selectedSeller : userId) === metaForm.vendedor_id && selectedYear === metaForm.ano) {
        setMetaMensal([...metaForm.m]);
      }
    } catch (e: any) {
      alert(e.message || "Erro ao salvar metas.");
    }
  };

  const openViewVenda = (v: Venda, lead?: Lead) => setViewVendaModal({ open: true, venda: v, lead });

  if (loading) return <div className="p-6 text-sm text-gray-600">Carregando carteira…</div>;
  if (err) return <div className="p-6 text-red-600">Erro: {err}</div>;

  const tabelaOptionsForForm = tabelaOptions;
  const adminNames = adminOptions.length ? adminOptions : ["Embracon", "Banco do Brasil", "HS Consórcios", "Âncora", "Maggi"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Carteira</h1>
          <p className="text-gray-500 text-sm">Gerencie vendas e encarteiramento.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90">
            + Nova Venda
          </button>
          <button onClick={handleOpenMeta} className="px-4 py-2 rounded-xl border hover:bg-gray-50">
            Cadastrar Meta
          </button>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Metas</h2>
          <div className="flex items-center gap-2">
            <select
              className="border rounded-xl px-3 py-2"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const y = new Date().getFullYear() - 1 + i;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
            {isAdmin && (
  <select
    className="border rounded-xl px-3 py-2"
    value={selectedSeller}
    onChange={(e) => setSelectedSeller(e.target.value)}
  >
    <option value="">Todos (selecione um vendedor)</option>
    {users.map((u) => (
      <option key={u.id} value={u.auth_user_id ?? u.id}>
        {u.nome || u.email || u.id}
      </option>
    ))}
  </select>
)}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="border rounded-2xl p-4 flex items-center justify-center relative">
            <div className="absolute top-3 left-4 text-sm text-gray-500">Meta anual: {currency(metaAnual)}</div>
            <div className="absolute top-3 right-4 text-sm text-gray-500">Atingido: {currency(realizadoAnual)}</div>
            <div className="w-full h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={donutData} innerRadius={80} outerRadius={110} dataKey="value">
                    <Cell key="atingido" fill="#1E293F" />
                    <Cell key="restante" fill="#A11C27" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-2xl font-semibold">{pct}%</div>
            </div>
          </div>
          <div className="lg:col-span-2 border rounded-2xl p-4">
            <div className="w-full h-64">
              <ResponsiveContainer>
                <LineChart data={lineData} margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => currency(Number(v || 0))} />
                  <Legend />
                  <Line type="monotone" dataKey="Realizado" stroke="#1E293F" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="Meta" stroke="#A11C27" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar cliente pelo nome…" className="w-full border rounded-xl px-3 py-2 outline-none focus:ring" />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Encarteirar</h2>
          <span className="text-sm text-gray-500">{pendentes.length} nova(s) venda(s)</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[860px] w-full border border-gray-200 rounded-xl">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Cliente</th>
                <th className="text-left p-2">Adm</th>
                <th className="text-left p-2">Proposta</th>
                <th className="text-left p-2">Grupo</th>
                <th className="text-left p-2">Cota</th>
                <th className="text-left p-2">Código</th>
                <th className="text-left p-2">Valor</th>
                <th className="text-left p-2 w-56">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pendentesComNome.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={8}>
                    Sem novas vendas para encarteirar.
                  </td>
                </tr>
              )}
              {pendentesComNome.map(({ venda, lead }) => (
                <LinhaEncarteirar
                  key={venda.id}
                  venda={venda}
                  lead={lead}
                  canEncarteirar={isAdmin}
                  onSubmit={encarteirar}
                  onDelete={excluirVenda}
                  onViewVenda={(v, l) => openViewVenda(v, l)}
                  onOpenEditarVenda={(v) => setEditVendaModal({ open: true, venda: v })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <div className="px-4 py-3 rounded-2xl bg-[#1E293F] text-white">
          Ativas: <strong className="ml-1">{currency(totalAtivas)}</strong>
        </div>
        <div className="px-4 py-3 rounded-2xl bg-gray-100">
          Canceladas: <strong className="ml-1">{currency(totalCanceladas)}</strong>
        </div>
        <div className="px-4 py-3 rounded-2xl bg-amber-100 text-amber-900">
          Contempladas: <strong className="ml-1">{currency(totalContempladas)}</strong>
        </div>
        <button className="ml-auto px-4 py-2 rounded-xl border hover:bg-gray-50" onClick={() => setShowCarteira((s) => !s)}>
          {showCarteira ? "Ocultar carteira" : "Mostrar carteira"}
        </button>
      </div>

      {showCarteira && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Carteira</h2>
          {porCliente.length === 0 && <div className="text-gray-500">Nenhuma cota encarteirada ainda.</div>}
          {porCliente.map((group) => (
            <ClienteBloco key={group.cliente.id} group={group} onSaveVenda={salvarEdicao} isAdmin={isAdmin} onViewVenda={(v) => openViewVenda(v, leadMap[v.lead_id])} />
          ))}
        </section>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Nova Venda</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Pessoa (Lead)</label>
                <select className="w-full border rounded-xl px-3 py-2" value={form.lead_id ?? ""} onChange={(e) => onSelectLead(e.target.value)}>
                  <option value="">Selecione um lead…</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} {l.telefone ? `• ${l.telefone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Telefone</label>
                <input className="w-full border rounded-xl px-3 py-2 bg-gray-50" value={leadMap[form.lead_id as string]?.telefone ?? ""} readOnly />
              </div>
              <div>
                <label className="text-sm text-gray-600">CPF *</label>
                <input className="w-full border rounded-xl px-3 py-2" value={formatCPF(form.cpf ?? "")} onChange={(e) => onFormChange("cpf", e.target.value)} placeholder="000.000.000-00" />
              </div>

              <div>
                <label className="text-sm text-gray-600">Data da Venda</label>
                <input type="date" className="w-full border rounded-xl px-3 py-2" value={form.data_venda ?? ""} onChange={(e) => onFormChange("data_venda", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Data de Nascimento</label>
                <input type="date" className="w-full border rounded-xl px-3 py-2" value={form.data_nascimento ?? ""} onChange={(e) => onFormChange("data_nascimento", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Vendedor</label>
                <input className="w-full border rounded-xl px-3 py-2 bg-gray-50" value={userName} readOnly />
              </div>

              <div>
                <label className="text-sm text-gray-600">Produto (Segmento)</label>
                <select className="w-full border rounded-xl px-3 py-2" value={form.produto as Produto} onChange={(e) => onFormChange("produto", e.target.value as Produto)}>
                  {PRODUTOS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Administradora</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={(form.administradora as string) ?? ""}
                  onChange={(e) => onFormChange("administradora", e.target.value)}
                >
                  <option value="">{adminNames.length ? "Selecione a administradora…" : "Selecione a administradora…"}</option>
                  {adminNames.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Tabela</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.tabela ?? ""}
                  onChange={(e) => onFormChange("tabela", e.target.value)}
                  disabled={tabelaOptionsForForm.length === 0}
                >
                  <option value="">{tabelaOptionsForForm.length ? "Selecione a tabela…" : "Sem tabelas para este segmento"}</option>
                  {tabelaOptionsForForm.map((t) => (
                    <option key={t.id} value={t.nome_tabela}>
                      {t.nome_tabela}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Forma da Venda</label>
                <select className="w-full border rounded-xl px-3 py-2" value={form.forma_venda as FormaVenda} onChange={(e) => onFormChange("forma_venda", e.target.value as FormaVenda)}>
                  {FORMAS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Número da Proposta *</label>
                <input className="w-full border rounded-xl px-3 py-2" value={form.numero_proposta ?? ""} onChange={(e) => onFormChange("numero_proposta", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Valor da Venda</label>
                <input className="w-full border rounded-xl px-3 py-2" value={(form.valor_venda as any) ?? ""} onChange={(e) => onFormChange("valor_venda", e.target.value)} placeholder="R$ 0,00" />
              </div>

              <div>
                <label className="text-sm text-gray-600">Tipo da Venda</label>
                <select className="w-full border rounded-xl px-3 py-2" value={form.tipo_venda ?? "Normal"} onChange={(e) => onFormChange("tipo_venda", e.target.value)}>
                  <option>Normal</option>
                  <option>Contemplada</option>
                  <option>Bolsão</option>
                </select>
              </div>

              {form.tipo_venda === "Bolsão" && (
                <div>
                  <label className="text-sm text-gray-600">Grupo (Bolsão)</label>
                  <input className="w-full border rounded-xl px-3 py-2" value={form.grupo ?? ""} onChange={(e) => onFormChange("grupo", e.target.value)} placeholder="Informe o número do grupo" />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Descrição da Venda</label>
                <textarea className="w-full border rounded-xl px-3 py-2" rows={3} value={form.descricao ?? ""} onChange={(e) => onFormChange("descricao", e.target.value)} placeholder="Estratégias de contemplação, observações…" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl border">
                Cancelar
              </button>
              <button onClick={registrarVenda} className="px-4 py-2 rounded-xl bg-[#A11C27] text-white hover:opacity-90">
                Registrar Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {editVendaModal.open && editVendaModal.venda && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Venda • {editVendaModal.venda.numero_proposta}</h3>
              <button onClick={() => setEditVendaModal({ open: false })} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>
            {(() => {
              const v = editVendaModal.venda!;
              const [tmp, setTmp] = useState<Partial<Venda>>({
                lead_id: v.lead_id,
                cpf: v.cpf,
                data_venda: v.data_venda,
                produto: v.produto,
                administradora: v.administradora,
                forma_venda: v.forma_venda,
                numero_proposta: v.numero_proposta,
                valor_venda: v.valor_venda,
                tipo_venda: v.tipo_venda,
                descricao: v.descricao,
                tabela: v.tabela,
                grupo: v.grupo || "",
                data_nascimento: v.data_nascimento || "",
              });
              const Comp = () => (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="text-sm text-gray-600">Pessoa (Lead)</label>
                      <select className="w-full border rounded-xl px-3 py-2" value={tmp.lead_id ?? ""} onChange={(e) => setTmp((p) => ({ ...p, lead_id: e.target.value }))}>
                        <option value="">Selecione um lead…</option>
                        {leads.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.nome} {l.telefone ? `• ${l.telefone}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">CPF</label>
                      <input className="w-full border rounded-xl px-3 py-2" value={formatCPF(tmp.cpf ?? "")} onChange={(e) => setTmp((p) => ({ ...p, cpf: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Data da Venda</label>
                      <input type="date" className="w-full border rounded-xl px-3 py-2" value={tmp.data_venda ?? ""} onChange={(e) => setTmp((p) => ({ ...p, data_venda: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Data de Nascimento</label>
                      <input type="date" className="w-full border rounded-xl px-3 py-2" value={tmp.data_nascimento ?? ""} onChange={(e) => setTmp((p) => ({ ...p, data_nascimento: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Produto</label>
                      <select className="w-full border rounded-xl px-3 py-2" value={tmp.produto as Produto} onChange={(e) => setTmp((p) => ({ ...p, produto: e.target.value as Produto }))}>
                        {PRODUTOS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Tabela</label>
                      <input className="w-full border rounded-xl px-3 py-2" value={tmp.tabela ?? ""} onChange={(e) => setTmp((p) => ({ ...p, tabela: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Administradora</label>
                      <input className="w-full border rounded-xl px-3 py-2" value={tmp.administradora as string} onChange={(e) => setTmp((p) => ({ ...p, administradora: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Forma da Venda</label>
                      <select className="w-full border rounded-xl px-3 py-2" value={tmp.forma_venda as FormaVenda} onChange={(e) => setTmp((p) => ({ ...p, forma_venda: e.target.value as FormaVenda }))}>
                        {FORMAS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Número da Proposta</label>
                      <input className="w-full border rounded-xl px-3 py-2" value={tmp.numero_proposta ?? ""} onChange={(e) => setTmp((p) => ({ ...p, numero_proposta: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Valor da Venda</label>
                      <input className="w-full border rounded-xl px-3 py-2" value={(tmp.valor_venda as any) ?? ""} onChange={(e) => setTmp((p) => ({ ...p, valor_venda: Number(e.target.value) }))} type="number" step="0.01" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm text-gray-600">Descrição</label>
                      <textarea className="w-full border rounded-xl px-3 py-2" rows={3} value={tmp.descricao ?? ""} onChange={(e) => setTmp((p) => ({ ...p, descricao: e.target.value }))} />
                    </div>
                  </div>
                  <div className="text-right mt-3">
                    <button className="px-4 py-2 rounded-xl border mr-2" onClick={() => setEditVendaModal({ open: false })}>
                      Cancelar
                    </button>
                    <button className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90" onClick={() => salvarEdicaoPendente(v, tmp)}>
                      Salvar
                    </button>
                  </div>
                </>
              );
              return <Comp />;
            })()}
          </div>
        </div>
      )}

      {viewVendaModal.open && viewVendaModal.venda && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Detalhes da Venda</h3>
              <button onClick={() => setViewVendaModal({ open: false })} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>
            {(() => {
              const v = viewVendaModal.venda!;
              const lead = viewVendaModal.lead;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Cliente</div>
                    <div>{lead?.nome ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Telefone</div>
                    <div>{lead?.telefone ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">CPF</div>
                    <div>{formatCPF(v.cpf ?? "") || "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Data de Nascimento</div>
                    <div>{v.data_nascimento ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Data da Venda</div>
                    <div>{v.data_venda}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Vendedor</div>
                    <div>{v.vendedor_id}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Segmento</div>
                    <div>{v.produto}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Administradora</div>
                    <div>{v.administradora}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Tabela</div>
                    <div>{v.tabela ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Forma da Venda</div>
                    <div>{v.forma_venda}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Nº Proposta</div>
                    <div>{v.numero_proposta}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Valor</div>
                    <div>{currency(v.valor_venda || 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Status</div>
                    <div>{v.status}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Código</div>
                    <div>{v.codigo ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Grupo</div>
                    <div>{v.grupo ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Cota</div>
                    <div>{v.cota ?? "—"}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-gray-500">Descrição</div>
                    <div className="whitespace-pre-wrap">{v.descricao ?? "—"}</div>
                  </div>
                </div>
              );
            })()}
            <div className="text-right">
              <button className="px-4 py-2 rounded-xl border" onClick={() => setViewVendaModal({ open: false })}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {metaOverlay.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Cadastrar Meta</h3>
              <button onClick={() => setMetaOverlay({ open: false })} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Vendedor</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={metaForm.vendedor_id}
                  onChange={(e) => setMetaForm((p) => ({ ...p, vendedor_id: e.target.value }))}
                  disabled={!isAdmin}
                >
                  <option value="">Selecione</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome || u.email || u.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Ano</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={metaForm.ano}
                  onChange={(e) => setMetaForm((p) => ({ ...p, ano: Number(e.target.value) }))}
                >
                  {Array.from({ length: 6 }).map((_, i) => {
                    const y = new Date().getFullYear() - 1 + i;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m, i) => (
                <div key={i}>
                  <label className="text-sm text-gray-600">{m}</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border rounded-xl px-3 py-2"
                    value={metaForm.m[i]}
                    onChange={(e) =>
                      setMetaForm((p) => {
                        const arr = [...p.m];
                        arr[i] = Number(e.target.value || 0);
                        return { ...p, m: arr };
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-xl border" onClick={() => setMetaOverlay({ open: false })}>
                Cancelar
              </button>
              <button className="px-4 py-2 rounded-xl bg-[#A11C27] text-white hover:opacity-90" onClick={saveMeta}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Carteira;
